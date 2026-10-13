import type { Config, ProjectConfig } from './config.ts'
import { detectIntent, isRussian } from './commands.ts'
import { complete, LlmError, streamChat, type ChatMessage } from './llm.ts'
import type { Message, Store, Task } from './store.ts'

/** What the architect needs from the agent runner. */
export interface AgentControl {
  start(task: Task): void
  stopAll(): number
  statusLine(ru: boolean): string
  promptSummary(): string
}

export type ArchitectEvent =
  | { type: 'delta'; text: string }
  | { type: 'task'; task: Task }
  | { type: 'mode'; mode: 'spar' | 'listen' }
  | { type: 'error'; message: string }
  | { type: 'end' }

export type ProposedTask = { project: string | null; title: string; prompt: string }

// ---------------------------------------------------------------------------
// Parsing the model's reply

const THINK_OPEN = '<think>'
const THINK_CLOSE = '</think>'
const BLOCK_OPEN = '[[TASK'

/** Removes <think>…</think> sections. An unterminated <think> hides everything after it. */
function stripThink(text: string): string {
  let out = ''
  let i = 0
  while (i < text.length) {
    const open = text.indexOf(THINK_OPEN, i)
    if (open < 0) {
      out += text.slice(i)
      break
    }
    out += text.slice(i, open)
    const close = text.indexOf(THINK_CLOSE, open)
    if (close < 0) return out
    i = close + THINK_CLOSE.length
  }
  return out
}

/** Length of the longest suffix of `text` that is a proper prefix of `token` (case-insensitive). */
function partialSuffix(text: string, token: string): number {
  const t = text.toUpperCase()
  const k = token.toUpperCase()
  for (let n = Math.min(k.length - 1, t.length); n > 0; n--) {
    if (t.endsWith(k.slice(0, n))) return n
  }
  return 0
}

/**
 * Turns the model's raw stream into text that is safe to speak: hides reasoning tags and the
 * machine-readable task block, and holds back characters that might be the start of either.
 */
export class SpeechFilter {
  private raw = ''
  private emitted = 0

  get rawText(): string {
    return this.raw
  }

  private visible(final: boolean): string {
    let v = stripThink(this.raw)
    const block = v.toUpperCase().indexOf(BLOCK_OPEN)
    if (block >= 0) v = v.slice(0, block)
    else if (!final) v = v.slice(0, v.length - Math.max(partialSuffix(v, BLOCK_OPEN), partialSuffix(v, THINK_OPEN)))
    return v
  }

  push(chunk: string): string {
    this.raw += chunk
    const v = this.visible(false)
    if (v.length <= this.emitted) return ''
    const out = v.slice(this.emitted)
    this.emitted = v.length
    return out
  }

  finish(): string {
    const v = this.visible(true)
    const out = v.length > this.emitted ? v.slice(this.emitted) : ''
    this.emitted = Math.max(this.emitted, v.length)
    return out
  }
}

function attr(attrs: string, name: string): string | null {
  const m = attrs.match(new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s\\]]+))`, 'i'))
  return m ? (m[1] ?? m[2] ?? m[3] ?? '').trim() : null
}

/** Splits a reply into what should be spoken and an optional task proposal. */
export function parseReply(raw: string): { spoken: string; task: ProposedTask | null } {
  const text = stripThink(raw)
  const m = text.match(/\[\[\s*TASK\b([^\]]*)\]\]([\s\S]*?)(?:\[\[\s*\/\s*TASK\s*\]\]|$)/i)
  if (!m) return { spoken: text.trim(), task: null }
  const spoken = text.slice(0, m.index).trim()
  const body = m[2].trim()
  if (!body) return { spoken, task: null }
  const title = attr(m[1], 'title') || shortTitle(body)
  return { spoken, task: { project: attr(m[1], 'project'), title: title.slice(0, 80), prompt: body } }
}

export function shortTitle(text: string): string {
  const first = text.split(/\n/)[0].replace(/[#*`_]/g, '').trim()
  const words = first.split(/\s+/).slice(0, 8).join(' ')
  return words.length < first.length ? `${words}…` : words
}

// ---------------------------------------------------------------------------
// Prompts

function projectList(projects: ProjectConfig[], def: string): string {
  return projects.map(p => `- ${p.name}${p.name === def ? ' (default)' : ''}: ${p.description || 'no description'}`).join('\n')
}

export function systemPrompt(cfg: Config, store: Store, agents: AgentControl, now = new Date()): string {
  const memory = store.memory().trim()
  const prev = store.latestMinutes(1)[0]
  const prevMinutes = prev && prev.session !== store.session ? prev.markdown.trim() : ''
  return `You are the Architect inside Gain, a screenless voice companion. The user is walking outside with earphones.
They speak to you through dictation and hear your replies through text-to-speech. Nothing you write is shown on a screen.

Your role: a sparring partner for thinking, not a yes-man.
- Reply in the same language the user speaks (Russian or English).
- Keep every reply short: one to four sentences, under 80 words. Plain spoken language only:
  no markdown, no lists, no code, no emojis, no URLs.
- Ask at most one question per reply.
- When an idea has a weak spot, say so plainly and explain why. Offer a better alternative when you have one.
- Track what was decided. If the user contradicts an earlier decision, point it out.
- Dictation can garble words. If something sounds wrong, guess the meaning and check briefly.

Coding agents: the user has coding agents that change code on their home computer, each task on its own git branch.
When the conversation has produced a concrete piece of work an agent can do right now, propose it by ending your reply
with exactly this block (it is hidden from speech and shown as a card on the phone):
[[TASK project="<project name>" title="<five to eight word title>"]]
<instructions for the agent: the goal, where in the code if known, and how to tell it is done>
[[/TASK]]
In the spoken part, say in one sentence what you propose. Never claim a task is running: the user starts it by saying "go".
Propose at most one task per reply, and only when the work is concrete.

Projects:
${projectList(cfg.projects, cfg.defaultProject)}

Agents right now: ${agents.promptSummary()}

Today is ${now.toISOString().slice(0, 16).replace('T', ' ')} UTC.
${memory ? `\nWhat you remember about the user (long-term memory):\n${memory}\n` : ''}${prevMinutes ? `\nMinutes from your previous conversation:\n${prevMinutes}\n` : ''}`
}

/** Converts stored messages into chat turns; consecutive user notes are merged. */
export function historyToChat(messages: Message[]): ChatMessage[] {
  const out: ChatMessage[] = []
  for (const m of messages) {
    const content = m.role === 'user' && m.mode === 'listen' ? `(thinking aloud; you stayed silent) ${m.text}` : m.text
    const last = out[out.length - 1]
    if (last && last.role === m.role) last.content += `\n\n${content}`
    else out.push({ role: m.role, content })
  }
  return out
}

function transcript(messages: Message[]): string {
  return messages.map(m => `${m.role === 'user' ? 'User' : 'Architect'}: ${m.text}`).join('\n')
}

const MINUTES_PROMPT = `Write the minutes of this conversation between the user and their AI Architect.
Use the language the user spoke. Be concrete, short, and do not invent anything.
Use exactly these markdown sections (translate the headings if the user spoke Russian):
## Summary
(two or three sentences)
## Decisions
## Open questions
## Tasks
(tasks proposed or started for coding agents)
## Parked ideas
Write "none" under a section that has nothing.`

// ---------------------------------------------------------------------------

const PHRASES = {
  listening: ['Listening. Say "your turn" when you want my take.', 'Слушаю. Скажи «твоя очередь», когда захочешь моё мнение.'],
  ack: ['Mm-hm.', 'Угу.'],
  noTask: ['There is no task waiting. Describe the work, or start a sentence with "task:".', 'Нет задачи, которая ждёт запуска. Опиши работу или начни фразу со слова «задача:».'],
  dropped: ['Dropped it.', 'Отменил.'],
  remembered: ['Noted. I will remember that.', 'Запомнил.'],
  writingMinutes: ['Writing the minutes.', 'Пишу протокол.'],
  nothingToSum: ['We have not talked yet in this session.', 'В этой сессии мы ещё не говорили.'],
  modelDown: ['I cannot reach the model on your computer right now. Your words are saved.', 'Не могу достучаться до модели на компьютере. Твои слова сохранены.'],
}

function say(key: keyof typeof PHRASES, ru: boolean): string {
  return PHRASES[key][ru ? 1 : 0]
}

export class Architect {
  private cfg: Config
  private store: Store
  private agents: AgentControl
  /** Sessions whose minutes are being written in the background. */
  private minutesInFlight = new Set<number>()

  constructor(cfg: Config, store: Store, agents: AgentControl) {
    this.cfg = cfg
    this.store = store
    this.agents = agents
  }

  resolveProject(name: string | null): ProjectConfig {
    const found = name ? this.cfg.projects.find(p => p.name.toLowerCase() === name.toLowerCase()) : undefined
    return found ?? this.cfg.projects.find(p => p.name === this.cfg.defaultProject)!
  }

  latestProposed(): Task | undefined {
    return [...this.store.allTasks()].reverse().find(t => t.status === 'proposed')
  }

  /** Recent conversation, attached to agent prompts so "what we discussed" makes sense to the agent. */
  conversationContext(turns = 8): string {
    return transcript(this.store.sessionMessages().slice(-turns))
  }

  startTask(task: Task): Task {
    const t = this.store.updateTask(task.id, { status: 'queued' })
    this.agents.start(t)
    return t
  }

  async *handle(rawText: string, opts: { offline?: boolean; now?: Date } = {}): AsyncGenerator<ArchitectEvent> {
    const now = opts.now ?? new Date()
    const text = rawText.trim()
    if (!text) {
      yield { type: 'end' }
      return
    }
    const ended = this.store.touchSession(now, this.cfg.sessionGapMinutes)
    const intent = detectIntent(text)
    const ru = isRussian(text)
    const record = (mode = this.store.mode) => this.store.addMessage({ ts: now.toISOString(), role: 'user', text, mode, offline: opts.offline })

    switch (intent.kind) {
      case 'stopAll': {
        record()
        const n = this.agents.stopAll()
        yield { type: 'delta', text: ru ? `Остановил агентов: ${n}.` : `Stopped ${n} agent ${n === 1 ? 'task' : 'tasks'}.` }
        break
      }
      case 'listen': {
        this.store.setMode('listen')
        yield { type: 'mode', mode: 'listen' }
        if (intent.rest) {
          this.store.addMessage({ ts: now.toISOString(), role: 'user', text: intent.rest, mode: 'listen', offline: opts.offline })
          this.store.setPendingListenCount(this.store.pendingListenCount + 1)
        }
        yield { type: 'delta', text: say('listening', ru) }
        break
      }
      case 'remember': {
        record()
        this.store.remember(intent.text, now)
        yield { type: 'delta', text: say('remembered', ru) }
        break
      }
      case 'status': {
        record()
        yield { type: 'delta', text: this.agents.statusLine(ru) }
        break
      }
      case 'go': {
        record()
        const proposed = this.latestProposed()
        if (!proposed) {
          yield { type: 'delta', text: say('noTask', ru) }
          break
        }
        const t = this.startTask(proposed)
        yield { type: 'task', task: t }
        yield { type: 'delta', text: ru ? `Запускаю задачу ${t.num}: ${t.title}.` : `Starting task ${t.num}: ${t.title}.` }
        break
      }
      case 'cancel': {
        const proposed = this.latestProposed()
        if (!proposed) {
          yield* this.converse(text, ru, now, opts.offline)
          break
        }
        record()
        const t = this.store.updateTask(proposed.id, { status: 'dismissed' })
        yield { type: 'task', task: t }
        yield { type: 'delta', text: say('dropped', ru) }
        break
      }
      case 'task': {
        record()
        const known = intent.project ? this.cfg.projects.some(p => p.name.toLowerCase() === intent.project!.toLowerCase()) : false
        const project = this.resolveProject(known ? intent.project : null)
        // "Task for tomorrow: ..." names no project; keep the whole sentence as the instructions.
        const body = intent.project && !known ? `${intent.project}: ${intent.text}` : intent.text
        const created = this.store.createTask({ project: project.name, title: shortTitle(body), prompt: body, status: 'proposed' }, now)
        this.store.updateTask(created.id, { context: this.conversationContext() })
        const t = this.startTask(created)
        yield { type: 'task', task: t }
        yield {
          type: 'delta',
          text: ru ? `Запускаю задачу ${t.num} в проекте ${project.name}.` : `Starting task ${t.num} in ${project.name}.`,
        }
        break
      }
      case 'wrapUp': {
        record()
        if (this.store.sessionMessages().filter(m => m.role === 'user').length <= 1) {
          yield { type: 'delta', text: say('nothingToSum', ru) }
          break
        }
        yield { type: 'delta', text: `${say('writingMinutes', ru)} ` }
        try {
          const md = await this.writeMinutes(this.store.session)
          yield { type: 'delta', text: speakableSummary(md) }
        } catch (err) {
          yield { type: 'error', message: (err as Error).message }
          yield { type: 'delta', text: say('modelDown', ru) }
        }
        break
      }
      case 'yourTurn': {
        if (this.store.mode !== 'listen') {
          yield* this.converse(text, ru, now, opts.offline)
          break
        }
        this.store.setMode('spar')
        yield { type: 'mode', mode: 'spar' }
        if (intent.rest) this.store.addMessage({ ts: now.toISOString(), role: 'user', text: intent.rest, mode: 'spar', offline: opts.offline })
        this.store.setPendingListenCount(0)
        yield* this.reply(ru, 'The user has finished thinking aloud. In your reply, first restate their core idea in one sentence, then give your single strongest objection or question.')
        break
      }
      case 'say': {
        if (this.store.mode === 'listen') {
          record('listen')
          this.store.setPendingListenCount(this.store.pendingListenCount + 1)
          yield { type: 'delta', text: say('ack', ru) }
          break
        }
        yield* this.converse(text, ru, now, opts.offline)
        break
      }
    }
    yield { type: 'end' }
    if (ended !== null) this.minutesInBackground(ended)
  }

  private async *converse(text: string, ru: boolean, now: Date, offline?: boolean): AsyncGenerator<ArchitectEvent> {
    this.store.addMessage({ ts: now.toISOString(), role: 'user', text, mode: 'spar', offline })
    yield* this.reply(ru)
  }

  /** Streams a model reply to the current session and records it. */
  private async *reply(ru: boolean, extraInstruction?: string): AsyncGenerator<ArchitectEvent> {
    const history = this.store.sessionMessages().slice(-this.cfg.contextTurns)
    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt(this.cfg, this.store, this.agents) },
      ...historyToChat(history),
    ]
    if (extraInstruction) messages.push({ role: 'system', content: extraInstruction })
    const filter = new SpeechFilter()
    let spokenSoFar = ''
    try {
      for await (const chunk of streamChat(this.cfg.llm, messages)) {
        const speak = filter.push(chunk)
        if (speak) {
          spokenSoFar += speak
          yield { type: 'delta', text: speak }
        }
      }
    } catch (err) {
      const message = err instanceof LlmError ? err.message : `Model request failed: ${(err as Error).message}`
      yield { type: 'error', message }
      yield { type: 'delta', text: say('modelDown', ru) }
      return
    }
    const rest = filter.finish()
    if (rest) {
      spokenSoFar += rest
      yield { type: 'delta', text: rest }
    }
    const { spoken, task } = parseReply(filter.rawText)
    let recorded = spoken
    if (task) {
      const project = this.resolveProject(task.project)
      const t = this.store.createTask({ project: project.name, title: task.title, prompt: task.prompt, status: 'proposed' })
      this.store.updateTask(t.id, { context: this.conversationContext() })
      yield { type: 'task', task: t }
      const suffix = ru ? `Задача готова: «${t.title}». Скажи «давай», чтобы запустить.` : `Task ready: "${t.title}". Say "go" to start it.`
      yield { type: 'delta', text: `${spokenSoFar && !/\s$/.test(spokenSoFar) ? ' ' : ''}${suffix}` }
      recorded += `\n[Proposed task ${t.num} for ${project.name}: ${t.title}]`
    }
    if (recorded.trim()) this.store.addMessage({ ts: new Date().toISOString(), role: 'assistant', text: recorded.trim(), mode: 'spar' })
  }

  async writeMinutes(session: number): Promise<string> {
    const messages = this.store.sessionMessages(session)
    const started = messages[0]?.ts ?? new Date().toISOString()
    const body = await complete(this.cfg.llm, [
      { role: 'system', content: MINUTES_PROMPT },
      { role: 'user', content: transcript(messages).slice(-24_000) },
    ])
    const md = `# Session ${session} · ${started.slice(0, 16).replace('T', ' ')} UTC\n\n${stripThink(body).trim()}\n`
    this.store.saveMinutes(session, md)
    return md
  }

  /** Writes minutes for a finished session without blocking the conversation. */
  minutesInBackground(session: number): void {
    if (this.store.hasMinutes(session) || this.minutesInFlight.has(session)) return
    if (this.store.sessionMessages(session).filter(m => m.role === 'user').length < 2) return
    this.minutesInFlight.add(session)
    this.writeMinutes(session)
      .catch(err => console.warn(`[gain] minutes for session ${session} failed: ${(err as Error).message}`))
      .finally(() => this.minutesInFlight.delete(session))
  }
}

/** The "Summary" section of the minutes as plain sentences, for speaking. */
export function speakableSummary(md: string): string {
  const lines = md.split('\n')
  const start = lines.findIndex(l => /^##\s/.test(l))
  const section: string[] = []
  for (const l of lines.slice(start + 1)) {
    if (/^##\s/.test(l)) break
    section.push(l)
  }
  const text = section.join(' ').replace(/[#*_`>-]+/g, ' ').replace(/\s+/g, ' ').trim()
  return text || md.replace(/[#*_`>-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 400)
}

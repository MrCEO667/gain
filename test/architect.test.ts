import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { Architect, historyToChat, parseReply, SpeechFilter, speakableSummary, type AgentControl, type ArchitectEvent } from '../src/architect.ts'
import { Store, type Task } from '../src/store.ts'
import { startFakeOllama } from './fixtures/fake-ollama.ts'
import { makeRepo, testConfig } from './fixtures/helpers.ts'

function feed(chunks: string[]): { spoken: string; filter: SpeechFilter } {
  const filter = new SpeechFilter()
  let spoken = ''
  for (const c of chunks) spoken += filter.push(c)
  spoken += filter.finish()
  return { spoken, filter }
}

test('speech filter hides the task block even when it arrives in pieces', () => {
  const { spoken, filter } = feed(['Good idea. Let me queue it', '. [', '[TA', 'SK project="gain" title="Add dark mode"]]\nAdd a toggle.\n[[/TASK]]'])
  assert.equal(spoken.trim(), 'Good idea. Let me queue it.')
  const parsed = parseReply(filter.rawText)
  assert.equal(parsed.spoken, 'Good idea. Let me queue it.')
  assert.deepEqual(parsed.task, { project: 'gain', title: 'Add dark mode', prompt: 'Add a toggle.' })
})

test('speech filter hides reasoning tags', () => {
  const { spoken } = feed(['<thi', 'nk>secret plan</think>', 'Short answer.'])
  assert.equal(spoken, 'Short answer.')
  assert.equal(feed(['<think>never closed']).spoken, '')
})

test('a lone bracket that is not a task block is still spoken', () => {
  assert.equal(feed(['Use arr[', '0] here.']).spoken, 'Use arr[0] here.')
})

test('parseReply tolerates a missing closing tag and missing title', () => {
  const r = parseReply('Sure.\n[[TASK project=demo]]\nWrite tests for the parser module\nthen run them')
  assert.equal(r.spoken, 'Sure.')
  assert.equal(r.task?.project, 'demo')
  assert.equal(r.task?.title, 'Write tests for the parser module')
  assert.equal(parseReply('Nothing to do here.').task, null)
  assert.equal(parseReply('Hmm [[TASK title="x"]] [[/TASK]]').task, null)
})

test('history merges consecutive user notes and marks listen-mode ones', () => {
  const chat = historyToChat([
    { ts: '', role: 'user', text: 'one', mode: 'listen', session: 1 },
    { ts: '', role: 'user', text: 'two', mode: 'spar', session: 1 },
    { ts: '', role: 'assistant', text: 'reply', mode: 'spar', session: 1 },
  ])
  assert.equal(chat.length, 2)
  assert.match(chat[0].content, /thinking aloud.*one\n\ntwo/s)
})

test('speakableSummary reads the first section', () => {
  const md = '# Session 1\n\n## Summary\nWe chose **TypeScript**.\nShip Friday.\n## Decisions\n- none'
  assert.equal(speakableSummary(md), 'We chose TypeScript . Ship Friday.')
})

// ---------------------------------------------------------------------------

class FakeAgents implements AgentControl {
  started: Task[] = []
  stopped = 0
  start(task: Task) {
    this.started.push(task)
  }
  stopAll() {
    this.stopped++
    return 2
  }
  statusLine() {
    return 'all quiet'
  }
  promptSummary() {
    return 'idle'
  }
}

const ollama = await startFakeOllama()
after(() => ollama.close())

async function collect(gen: AsyncGenerator<ArchitectEvent>): Promise<{ text: string; events: ArchitectEvent[] }> {
  const events: ArchitectEvent[] = []
  for await (const ev of gen) events.push(ev)
  return { text: events.filter(e => e.type === 'delta').map(e => (e as { text: string }).text).join(''), events }
}

function setup() {
  const cfg = testConfig({ repo: makeRepo(), llmUrl: ollama.url })
  const store = new Store(cfg.dataDir)
  const agents = new FakeAgents()
  return { cfg, store, agents, architect: new Architect(cfg, store, agents) }
}

test('a normal message streams the model reply and records both sides', async () => {
  const { store, architect } = setup()
  ollama.setReply(['Why ', 'walk?'])
  const { text } = await collect(architect.handle('I want to build a walking app'))
  assert.equal(text, 'Why walk?')
  const msgs = store.sessionMessages()
  assert.deepEqual(msgs.map(m => m.role), ['user', 'assistant'])
  const req = ollama.requests.at(-1) as { messages: { role: string; content: string }[]; think?: boolean; options: { num_ctx: number } }
  assert.equal(req.think, false)
  assert.equal(req.options.num_ctx, 8192)
  assert.match(req.messages[0].content, /sparring partner/)
  assert.match(req.messages[0].content, /demo \(default\)/)
})

test('a proposed task becomes a card and starts on "go"', async () => {
  const { store, agents, architect } = setup()
  ollama.setReply(['Let us add tests. [[TASK project="demo" title="Add parser tests"]]\nWrite tests.\n[[/TASK]]'])
  const first = await collect(architect.handle('We need tests for the parser'))
  assert.match(first.text, /^Let us add tests\. Task ready: "Add parser tests"\. Say "go" to start it\.$/)
  const proposed = store.allTasks().find(t => t.status === 'proposed')
  assert.ok(proposed)
  assert.match(proposed.context ?? '', /We need tests for the parser/)

  const go = await collect(architect.handle('Go!'))
  assert.match(go.text, /Starting task 1: Add parser tests/)
  assert.equal(agents.started.length, 1)
  assert.equal(store.getTask(proposed.id)?.status, 'queued')

  const again = await collect(architect.handle('go'))
  assert.match(again.text, /no task waiting/)
})

test('listen mode stays quiet until "your turn"', async () => {
  const { store, architect } = setup()
  const a = await collect(architect.handle('Just listen. Onboarding feels slow'))
  assert.match(a.text, /Listening/)
  assert.equal(store.mode, 'listen')
  const requestsBefore = ollama.requests.length
  const b = await collect(architect.handle('Maybe three screens is too many'))
  assert.equal(b.text, 'Mm-hm.')
  assert.equal(ollama.requests.length, requestsBefore, 'no model call in listen mode')
  ollama.setReply(['You want fewer screens. What breaks if you cut one?'])
  const c = await collect(architect.handle('Your turn'))
  assert.match(c.text, /fewer screens/)
  assert.equal(store.mode, 'spar')
  const req = ollama.requests.at(-1) as { messages: { role: string; content: string }[] }
  assert.ok(req.messages.some(m => m.role === 'user' && m.content.includes('Onboarding feels slow') && m.content.includes('three screens')))
})

test('direct task, remember, stop all and Russian replies', async () => {
  const { store, agents, architect } = setup()
  const t = await collect(architect.handle('Задача для demo: добавить README'))
  assert.match(t.text, /Запускаю задачу 1 в проекте demo/)
  assert.equal(agents.started[0].project, 'demo')

  const unknown = await collect(architect.handle('Task for tomorrow: buy milk'))
  assert.match(unknown.text, /Starting task 2 in demo/)
  assert.equal(agents.started[1].prompt, 'tomorrow: buy milk')

  const r = await collect(architect.handle('Remember that I walk at 7am'))
  assert.match(r.text, /Noted/)
  assert.match(store.memory(), /I walk at 7am/)

  const s = await collect(architect.handle('Stop all'))
  assert.equal(s.text, 'Stopped 2 agent tasks.')
  assert.equal(agents.stopped, 1)
})

test('when the model is down the user hears it and the message is kept', async () => {
  const { cfg, store, agents } = setup()
  cfg.llm.baseUrl = 'http://127.0.0.1:9'
  const architect = new Architect(cfg, store, agents)
  const { text, events } = await collect(architect.handle('Hello?'))
  assert.match(text, /cannot reach the model/)
  assert.ok(events.some(e => e.type === 'error'))
  assert.equal(store.sessionMessages().filter(m => m.role === 'user').length, 1)
})

test('wrap up writes minutes and speaks the summary', async () => {
  const { store, architect } = setup()
  ollama.setReply(['Fine.'])
  await collect(architect.handle('Let us build the PWA first'))
  ollama.setReply(['## Summary\nPWA first, native later.\n## Decisions\n- PWA first'])
  const { text } = await collect(architect.handle('Wrap up'))
  assert.match(text, /Writing the minutes\. PWA first, native later\./)
  assert.equal(store.latestMinutes(1)[0].session, store.session)
})

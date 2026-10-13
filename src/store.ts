import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import path from 'node:path'

export type Mode = 'spar' | 'listen'

export type Message = {
  ts: string
  role: 'user' | 'assistant'
  text: string
  mode: Mode
  session: number
  /** Sent from the phone's offline queue after the connection came back. */
  offline?: boolean
}

export type TaskStatus = 'proposed' | 'queued' | 'running' | 'done' | 'failed' | 'stopped' | 'dismissed'

export type Task = {
  id: string
  num: number
  project: string
  title: string
  prompt: string
  /** Recent conversation, attached to the agent's instructions for reference. */
  context?: string
  status: TaskStatus
  createdAt: string
  startedAt?: string
  endedAt?: string
  branch?: string
  worktree?: string
  baseRef?: string
  exitCode?: number | null
  commits?: { sha: string; subject: string }[]
  diffStat?: string
  check?: { ok: boolean; output: string }
  error?: string
  logFile?: string
}

type State = {
  mode: Mode
  session: number
  sessionStartedAt: string
  lastMessageAt: string
  nextTaskNum: number
  minutesDone: number[]
  /** Notes said in "just listen" mode that the architect has not answered yet. */
  pendingListenCount: number
}

const DEFAULT_STATE: State = {
  mode: 'spar',
  session: 0,
  sessionStartedAt: '',
  lastMessageAt: '',
  nextTaskNum: 1,
  minutesDone: [],
  pendingListenCount: 0,
}

function writeAtomic(file: string, data: string): void {
  const tmp = `${file}.${process.pid}.tmp`
  writeFileSync(tmp, data, 'utf8')
  renameSync(tmp, file)
}

export class Store {
  readonly dir: string
  private messages: Message[] = []
  private tasks: Task[] = []
  private state: State

  constructor(dir: string) {
    this.dir = dir
    for (const sub of ['', 'minutes', 'logs', 'prompts']) mkdirSync(path.join(dir, sub), { recursive: true })
    this.state = { ...DEFAULT_STATE, ...this.readJson<Partial<State>>('state.json', {}) }
    this.tasks = this.readJson<Task[]>('tasks.json', [])
    const convo = path.join(dir, 'conversation.jsonl')
    if (existsSync(convo)) {
      for (const line of readFileSync(convo, 'utf8').split('\n')) {
        if (!line.trim()) continue
        try {
          this.messages.push(JSON.parse(line) as Message)
        } catch {
          // A torn last line after a crash is not worth failing startup over.
        }
      }
    }
    // Tasks that were running when the server stopped did not finish.
    let changed = false
    for (const t of this.tasks) {
      if (t.status === 'running' || t.status === 'queued') {
        t.status = 'stopped'
        t.error = 'Gain restarted while this task was in progress.'
        t.endedAt ??= new Date().toISOString()
        changed = true
      }
    }
    if (changed) this.saveTasks()
  }

  private readJson<T>(name: string, fallback: T): T {
    const file = path.join(this.dir, name)
    if (!existsSync(file)) return fallback
    try {
      return JSON.parse(readFileSync(file, 'utf8')) as T
    } catch {
      return fallback
    }
  }

  token(): string {
    const file = path.join(this.dir, 'token.txt')
    if (existsSync(file)) {
      const t = readFileSync(file, 'utf8').trim()
      if (t) return t
    }
    const t = randomBytes(18).toString('base64url')
    writeFileSync(file, `${t}\n`, { encoding: 'utf8', mode: 0o600 })
    return t
  }

  // ---- state ----

  get mode(): Mode {
    return this.state.mode
  }

  setMode(mode: Mode): void {
    this.state.mode = mode
    this.saveState()
  }

  get session(): number {
    return this.state.session
  }

  get pendingListenCount(): number {
    return this.state.pendingListenCount
  }

  setPendingListenCount(n: number): void {
    this.state.pendingListenCount = n
    this.saveState()
  }

  /**
   * Starts a new session if the conversation has been quiet for longer than `gapMinutes`.
   * Returns the previous session number when a new one began, otherwise null.
   */
  touchSession(now: Date, gapMinutes: number): number | null {
    const last = this.state.lastMessageAt ? Date.parse(this.state.lastMessageAt) : 0
    let ended: number | null = null
    if (!last || now.getTime() - last > gapMinutes * 60_000) {
      if (this.state.session > 0) ended = this.state.session
      this.state.session += 1
      this.state.sessionStartedAt = now.toISOString()
      this.state.pendingListenCount = 0
      if (this.state.mode === 'listen') this.state.mode = 'spar'
    }
    this.state.lastMessageAt = now.toISOString()
    this.saveState()
    return ended
  }

  markMinutesDone(session: number): void {
    if (!this.state.minutesDone.includes(session)) this.state.minutesDone.push(session)
    this.saveState()
  }

  hasMinutes(session: number): boolean {
    return this.state.minutesDone.includes(session)
  }

  private saveState(): void {
    writeAtomic(path.join(this.dir, 'state.json'), JSON.stringify(this.state, null, 2))
  }

  // ---- conversation ----

  addMessage(msg: Omit<Message, 'session'>): Message {
    const full: Message = { ...msg, session: this.state.session }
    this.messages.push(full)
    appendFileSync(path.join(this.dir, 'conversation.jsonl'), `${JSON.stringify(full)}\n`, 'utf8')
    return full
  }

  sessionMessages(session = this.state.session): Message[] {
    return this.messages.filter(m => m.session === session)
  }

  recentMessages(limit: number): Message[] {
    return this.messages.slice(-limit)
  }

  // ---- memory ----

  memory(): string {
    const file = path.join(this.dir, 'memory.md')
    return existsSync(file) ? readFileSync(file, 'utf8') : ''
  }

  remember(fact: string, now = new Date()): void {
    const file = path.join(this.dir, 'memory.md')
    if (!existsSync(file)) writeFileSync(file, '# What the architect remembers\n\nEdit this file freely. One fact per line.\n\n', 'utf8')
    appendFileSync(file, `- ${fact.trim()} _(${now.toISOString().slice(0, 10)})_\n`, 'utf8')
  }

  // ---- minutes ----

  minutesFile(session: number): string {
    return path.join(this.dir, 'minutes', `session-${String(session).padStart(4, '0')}.md`)
  }

  saveMinutes(session: number, markdown: string): void {
    writeAtomic(this.minutesFile(session), markdown)
    this.markMinutesDone(session)
  }

  /** Most recent minutes first. */
  latestMinutes(count: number): { session: number; markdown: string }[] {
    const dir = path.join(this.dir, 'minutes')
    return readdirSync(dir)
      .filter(f => /^session-\d+\.md$/.test(f))
      .sort()
      .reverse()
      .slice(0, count)
      .map(f => ({ session: Number(f.match(/\d+/)![0]), markdown: readFileSync(path.join(dir, f), 'utf8') }))
  }

  // ---- tasks ----

  allTasks(): Task[] {
    return this.tasks
  }

  getTask(id: string): Task | undefined {
    return this.tasks.find(t => t.id === id)
  }

  createTask(fields: Pick<Task, 'project' | 'title' | 'prompt' | 'status'>, now = new Date()): Task {
    const num = this.state.nextTaskNum++
    const task: Task = { id: `t${num}`, num, createdAt: now.toISOString(), ...fields }
    this.tasks.push(task)
    this.saveState()
    this.saveTasks()
    return task
  }

  updateTask(id: string, patch: Partial<Task>): Task {
    const task = this.getTask(id)
    if (!task) throw new Error(`No task ${id}`)
    Object.assign(task, patch)
    this.saveTasks()
    return task
  }

  private saveTasks(): void {
    writeAtomic(path.join(this.dir, 'tasks.json'), JSON.stringify(this.tasks, null, 2))
  }

  promptFile(taskId: string): string {
    return path.join(this.dir, 'prompts', `${taskId}.md`)
  }

  logFile(taskId: string): string {
    return path.join(this.dir, 'logs', `${taskId}.log`)
  }
}

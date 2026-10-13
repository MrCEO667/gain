import { execFile, spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { appendFileSync, createWriteStream, existsSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import type { AgentControl } from './architect.ts'
import { isRussian } from './commands.ts'
import type { Config, ProjectConfig } from './config.ts'
import type { Store, Task } from './store.ts'

const IS_WINDOWS = process.platform === 'win32'
const TAIL = 4000

export function git(cwd: string, args: string[], timeoutMs = 60_000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd, maxBuffer: 20 * 1024 * 1024, windowsHide: true, timeout: timeoutMs }, (err, stdout, stderr) => {
      if (err) reject(new Error(`git ${args.join(' ')} failed: ${(stderr || err.message).trim()}`))
      else resolve(stdout)
    })
  })
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
    .replace(/-+$/, '')
}

const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')

/** Finds an executable the way Windows does (PATH × PATHEXT) so .cmd shims are detected. */
export function resolveCommand(cmd: string, env: NodeJS.ProcessEnv = process.env, windows = IS_WINDOWS): { file: string; shell: boolean } {
  if (!windows) return { file: cmd, shell: false }
  const exts = (env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean)
  const hasExt = path.extname(cmd) !== ''
  const candidates = /[\\/]/.test(cmd) ? [''] : (env.PATH ?? env.Path ?? '').split(';').filter(Boolean)
  for (const dir of candidates) {
    for (const ext of hasExt ? [''] : exts) {
      const full = dir ? path.join(dir, cmd + ext) : cmd + ext
      try {
        if (statSync(full).isFile()) return { file: full, shell: /\.(cmd|bat)$/i.test(full) }
      } catch {
        // not here
      }
    }
  }
  return { file: cmd, shell: /\.(cmd|bat)$/i.test(cmd) }
}

/** Quotes one argument for cmd.exe. Only used for config-controlled arguments. */
function quoteForCmd(arg: string): string {
  if (/^[\w\-./:\\=@]+$/.test(arg)) return arg
  return `"${arg.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, '$1$1')}"`
}

export function fillTemplate(args: string[], values: Record<string, string>): string[] {
  return args.map(a => a.replace(/\{(promptFile|prompt|title|worktree)\}/g, (_, k: string) => values[k] ?? ''))
}

function killTree(child: ChildProcess, signal: NodeJS.Signals): void {
  if (child.pid === undefined || child.exitCode !== null) return
  if (IS_WINDOWS) {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true })
    return
  }
  try {
    process.kill(-child.pid, signal)
  } catch {
    try {
      child.kill(signal)
    } catch {
      // already gone
    }
  }
}

type Running = {
  id: string
  child: ChildProcess | null
  stop: 'user' | 'timeout' | null
  tail: string
}

export class AgentRunner extends EventEmitter implements AgentControl {
  private cfg: Config
  private store: Store
  private queue: string[] = []
  private running: Running | null = null

  constructor(cfg: Config, store: Store) {
    super()
    this.cfg = cfg
    this.store = store
  }

  get activeTaskId(): string | null {
    return this.running?.id ?? null
  }

  get liveTail(): string {
    return this.running?.tail ?? ''
  }

  start(task: Task): void {
    if (!this.queue.includes(task.id) && this.running?.id !== task.id) this.queue.push(task.id)
    this.store.updateTask(task.id, { status: 'queued' })
    this.emitTask(task.id)
    void this.pump()
  }

  stopAll(): number {
    let n = 0
    for (const id of this.queue.splice(0)) {
      this.store.updateTask(id, { status: 'stopped', endedAt: new Date().toISOString(), error: 'Stopped before it started.' })
      this.emitTask(id)
      n++
    }
    if (this.running) {
      n++
      this.running.stop = 'user'
      const child = this.running.child
      if (child) {
        killTree(child, 'SIGTERM')
        setTimeout(() => killTree(child, 'SIGKILL'), 5000).unref()
      }
    }
    return n
  }

  private emitTask(id: string, announce?: string): void {
    const task = this.store.getTask(id)
    if (task) this.emit('task', task, announce)
  }

  private async pump(): Promise<void> {
    if (this.running) return
    const id = this.queue.shift()
    if (!id) return
    this.running = { id, child: null, stop: null, tail: '' }
    try {
      await this.run(id)
    } catch (err) {
      this.store.updateTask(id, { status: 'failed', endedAt: new Date().toISOString(), error: (err as Error).message })
      this.emitTask(id, this.announcement(this.store.getTask(id)!))
    } finally {
      this.running = null
      void this.pump()
    }
  }

  private project(name: string): ProjectConfig {
    const p = this.cfg.projects.find(x => x.name === name)
    if (!p) throw new Error(`Project "${name}" is not in gain.config.json.`)
    return p
  }

  private async prepareWorktree(task: Task, project: ProjectConfig): Promise<{ worktree: string; branch: string; baseRef: string }> {
    if (!existsSync(project.path)) throw new Error(`Project folder ${project.path} does not exist.`)
    await git(project.path, ['rev-parse', '--show-toplevel']).catch(() => {
      throw new Error(`${project.path} is not a git repository. Run "git init" there and make a first commit.`)
    })
    let base = project.baseBranch
    if (!base) {
      base = (await git(project.path, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim()
      if (base === 'HEAD') base = (await git(project.path, ['rev-parse', 'HEAD'])).trim()
    }
    const baseRef = (await git(project.path, ['rev-parse', '--verify', `${base}^{commit}`]).catch(() => {
      throw new Error(`Branch "${base}" has no commits in ${project.name}. Make a first commit.`)
    })).trim()

    // Agent tools leave caches like .aider.tags.cache in the worktree; keep them out of commits.
    const common = path.resolve(project.path, (await git(project.path, ['rev-parse', '--git-common-dir'])).trim())
    const exclude = path.join(common, 'info', 'exclude')
    mkdirSync(path.dirname(exclude), { recursive: true })
    const current = existsSync(exclude) ? readFileSync(exclude, 'utf8') : ''
    if (!current.split(/\r?\n/).includes('.aider*')) appendFileSync(exclude, `${current && !current.endsWith('\n') ? '\n' : ''}.aider*\n`)

    const slug = slugify(task.title)
    let branch = `gain/${task.id}${slug ? `-${slug}` : ''}`
    for (let i = 2; await git(project.path, ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`]).then(() => true, () => false); i++) {
      branch = `gain/${task.id}${slug ? `-${slug}` : ''}-${i}`
    }
    mkdirSync(this.cfg.worktreesDir, { recursive: true })
    const worktree = path.join(this.cfg.worktreesDir, `${project.name}-${task.id}`)
    if (existsSync(worktree)) throw new Error(`Worktree folder ${worktree} already exists. Remove it and try again.`)
    await git(project.path, ['worktree', 'add', '-b', branch, worktree, baseRef])
    return { worktree, branch, baseRef }
  }

  private writePrompt(task: Task, project: ProjectConfig): string {
    const file = this.store.promptFile(task.id)
    const parts = [
      `# Task ${task.num}: ${task.title}`,
      '',
      task.prompt.trim(),
      '',
      '## Rules',
      `- You are working in a git worktree of the project "${project.name}" on its own branch. Stay inside this folder.`,
      '- Keep the change small and focused on this task. Do not refactor unrelated code.',
      '- Do not run shell commands that install software, delete files outside this folder, or touch the network.',
      '- Commit your changes with a clear message when you are done.',
    ]
    if (task.context?.trim()) {
      parts.push('', '## Conversation that led to this task (for reference only)', '', task.context.trim())
    }
    writeFileSync(file, `${parts.join('\n')}\n`, 'utf8')
    return file
  }

  private async run(id: string): Promise<void> {
    const task = this.store.getTask(id)!
    const project = this.project(task.project)
    const startedAt = new Date().toISOString()
    this.store.updateTask(id, { status: 'running', startedAt, error: undefined })
    this.emitTask(id)

    const { worktree, branch, baseRef } = await this.prepareWorktree(task, project)
    const logFile = this.store.logFile(id)
    this.store.updateTask(id, { worktree, branch, baseRef, logFile })
    const promptFile = this.writePrompt(task, project)

    const exitCode = await this.spawnAgent(task, worktree, promptFile, logFile)
    const stop = this.running?.stop ?? null

    // Some agents leave changes uncommitted; commit them so the branch holds everything.
    const dirty = (await git(worktree, ['status', '--porcelain'])).trim()
    if (dirty) {
      await git(worktree, ['add', '-A'])
      await git(worktree, ['-c', 'user.name=Gain', '-c', 'user.email=gain@localhost', 'commit', '--no-verify', '-m', `gain ${task.id}: uncommitted agent changes`])
    }
    const commits = (await git(worktree, ['log', '--format=%h%x09%s', `${baseRef}..HEAD`]))
      .split('\n').filter(Boolean).map(l => {
        const [sha, ...rest] = l.split('\t')
        return { sha, subject: rest.join('\t') }
      })
    const diffStat = (await git(worktree, ['diff', '--shortstat', baseRef, 'HEAD'])).trim()

    let status: Task['status'] = stop === 'user' ? 'stopped' : exitCode === 0 ? 'done' : 'failed'
    let error: string | undefined
    if (stop === 'timeout') error = `Timed out after ${this.cfg.agent.timeoutMinutes} minutes.`
    else if (status === 'failed') error = `Agent exited with code ${exitCode}. Last output: ${stripAnsi(this.running?.tail ?? '').trim().slice(-300)}`
    else if (status === 'done' && commits.length === 0) {
      status = 'failed'
      error = 'The agent finished without changing anything.'
    }

    let check: Task['check']
    if (status === 'done' && project.check.length) check = await this.runCheck(project.check, worktree)

    this.store.updateTask(id, { status, endedAt: new Date().toISOString(), exitCode, commits, diffStat, check, error })
    this.emitTask(id, this.announcement(this.store.getTask(id)!))
  }

  private spawnAgent(task: Task, worktree: string, promptFile: string, logFile: string): Promise<number | null> {
    const [cmd, ...template] = this.cfg.agent.command
    const args = fillTemplate(template, { promptFile, prompt: task.prompt, title: task.title, worktree })
    const { file, shell } = resolveCommand(cmd)
    if (shell && template.some(a => /\{(prompt|title)\}/.test(a))) {
      throw new Error(`"${cmd}" is a Windows .cmd script, so the task text cannot be passed safely as an argument. Use {promptFile} or "stdinPrompt": true in gain.config.json.`)
    }
    const log = createWriteStream(logFile, { flags: 'a' })
    log.write(`$ ${[cmd, ...args].join(' ')}\n# cwd: ${worktree}\n\n`)
    const env = { ...process.env, ...this.cfg.agent.env, GAIN_TASK_ID: task.id, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' }
    const opts = { cwd: worktree, env, windowsHide: true, detached: !IS_WINDOWS }
    const child = shell
      ? spawn([file, ...args].map(quoteForCmd).join(' '), { ...opts, shell: true, stdio: ['pipe', 'pipe', 'pipe'] as const })
      : spawn(file, args, { ...opts, stdio: ['pipe', 'pipe', 'pipe'] as const })
    const running = this.running!
    running.child = child

    const onData = (buf: Buffer) => {
      log.write(buf)
      running.tail = (running.tail + stripAnsi(buf.toString('utf8'))).slice(-TAIL)
    }
    child.stdout?.on('data', onData)
    child.stderr?.on('data', onData)
    child.stdin?.on('error', () => {})
    if (this.cfg.agent.stdinPrompt) child.stdin?.end(readFileSync(promptFile, 'utf8'))
    else child.stdin?.end()

    const timer = setTimeout(() => {
      running.stop = 'timeout'
      killTree(child, 'SIGTERM')
      setTimeout(() => killTree(child, 'SIGKILL'), 5000).unref()
    }, this.cfg.agent.timeoutMinutes * 60_000)

    return new Promise((resolve, reject) => {
      child.on('error', err => {
        clearTimeout(timer)
        log.end()
        const code = (err as NodeJS.ErrnoException).code
        reject(new Error(code === 'ENOENT' ? `Agent command "${cmd}" was not found. Install it or change agent.command in gain.config.json.` : `Could not start the agent: ${err.message}`))
      })
      child.on('close', code => {
        clearTimeout(timer)
        log.end(`\n# exit code: ${code}\n`)
        resolve(code)
      })
    })
  }

  private runCheck(command: string[], cwd: string): Promise<{ ok: boolean; output: string }> {
    const [cmd, ...args] = command
    const { file, shell } = resolveCommand(cmd)
    return new Promise(resolve => {
      const line = [file, ...args].map(quoteForCmd).join(' ')
      const child = shell
        ? spawn(line, { cwd, shell: true, windowsHide: true })
        : spawn(file, args, { cwd, windowsHide: true, detached: !IS_WINDOWS })
      let out = ''
      const add = (b: Buffer) => (out = (out + stripAnsi(b.toString('utf8'))).slice(-TAIL))
      child.stdout?.on('data', add)
      child.stderr?.on('data', add)
      const timer = setTimeout(() => killTree(child, 'SIGKILL'), 10 * 60_000)
      child.on('error', err => {
        clearTimeout(timer)
        resolve({ ok: false, output: `Could not run check: ${err.message}` })
      })
      child.on('close', code => {
        clearTimeout(timer)
        resolve({ ok: code === 0, output: out.trim().slice(-2000) })
      })
    })
  }

  announcement(task: Task): string {
    const ru = isRussian(`${task.title} ${task.prompt}`)
    const n = task.commits?.length ?? 0
    const files = task.diffStat?.match(/(\d+) files? changed/)?.[1] ?? '0'
    if (task.status === 'done') {
      const check = task.check ? (task.check.ok ? (ru ? ' Проверки прошли.' : ' Checks passed.') : (ru ? ' Проверки упали.' : ' Checks failed.')) : ''
      return ru
        ? `Задача ${task.num} готова: ${task.title}. Коммитов: ${n}, файлов: ${files}.${check}`
        : `Task ${task.num} is done: ${task.title}. ${n} ${n === 1 ? 'commit' : 'commits'}, ${files} ${files === '1' ? 'file' : 'files'} changed.${check}`
    }
    if (task.status === 'stopped') return ru ? `Задача ${task.num} остановлена.` : `Task ${task.num} was stopped.`
    const why = (task.error ?? '').split('. Last output:')[0]
    return ru ? `Задача ${task.num} не получилась. ${why}` : `Task ${task.num} failed. ${why}`
  }

  statusLine(ru: boolean): string {
    const parts: string[] = []
    if (this.running) {
      const t = this.store.getTask(this.running.id)!
      const mins = t.startedAt ? Math.max(0, Math.round((Date.now() - Date.parse(t.startedAt)) / 60_000)) : 0
      parts.push(ru ? `Работает задача ${t.num}: ${t.title}, уже ${mins} мин.` : `Task ${t.num} is running: ${t.title}, for ${mins} min.`)
    }
    if (this.queue.length) parts.push(ru ? `В очереди: ${this.queue.length}.` : `${this.queue.length} queued.`)
    const last = [...this.store.allTasks()].reverse().find(t => ['done', 'failed', 'stopped'].includes(t.status))
    if (last) parts.push(this.announcement(last))
    if (!parts.length) return ru ? 'Агенты сейчас ничего не делают.' : 'No agents are working right now.'
    return parts.join(' ')
  }

  promptSummary(): string {
    const parts: string[] = []
    if (this.running) {
      const t = this.store.getTask(this.running.id)!
      parts.push(`task ${t.num} "${t.title}" is running`)
    }
    if (this.queue.length) parts.push(`${this.queue.length} queued`)
    const recent = this.store.allTasks().filter(t => ['done', 'failed', 'stopped'].includes(t.status)).slice(-3)
    for (const t of recent) parts.push(`task ${t.num} "${t.title}" ${t.status}${t.commits?.length ? ` (${t.commits.length} commits)` : ''}`)
    const proposed = this.store.allTasks().filter(t => t.status === 'proposed').slice(-1)[0]
    if (proposed) parts.push(`task ${proposed.num} "${proposed.title}" is proposed and waiting for the user to say go`)
    return parts.length ? parts.join('; ') : 'idle, no tasks yet'
  }
}

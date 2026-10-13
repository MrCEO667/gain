import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { timingSafeEqual } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { networkInterfaces } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { AgentRunner, resolveCommand } from './agents.ts'
import { Architect } from './architect.ts'
import { buildBrief } from './brief.ts'
import { loadConfig, ROOT, type Config } from './config.ts'
import { warmUp } from './llm.ts'
import { Store, type Task } from './store.ts'

const VERSION = (JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as { version: string }).version
const PUBLIC = path.join(ROOT, 'public')
const MAX_BODY = 64 * 1024

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
}

const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'",
}

class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** Task as sent to the phone: without the long conversation context. */
function publicTask(t: Task): Omit<Task, 'context'> {
  const { context: _context, ...rest } = t
  return rest
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...SECURITY_HEADERS })
  res.end(JSON.stringify(body))
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  let size = 0
  const chunks: Buffer[] = []
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length
    if (size > MAX_BODY) throw new HttpError(413, 'Request too large')
    chunks.push(chunk)
  }
  if (!chunks.length) return {}
  try {
    const v = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    return typeof v === 'object' && v ? (v as Record<string, unknown>) : {}
  } catch {
    throw new HttpError(400, 'Body must be JSON')
  }
}

function serveStatic(req: IncomingMessage, res: ServerResponse, pathname: string): void {
  const rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '')
  const file = path.resolve(PUBLIC, rel)
  if (!file.startsWith(PUBLIC + path.sep) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404, { 'content-type': 'text/plain', ...SECURITY_HEADERS })
    res.end('Not found')
    return
  }
  const ext = path.extname(file)
  res.writeHead(200, {
    'content-type': MIME[ext] ?? 'application/octet-stream',
    'cache-control': ext === '.png' || ext === '.svg' ? 'public, max-age=86400' : 'no-cache',
    ...SECURITY_HEADERS,
  })
  res.end(req.method === 'HEAD' ? undefined : readFileSync(file))
}

export type App = { server: Server; store: Store; runner: AgentRunner; architect: Architect; token: string; cfg: Config }

export function createApp(cfg: Config): App {
  const store = new Store(cfg.dataDir)
  const token = store.token()
  const runner = new AgentRunner(cfg, store)
  const architect = new Architect(cfg, store, runner)
  const expected = Buffer.from(token)
  const sseClients = new Set<ServerResponse>()

  const authorized = (req: IncomingMessage, url: URL): boolean => {
    const header = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1]
    const given = Buffer.from(header ?? url.searchParams.get('token') ?? '')
    return given.length === expected.length && timingSafeEqual(given, expected)
  }

  const broadcast = (event: string, data: unknown) => {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
    for (const client of sseClients) client.write(payload)
  }
  runner.on('task', (task: Task, announce?: string) => broadcast('task', { task: publicTask(task), announce }))

  // One utterance at a time keeps the conversation in order.
  let turn: Promise<unknown> = Promise.resolve()
  const exclusive = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = turn.then(fn, fn)
    turn = run.catch(() => {})
    return run
  }

  const state = () => ({
    version: VERSION,
    mode: store.mode,
    session: store.session,
    model: cfg.llm.model,
    agent: cfg.agent.command[0],
    projects: cfg.projects.map(p => ({ name: p.name, description: p.description })),
    defaultProject: cfg.defaultProject,
    activeTaskId: runner.activeTaskId,
    tasks: store.allTasks().slice(-30).map(publicTask),
  })

  async function api(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
    const route = `${req.method} ${url.pathname}`
    if (route === 'GET /api/state') return sendJson(res, 200, state())

    if (route === 'GET /api/history') {
      const limit = Math.min(200, Number(url.searchParams.get('limit')) || 40)
      return sendJson(res, 200, { messages: store.recentMessages(limit) })
    }

    if (route === 'POST /api/say') {
      const body = await readJson(req)
      const text = typeof body.text === 'string' ? body.text.slice(0, 8000) : ''
      if (!text.trim()) throw new HttpError(400, 'text is required')
      res.writeHead(200, { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store', 'x-accel-buffering': 'no', ...SECURITY_HEADERS })
      await exclusive(async () => {
        for await (const ev of architect.handle(text, { offline: body.offline === true })) {
          const out = ev.type === 'task' ? { ...ev, task: publicTask(ev.task) } : ev
          if (!res.destroyed) res.write(`${JSON.stringify(out)}\n`)
          if (ev.type === 'mode') broadcast('mode', { mode: ev.mode })
        }
      })
      res.end()
      return
    }

    const taskAction = url.pathname.match(/^\/api\/tasks\/(t\d+)\/(start|dismiss|log)$/)
    if (taskAction) {
      const task = store.getTask(taskAction[1])
      if (!task) throw new HttpError(404, 'No such task')
      const action = taskAction[2]
      if (action === 'log' && req.method === 'GET') {
        const file = task.logFile && existsSync(task.logFile) ? task.logFile : null
        const text = file ? readFileSync(file, 'utf8').slice(-20_000) : ''
        return sendJson(res, 200, { log: runner.activeTaskId === task.id ? runner.liveTail || text : text })
      }
      if (req.method !== 'POST') throw new HttpError(405, 'Use POST')
      if (task.status !== 'proposed') throw new HttpError(409, `Task ${task.num} is already ${task.status}`)
      if (action === 'start') return sendJson(res, 200, { task: publicTask(architect.startTask(task)) })
      const t = store.updateTask(task.id, { status: 'dismissed' })
      broadcast('task', { task: publicTask(t) })
      return sendJson(res, 200, { task: publicTask(t) })
    }

    if (route === 'POST /api/stop-all') return sendJson(res, 200, { stopped: runner.stopAll() })

    if (route === 'POST /api/mode') {
      const body = await readJson(req)
      if (body.mode !== 'spar' && body.mode !== 'listen') throw new HttpError(400, 'mode must be spar or listen')
      store.setMode(body.mode)
      broadcast('mode', { mode: body.mode })
      return sendJson(res, 200, { mode: body.mode })
    }

    if (route === 'GET /api/brief') return sendJson(res, 200, { markdown: buildBrief(cfg, store) })

    if (route === 'POST /api/minutes') {
      if (!store.sessionMessages().length) throw new HttpError(409, 'Nothing has been said in this session yet')
      const markdown = await exclusive(() => architect.writeMinutes(store.session))
      return sendJson(res, 200, { markdown })
    }

    if (route === 'POST /api/warmup') {
      warmUp(cfg.llm).catch(err => console.warn(`[gain] warm-up failed: ${(err as Error).message}`))
      return sendJson(res, 200, { ok: true })
    }

    if (route === 'GET /api/events') {
      res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no', ...SECURITY_HEADERS })
      res.write(`retry: 3000\nevent: hello\ndata: ${JSON.stringify(state())}\n\n`)
      sseClients.add(res)
      const ping = setInterval(() => res.write(': ping\n\n'), 20_000)
      req.on('close', () => {
        clearInterval(ping)
        sseClients.delete(res)
      })
      return
    }

    throw new HttpError(404, 'Unknown API route')
  }

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://gain.local')
    if (!url.pathname.startsWith('/api/')) {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405).end()
        return
      }
      serveStatic(req, res, url.pathname)
      return
    }
    if (!authorized(req, url)) return sendJson(res, 401, { error: 'Missing or wrong access token. Open the link Gain printed when it started.' })
    api(req, res, url).catch(err => {
      const status = err instanceof HttpError ? err.status : 500
      if (status === 500) console.error('[gain]', err)
      if (res.headersSent) res.end()
      else sendJson(res, status, { error: (err as Error).message })
    })
  })
  server.on('close', () => {
    for (const c of sseClients) c.end()
  })
  return { server, store, runner, architect, token, cfg }
}

// ---------------------------------------------------------------------------
// Startup

function commandOnPath(cmd: string): boolean {
  if (process.platform === 'win32') return resolveCommand(cmd).file !== cmd || existsSync(cmd)
  if (cmd.includes('/')) return existsSync(cmd)
  return (process.env.PATH ?? '').split(':').some(dir => dir && existsSync(path.join(dir, cmd)))
}

async function preflight(cfg: Config): Promise<void> {
  if (!commandOnPath('git')) console.warn('! git was not found. Install Git (https://git-scm.com) — agents need it.')
  if (!commandOnPath(cfg.agent.command[0])) {
    console.warn(`! Agent command "${cfg.agent.command[0]}" was not found on PATH. Tasks will fail until it is installed (see docs/mvp-setup.md).`)
  }
  for (const p of cfg.projects) {
    if (!existsSync(path.join(p.path, '.git'))) console.warn(`! Project "${p.name}" at ${p.path} is not a git repository.`)
  }
  if (cfg.llm.provider === 'ollama') {
    try {
      const res = await fetch(`${cfg.llm.baseUrl.replace(/\/+$/, '')}/api/tags`, { signal: AbortSignal.timeout(3000) })
      const { models } = (await res.json()) as { models?: { name: string }[] }
      const names = (models ?? []).map(m => m.name)
      const has = names.some(n => n === cfg.llm.model || n === `${cfg.llm.model}:latest`)
      if (!has) console.warn(`! Ollama is running but "${cfg.llm.model}" is not installed. Run: ollama pull ${cfg.llm.model}`)
      else warmUp(cfg.llm).catch(() => {})
    } catch {
      console.warn(`! Cannot reach Ollama at ${cfg.llm.baseUrl}. Start the Ollama app (or run "ollama serve").`)
    }
  }
}

function lanAddresses(): string[] {
  return Object.values(networkInterfaces())
    .flat()
    .filter((i): i is NonNullable<typeof i> => !!i && i.family === 'IPv4' && !i.internal)
    .map(i => i.address)
}

async function main(): Promise<void> {
  const [major, minor] = process.versions.node.split('.').map(Number)
  if (major < 22 || (major === 22 && minor < 18)) {
    console.error(`Gain needs Node.js 22.18 or newer (you have ${process.versions.node}). Install the LTS from https://nodejs.org`)
    process.exit(1)
  }
  const cfg = loadConfig()
  const app = createApp(cfg)
  await preflight(cfg)
  app.server.listen(cfg.port, cfg.host, () => {
    const q = `?token=${app.token}`
    console.log(`\nGain ${VERSION} is running.\n`)
    console.log(`  On this computer:  http://127.0.0.1:${cfg.port}/${q}`)
    if (cfg.host === '0.0.0.0') for (const ip of lanAddresses()) console.log(`  On your Wi-Fi:     http://${ip}:${cfg.port}/${q}`)
    console.log(`  On your iPhone:    run "tailscale serve --bg ${cfg.port}" once, then open`)
    console.log(`                     https://<this-computer>.<your-tailnet>.ts.net/${q}`)
    console.log(`\n  Model: ${cfg.llm.model} (${cfg.llm.provider}) · Agent: ${cfg.agent.command[0]} · Projects: ${cfg.projects.map(p => p.name).join(', ')}`)
    console.log('  Press Ctrl+C to stop. Running agent tasks are stopped too.\n')
  })
  app.server.on('error', err => {
    console.error(`Could not start the server: ${err.message}`)
    process.exit(1)
  })
  const shutdown = () => {
    const n = app.runner.stopAll()
    if (n) console.log(`Stopping ${n} agent task(s)…`)
    app.server.close()
    setTimeout(() => process.exit(0), n ? 1500 : 100).unref()
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => {
    console.error((err as Error).message)
    process.exit(1)
  })
}

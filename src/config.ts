import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export type LlmConfig = {
  /** "ollama" uses Ollama's native /api/chat; "openai" uses any OpenAI-compatible /chat/completions. */
  provider: 'ollama' | 'openai'
  baseUrl: string
  model: string
  apiKey: string
  /** Ollama only: ask thinking models (e.g. qwen3) to skip the hidden reasoning step. Faster replies. */
  think: boolean
  temperature: number
  /** Ollama only: context window in tokens. Ollama's default is small and silently truncates. */
  numCtx: number
  timeoutSeconds: number
}

export type AgentConfig = {
  /**
   * Command and arguments for the coding agent. Placeholders:
   * {promptFile} path to a file with the task text (preferred, safe on Windows),
   * {prompt} the task text itself, {title} the task title, {worktree} the task's working folder.
   */
  command: string[]
  /** Write the task text to the agent's stdin instead of (or as well as) placeholders. */
  stdinPrompt: boolean
  env: Record<string, string>
  timeoutMinutes: number
}

export type ProjectConfig = {
  name: string
  path: string
  /** Branch the agent starts from. Empty means whatever the repo has checked out. */
  baseBranch: string
  description: string
  /** Optional command run in the task's worktree after the agent finishes, e.g. ["npm", "test"]. */
  check: string[]
}

export type Config = {
  host: string
  port: number
  dataDir: string
  worktreesDir: string
  llm: LlmConfig
  agent: AgentConfig
  projects: ProjectConfig[]
  defaultProject: string
  /** Conversation turns sent to the model as context. */
  contextTurns: number
  /** Minutes of silence after which a new conversation session starts. */
  sessionGapMinutes: number
}

export const DEFAULT_AGENT_COMMAND = [
  'aider',
  '--model', 'ollama_chat/qwen2.5-coder:7b',
  '--yes-always',
  '--no-suggest-shell-commands',
  '--no-detect-urls',
  '--no-gitignore',
  '--no-show-model-warnings',
  '--no-check-update',
  '--no-show-release-notes',
  '--analytics-disable',
  '--no-pretty',
  '--no-stream',
  '--no-fancy-input',
  '--message-file', '{promptFile}',
]

export function defaultConfig(root = ROOT): Config {
  return {
    host: '127.0.0.1',
    port: 8787,
    dataDir: path.join(root, 'data'),
    worktreesDir: path.join(root, 'data', 'worktrees'),
    llm: {
      provider: 'ollama',
      baseUrl: 'http://127.0.0.1:11434',
      model: 'qwen3:8b',
      apiKey: '',
      think: false,
      temperature: 0.7,
      numCtx: 8192,
      timeoutSeconds: 120,
    },
    agent: {
      command: DEFAULT_AGENT_COMMAND,
      stdinPrompt: false,
      env: { OLLAMA_API_BASE: 'http://127.0.0.1:11434' },
      timeoutMinutes: 30,
    },
    projects: [
      {
        name: 'gain',
        path: root,
        baseBranch: '',
        description: 'Gain itself: the voice companion server and phone app you are talking through.',
        check: ['npm', 'test'],
      },
    ],
    defaultProject: 'gain',
    contextTurns: 30,
    sessionGapMinutes: 45,
  }
}

type Json = Record<string, unknown>

function isObject(v: unknown): v is Json {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Deep-merges plain objects; arrays and scalars from `override` replace the defaults. */
function merge<T>(base: T, override: unknown): T {
  if (!isObject(base) || !isObject(override)) return (override === undefined ? base : override) as T
  const out: Json = { ...base }
  for (const [k, v] of Object.entries(override)) {
    out[k] = k in out ? merge(out[k], v) : v
  }
  return out as T
}

export function loadConfig(file = path.join(ROOT, 'gain.config.json'), root = ROOT): Config {
  const base = defaultConfig(root)
  if (!existsSync(file)) return base
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'))
  } catch (err) {
    throw new Error(`Could not read ${file}: ${(err as Error).message}`)
  }
  const cfg = merge(base, raw)
  const dir = path.dirname(file)
  cfg.dataDir = path.resolve(dir, cfg.dataDir)
  cfg.worktreesDir = path.resolve(dir, cfg.worktreesDir)
  cfg.projects = cfg.projects.map(p => ({
    name: String(p.name),
    path: path.resolve(dir, p.path),
    baseBranch: p.baseBranch ?? '',
    description: p.description ?? '',
    check: Array.isArray(p.check) ? p.check.map(String) : [],
  }))
  validate(cfg)
  return cfg
}

export function validate(cfg: Config): void {
  const problems: string[] = []
  if (!['ollama', 'openai'].includes(cfg.llm.provider)) problems.push('llm.provider must be "ollama" or "openai"')
  if (!cfg.llm.model) problems.push('llm.model is empty')
  if (!Array.isArray(cfg.agent.command) || cfg.agent.command.length === 0) problems.push('agent.command must be a non-empty array')
  if (cfg.projects.length === 0) problems.push('at least one project is required')
  const names = new Set<string>()
  for (const p of cfg.projects) {
    if (!/^[\w.-]+$/.test(p.name)) problems.push(`project name "${p.name}" may only use letters, digits, ".", "_" and "-"`)
    if (names.has(p.name.toLowerCase())) problems.push(`duplicate project name "${p.name}"`)
    names.add(p.name.toLowerCase())
  }
  if (!cfg.projects.some(p => p.name === cfg.defaultProject)) problems.push(`defaultProject "${cfg.defaultProject}" is not in projects`)
  if (problems.length) throw new Error(`Invalid gain.config.json:\n- ${problems.join('\n- ')}`)
}

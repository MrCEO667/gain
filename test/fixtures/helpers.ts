import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defaultConfig, type Config } from '../../src/config.ts'

export const FAKE_AGENT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fake-agent.mjs')

export function tempDir(prefix = 'gain-test-'): string {
  return mkdtempSync(path.join(tmpdir(), prefix))
}

/** A git repo with one commit on "main". */
export function makeRepo(): string {
  const dir = tempDir('gain-repo-')
  const git = (...args: string[]) => execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@test', ...args], { cwd: dir })
  git('init', '-q', '-b', 'main')
  writeFileSync(path.join(dir, 'README.md'), '# demo\n')
  git('add', '.')
  git('commit', '-q', '-m', 'init')
  return dir
}

export function testConfig(opts: { repo: string; llmUrl?: string; agentArgs?: string[]; check?: string[] }): Config {
  const data = tempDir('gain-data-')
  const cfg = defaultConfig(data)
  cfg.dataDir = data
  cfg.worktreesDir = path.join(data, 'worktrees')
  cfg.llm.baseUrl = opts.llmUrl ?? 'http://127.0.0.1:9'
  cfg.llm.model = 'fake'
  cfg.llm.timeoutSeconds = 5
  cfg.agent.command = [process.execPath, FAKE_AGENT, ...(opts.agentArgs ?? ['{promptFile}'])]
  cfg.agent.env = {}
  cfg.agent.timeoutMinutes = 1
  cfg.projects = [{ name: 'demo', path: opts.repo, baseBranch: '', description: 'A demo repo', check: opts.check ?? [] }]
  cfg.defaultProject = 'demo'
  return cfg
}

export async function waitFor<T>(fn: () => T | undefined | null | false, timeoutMs = 10_000): Promise<T> {
  const start = Date.now()
  for (;;) {
    const v = fn()
    if (v) return v
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out')
    await new Promise(r => setTimeout(r, 50))
  }
}

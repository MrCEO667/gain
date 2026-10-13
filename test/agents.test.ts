import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { AgentRunner, fillTemplate, resolveCommand, slugify } from '../src/agents.ts'
import { Store, type Task } from '../src/store.ts'
import { makeRepo, testConfig, waitFor } from './fixtures/helpers.ts'

const finished = (s: Task['status']) => ['done', 'failed', 'stopped'].includes(s)

function setup(mode: string, opts: { check?: string[] } = {}) {
  process.env.FAKE_AGENT_MODE = mode
  const repo = makeRepo()
  const cfg = testConfig({ repo, check: opts.check })
  const store = new Store(cfg.dataDir)
  const runner = new AgentRunner(cfg, store)
  const announcements: string[] = []
  runner.on('task', (_t: Task, announce?: string) => announce && announcements.push(announce))
  const task = store.createTask({ project: 'demo', title: 'Add a note file', prompt: 'Write AGENT_NOTE.md', status: 'proposed' })
  return { repo, cfg, store, runner, task, announcements }
}

test('helpers', () => {
  assert.equal(slugify('Add Dark-Mode toggle!'), 'add-dark-mode-toggle')
  assert.equal(slugify('Добавить тему'), '')
  assert.deepEqual(fillTemplate(['-f', '{promptFile}', '--t={title}'], { promptFile: '/p.md', title: 'X' }), ['-f', '/p.md', '--t=X'])
  assert.deepEqual(resolveCommand('aider', {}, false), { file: 'aider', shell: false })
})

test('a task runs in its own worktree and branch, never touching the main checkout', async () => {
  const { repo, store, runner, task, announcements } = setup('commit')
  runner.start(task)
  const t = await waitFor(() => finished(store.getTask(task.id)!.status) && store.getTask(task.id)!)
  assert.equal(t.status, 'done', t.error)
  assert.match(t.branch!, /^gain\/t1-add-a-note-file$/)
  assert.equal(t.commits?.length, 1)
  assert.equal(t.commits?.[0].subject, 'Add agent note')
  assert.match(t.diffStat!, /1 file changed/)
  assert.ok(existsSync(path.join(t.worktree!, 'AGENT_NOTE.md')))
  assert.ok(!existsSync(path.join(repo, 'AGENT_NOTE.md')), 'main checkout untouched')
  const prompt = readFileSync(store.promptFile(task.id), 'utf8')
  assert.match(prompt, /# Task 1: Add a note file/)
  assert.match(announcements.at(-1)!, /Task 1 is done: Add a note file\. 1 commit, 1 file changed\./)
  const branchFiles = execFileSync('git', ['ls-tree', '-r', '--name-only', t.branch!], { cwd: repo, encoding: 'utf8' })
  assert.doesNotMatch(branchFiles, /aider/)
})

test('uncommitted agent changes are committed, tool caches are not', async () => {
  const { repo, store, runner, task } = setup('dirty')
  runner.start(task)
  const t = await waitFor(() => finished(store.getTask(task.id)!.status) && store.getTask(task.id)!)
  assert.equal(t.status, 'done', t.error)
  assert.equal(t.commits?.[0].subject, 'gain t1: uncommitted agent changes')
  const files = execFileSync('git', ['ls-tree', '-r', '--name-only', t.branch!], { cwd: repo, encoding: 'utf8' })
  assert.match(files, /AGENT_NOTE\.md/)
  assert.doesNotMatch(files, /aider/)
})

test('a failing agent and an agent that changes nothing are both reported as failed', async () => {
  const a = setup('fail')
  a.runner.start(a.task)
  const ta = await waitFor(() => finished(a.store.getTask(a.task.id)!.status) && a.store.getTask(a.task.id)!)
  assert.equal(ta.status, 'failed')
  assert.match(ta.error!, /exited with code 3/)

  const b = setup('noop')
  b.runner.start(b.task)
  const tb = await waitFor(() => finished(b.store.getTask(b.task.id)!.status) && b.store.getTask(b.task.id)!)
  assert.equal(tb.status, 'failed')
  assert.match(tb.error!, /without changing anything/)
})

test('stop all kills a running agent and clears the queue', async () => {
  const { store, runner, task } = setup('sleep')
  const second = store.createTask({ project: 'demo', title: 'Second', prompt: 'x', status: 'proposed' })
  runner.start(task)
  runner.start(second)
  await waitFor(() => store.getTask(task.id)!.status === 'running' && runner.liveTail.includes('fake agent'))
  assert.equal(runner.stopAll(), 2)
  const t = await waitFor(() => finished(store.getTask(task.id)!.status) && store.getTask(task.id)!)
  assert.equal(t.status, 'stopped')
  assert.equal(store.getTask(second.id)!.status, 'stopped')
})

test('the project check runs after the agent and its result is recorded', async () => {
  const { store, runner, task } = setup('commit', { check: [process.execPath, '-e', 'process.exit(require("fs").existsSync("AGENT_NOTE.md") ? 0 : 1)'] })
  runner.start(task)
  const t = await waitFor(() => finished(store.getTask(task.id)!.status) && store.getTask(task.id)!)
  assert.equal(t.check?.ok, true)
})

test('a missing project folder fails cleanly', async () => {
  const { cfg, store, runner, task } = setup('commit')
  cfg.projects[0].path = path.join(cfg.dataDir, 'nope')
  runner.start(task)
  const t = await waitFor(() => finished(store.getTask(task.id)!.status) && store.getTask(task.id)!)
  assert.equal(t.status, 'failed')
  assert.match(t.error!, /does not exist/)
})

test('a restart marks unfinished tasks as stopped', () => {
  const { cfg, store, task } = setup('commit')
  store.updateTask(task.id, { status: 'running' })
  const reopened = new Store(cfg.dataDir)
  assert.equal(reopened.getTask(task.id)!.status, 'stopped')
})

import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import { after, before, test } from 'node:test'
import { createApp, type App } from '../src/server.ts'
import { startFakeOllama, type FakeOllama } from './fixtures/fake-ollama.ts'
import { makeRepo, testConfig, waitFor } from './fixtures/helpers.ts'

let ollama: FakeOllama
let app: App
let base: string

before(async () => {
  process.env.FAKE_AGENT_MODE = 'commit'
  ollama = await startFakeOllama()
  app = createApp(testConfig({ repo: makeRepo(), llmUrl: ollama.url }))
  await new Promise<void>(r => app.server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`
})

after(async () => {
  app.server.closeAllConnections()
  await new Promise(r => app.server.close(r))
  await ollama.close()
})

const auth = () => ({ authorization: `Bearer ${app.token}`, 'content-type': 'application/json' })

async function say(text: string): Promise<{ type: string; text?: string; task?: { id: string; status: string } }[]> {
  const res = await fetch(`${base}/api/say`, { method: 'POST', headers: auth(), body: JSON.stringify({ text }) })
  assert.equal(res.status, 200)
  assert.match(res.headers.get('content-type')!, /ndjson/)
  return (await res.text()).split('\n').filter(Boolean).map(l => JSON.parse(l))
}

test('the phone app is served without a token, the API is not', async () => {
  const page = await fetch(`${base}/`)
  assert.equal(page.status, 200)
  assert.match(await page.text(), /<title>Gain<\/title>/)
  assert.match(page.headers.get('content-security-policy')!, /default-src 'self'/)
  assert.equal((await fetch(`${base}/api/state`)).status, 401)
  assert.equal((await fetch(`${base}/api/state?token=wrong`)).status, 401)
  assert.equal((await fetch(`${base}/api/state?token=${app.token}`)).status, 200)
  assert.equal((await fetch(`${base}/../package.json`)).status, 404)
  assert.equal((await fetch(`${base}/%2e%2e/package.json`)).status, 404)
})

/** Reads server-sent "task" events (Node 22 has no global EventSource). */
async function listenForAnnouncements(out: string[], signal: AbortSignal): Promise<void> {
  const res = await fetch(`${base}/api/events?token=${app.token}`, { signal })
  const decoder = new TextDecoder()
  let buf = ''
  try {
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      buf += decoder.decode(chunk, { stream: true })
      let end: number
      while ((end = buf.indexOf('\n\n')) >= 0) {
        const block = buf.slice(0, end)
        buf = buf.slice(end + 2)
        if (!block.includes('event: task')) continue
        const data = block.split('\n').find(l => l.startsWith('data: '))!.slice(6)
        const { announce } = JSON.parse(data) as { announce?: string }
        if (announce) out.push(announce)
      }
    }
  } catch {
    // aborted at the end of the test
  }
}

test('talk, propose, go: the full loop ends with a commit on a branch', async () => {
  const abort = new AbortController()
  const announcements: string[] = []
  void listenForAnnouncements(announcements, abort.signal)
  try {
    ollama.setReply(['Agreed. ', '[[TASK project="demo" title="Add agent note"]]\nCreate AGENT_NOTE.md\n[[/TASK]]'])
    const first = await say('Let us add a note file')
    const spoken = first.filter(e => e.type === 'delta').map(e => e.text).join('')
    assert.equal(spoken, 'Agreed. Task ready: "Add agent note". Say "go" to start it.')
    const proposed = first.find(e => e.type === 'task')!.task!
    assert.equal(proposed.status, 'proposed')

    const go = await say('Go.')
    assert.ok(go.some(e => e.type === 'task' && ['queued', 'running'].includes(e.task?.status ?? '')))

    const done = await waitFor(() => {
      const t = app.store.getTask(proposed.id)!
      return ['done', 'failed'].includes(t.status) && t
    })
    assert.equal(done.status, 'done', done.error)
    await waitFor(() => announcements.length > 0)
    assert.match(announcements[0], /Task 1 is done/)

    const brief = await (await fetch(`${base}/api/brief`, { headers: auth() })).json() as { markdown: string }
    assert.match(brief.markdown, /## Ready to review/)
    assert.match(brief.markdown, /gain\/t1-add-agent-note/)

    const state = await (await fetch(`${base}/api/state`, { headers: auth() })).json() as { tasks: Record<string, unknown>[] }
    assert.ok(!('context' in state.tasks[0]), 'conversation context stays on the computer')
  } finally {
    abort.abort()
  }
})

test('mode switch, stop-all and validation', async () => {
  const mode = await fetch(`${base}/api/mode`, { method: 'POST', headers: auth(), body: JSON.stringify({ mode: 'listen' }) })
  assert.deepEqual(await mode.json(), { mode: 'listen' })
  const bad = await fetch(`${base}/api/mode`, { method: 'POST', headers: auth(), body: JSON.stringify({ mode: 'sing' }) })
  assert.equal(bad.status, 400)
  const stop = await fetch(`${base}/api/stop-all`, { method: 'POST', headers: auth() })
  assert.deepEqual(await stop.json(), { stopped: 0 })
  const empty = await fetch(`${base}/api/say`, { method: 'POST', headers: auth(), body: JSON.stringify({ text: '  ' }) })
  assert.equal(empty.status, 400)
  const notJson = await fetch(`${base}/api/say`, { method: 'POST', headers: auth(), body: 'hello' })
  assert.equal(notJson.status, 400)
})

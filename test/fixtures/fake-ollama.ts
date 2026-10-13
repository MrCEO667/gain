import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

export type FakeOllama = { server: Server; url: string; requests: unknown[]; setReply: (chunks: string[]) => void; close: () => Promise<void> }

/** Minimal stand-in for Ollama's /api/chat streaming endpoint. */
export async function startFakeOllama(chunks: string[] = ['Hello', ' there.']): Promise<FakeOllama> {
  let reply = chunks
  const requests: unknown[] = []
  const server = createServer(async (req, res) => {
    let body = ''
    for await (const c of req) body += c
    if (req.url === '/api/chat') {
      requests.push(JSON.parse(body))
      res.writeHead(200, { 'content-type': 'application/x-ndjson' })
      for (const c of reply) res.write(`${JSON.stringify({ message: { role: 'assistant', content: c }, done: false })}\n`)
      res.end(`${JSON.stringify({ message: { role: 'assistant', content: '' }, done: true })}\n`)
      return
    }
    if (req.url === '/api/tags') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ models: [{ name: 'fake:latest' }] }))
      return
    }
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end('{}')
  })
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
  const { port } = server.address() as AddressInfo
  return {
    server,
    url: `http://127.0.0.1:${port}`,
    requests,
    setReply: c => (reply = c),
    close: () => new Promise(r => server.close(() => r())),
  }
}

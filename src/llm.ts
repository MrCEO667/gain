import type { LlmConfig } from './config.ts'

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }

export class LlmError extends Error {}

/** Streams the model's reply as text chunks. Works with Ollama's native API or any OpenAI-compatible server. */
export async function* streamChat(cfg: LlmConfig, messages: ChatMessage[], signal?: AbortSignal): AsyncGenerator<string> {
  const timeout = AbortSignal.timeout(cfg.timeoutSeconds * 1000)
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout
  if (cfg.provider === 'ollama') yield* streamOllama(cfg, messages, combined)
  else yield* streamOpenAi(cfg, messages, combined)
}

export async function complete(cfg: LlmConfig, messages: ChatMessage[], signal?: AbortSignal): Promise<string> {
  let out = ''
  for await (const chunk of streamChat(cfg, messages, signal)) out += chunk
  return out
}

async function post(url: string, body: unknown, headers: Record<string, string>, signal: AbortSignal): Promise<Response> {
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal,
    })
  } catch (err) {
    if ((err as Error).name === 'TimeoutError') throw new LlmError('The model took too long to answer.')
    if ((err as Error).name === 'AbortError') throw err
    throw new LlmError(`Cannot reach the model at ${url} (${(err as Error).message}). Is it running?`)
  }
  return res
}

async function errorText(res: Response): Promise<string> {
  const text = await res.text().catch(() => '')
  try {
    const j = JSON.parse(text) as { error?: string | { message?: string } }
    if (typeof j.error === 'string') return j.error
    if (j.error?.message) return j.error.message
  } catch {
    // not JSON
  }
  return text.slice(0, 300) || res.statusText
}

async function* lines(res: Response): AsyncGenerator<string> {
  if (!res.body) return
  const decoder = new TextDecoder()
  let buf = ''
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    buf += decoder.decode(chunk, { stream: true })
    let nl: number
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim()
      buf = buf.slice(nl + 1)
      if (line) yield line
    }
  }
  buf += decoder.decode()
  if (buf.trim()) yield buf.trim()
}

async function* streamOllama(cfg: LlmConfig, messages: ChatMessage[], signal: AbortSignal): AsyncGenerator<string> {
  const url = `${cfg.baseUrl.replace(/\/+$/, '')}/api/chat`
  const body: Record<string, unknown> = {
    model: cfg.model,
    messages,
    stream: true,
    keep_alive: '30m',
    options: { temperature: cfg.temperature, num_ctx: cfg.numCtx },
  }
  if (!cfg.think) body.think = false
  let res = await post(url, body, {}, signal)
  if (!res.ok) {
    let msg = await errorText(res)
    // Models without a thinking mode reject the "think" field; retry once without it.
    if ('think' in body && /think/i.test(msg)) {
      delete body.think
      res = await post(url, body, {}, signal)
      if (!res.ok) msg = await errorText(res)
    }
    if (!res.ok) {
      if (res.status === 404 && /not found/i.test(msg)) {
        throw new LlmError(`Model "${cfg.model}" is not installed. Run: ollama pull ${cfg.model}`)
      }
      throw new LlmError(`Model error (${res.status}): ${msg}`)
    }
  }
  for await (const line of lines(res)) {
    let j: { message?: { content?: string }; error?: string; done?: boolean }
    try {
      j = JSON.parse(line)
    } catch {
      continue
    }
    if (j.error) throw new LlmError(`Model error: ${j.error}`)
    if (j.message?.content) yield j.message.content
    if (j.done) return
  }
}

async function* streamOpenAi(cfg: LlmConfig, messages: ChatMessage[], signal: AbortSignal): AsyncGenerator<string> {
  const url = `${cfg.baseUrl.replace(/\/+$/, '')}/chat/completions`
  const headers: Record<string, string> = cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {}
  const res = await post(url, { model: cfg.model, messages, stream: true, temperature: cfg.temperature }, headers, signal)
  if (!res.ok) throw new LlmError(`Model error (${res.status}): ${await errorText(res)}`)
  for await (const line of lines(res)) {
    if (!line.startsWith('data:')) continue
    const data = line.slice(5).trim()
    if (data === '[DONE]') return
    let j: { choices?: { delta?: { content?: string } }[]; error?: { message?: string } }
    try {
      j = JSON.parse(data)
    } catch {
      continue
    }
    if (j.error) throw new LlmError(`Model error: ${j.error.message ?? 'unknown'}`)
    const text = j.choices?.[0]?.delta?.content
    if (text) yield text
  }
}

/** Asks Ollama to load the model now so the first spoken reply is not delayed by a cold start. */
export async function warmUp(cfg: LlmConfig): Promise<void> {
  if (cfg.provider !== 'ollama') return
  const url = `${cfg.baseUrl.replace(/\/+$/, '')}/api/generate`
  await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: cfg.model, keep_alive: '30m' }),
    signal: AbortSignal.timeout(120_000),
  }).then(r => r.body?.cancel())
}

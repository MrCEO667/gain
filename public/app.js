// Gain phone app. Plain ES module, no build step.

const $ = id => document.getElementById(id)

// ---------------------------------------------------------------------------
// Persistent settings (per device). Storage can throw in private mode, so every access is guarded.

const DEFAULTS = {
  speak: true,
  announce: true,
  earcons: true,
  voiceEn: '',
  voiceRu: '',
  rate: 1.05,
  autoSend: true,
  delay: 2,
  mic: true,
  micLang: 'auto',
  awake: true,
  guard: true,
  guardDelay: 15,
}

function readLocal(key, fallback) {
  try {
    const v = localStorage.getItem(key)
    return v === null ? fallback : JSON.parse(v)
  } catch {
    return fallback
  }
}

function writeLocal(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // storage unavailable; settings last for this visit only
  }
}

const settings = { ...DEFAULTS, ...readLocal('gain.settings', {}) }
const saveSettings = () => writeLocal('gain.settings', settings)

// ---------------------------------------------------------------------------
// Access token. Kept in the URL in Safari so "Add to Home Screen" captures it;
// the home-screen app has its own storage and strips it from the address after saving.

const params = new URLSearchParams(location.search)
const standalone = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches
let token = params.get('token') || readLocal('gain.token', '')
if (params.get('token')) {
  writeLocal('gain.token', token)
  if (standalone) history.replaceState(null, '', location.pathname)
}

// ---------------------------------------------------------------------------
// State

const state = {
  mode: 'spar',
  tasks: new Map(),
  connected: false,
  walking: false,
  info: null,
}

// ---------------------------------------------------------------------------
// Small helpers

const escapeHtml = s => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const isRussian = s => {
  const cyr = (s.match(/[а-яё]/gi) || []).length
  return cyr > 0 && cyr * 2 >= (s.match(/[a-z]/gi) || []).length
}

function setConn(ok) {
  state.connected = ok
  $('conn').className = `dot ${ok ? 'ok' : 'bad'}`
}

function hint(text) {
  $('hint').textContent = text || ''
}

class ApiError extends Error {}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(opts.headers || {}) },
  })
  if (res.status === 401) {
    setConn(false)
    hint('Access token missing or wrong. Open the link Gain printed on your computer, or paste the token in Settings.')
    throw new ApiError('unauthorized')
  }
  if (!res.ok) {
    const j = await res.json().catch(() => ({}))
    throw new ApiError(j.error || `${res.status} ${res.statusText}`)
  }
  return res
}

// ---------------------------------------------------------------------------
// Sounds: tiny tones so you know a message left without looking.

let audioCtx = null
function unlockAudio() {
  if (!settings.earcons) return
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)()
    audioCtx.resume()
  } catch {
    audioCtx = null
  }
}

function tone(freq, ms, volume = 0.06) {
  if (!settings.earcons || !audioCtx) return
  try {
    const t = audioCtx.currentTime
    const osc = audioCtx.createOscillator()
    const gain = audioCtx.createGain()
    osc.frequency.value = freq
    gain.gain.setValueAtTime(volume, t)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000)
    osc.connect(gain).connect(audioCtx.destination)
    osc.start(t)
    osc.stop(t + ms / 1000 + 0.02)
  } catch {
    // ignore
  }
}
const sentTone = () => tone(880, 70)
const errorTone = () => tone(220, 220, 0.08)

// ---------------------------------------------------------------------------
// Speech output (iOS voices via speechSynthesis, into AirPods).

const synth = window.speechSynthesis
let voices = []

function rankVoice(v) {
  const id = `${v.name} ${v.voiceURI}`.toLowerCase()
  return (id.includes('premium') ? 3 : 0) + (id.includes('enhanced') ? 2 : 0) + (v.localService ? 1 : 0)
}

function loadVoices() {
  if (!synth) return
  voices = synth.getVoices()
  for (const [selectId, prefix, key] of [['setVoiceEn', 'en', 'voiceEn'], ['setVoiceRu', 'ru', 'voiceRu']]) {
    const sel = $(selectId)
    const list = voices.filter(v => v.lang.toLowerCase().startsWith(prefix)).sort((a, b) => rankVoice(b) - rankVoice(a))
    sel.innerHTML = '<option value="">Automatic</option>' + list.map(v => `<option value="${escapeHtml(v.voiceURI)}">${escapeHtml(v.name)} (${escapeHtml(v.lang)})</option>`).join('')
    sel.value = settings[key]
  }
}

function pickVoice(ru) {
  const chosen = settings[ru ? 'voiceRu' : 'voiceEn']
  const prefix = ru ? 'ru' : 'en'
  return voices.find(v => v.voiceURI === chosen) ||
    voices.filter(v => v.lang.toLowerCase().startsWith(prefix)).sort((a, b) => rankVoice(b) - rankVoice(a))[0] ||
    null
}

function cleanForSpeech(text) {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/https?:\/\/\S+/g, 'a link')
    .replace(/[*_`#>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function speak(text, { force = false } = {}) {
  if (!synth || (!settings.speak && !force)) return
  const clean = cleanForSpeech(text)
  if (!clean) return
  const ru = isRussian(clean)
  const u = new SpeechSynthesisUtterance(clean)
  const voice = pickVoice(ru)
  if (voice) u.voice = voice
  u.lang = voice ? voice.lang : ru ? 'ru-RU' : 'en-US'
  u.rate = Number(settings.rate) || 1
  synth.speak(u)
}

function stopSpeaking() {
  if (synth && (synth.speaking || synth.pending)) synth.cancel()
}

/** Collects streamed text and hands over whole sentences, so speech starts before the reply is complete. */
class SentenceBuffer {
  constructor(onSentence) {
    this.buf = ''
    this.onSentence = onSentence
  }
  push(text) {
    this.buf += text
    for (;;) {
      const m = this.buf.match(/^([\s\S]*?(?:[.!?…]+["»”)]?|\n))(\s+)/)
      if (!m) break
      if (m[1].trim()) this.onSentence(m[1])
      this.buf = this.buf.slice(m[0].length)
    }
  }
  flush() {
    if (this.buf.trim()) this.onSentence(this.buf)
    this.buf = ''
  }
}

// ---------------------------------------------------------------------------
// Transcript

const transcript = $('transcript')

function nearBottom() {
  return transcript.scrollHeight - transcript.scrollTop - transcript.clientHeight < 120
}

function addMsg(role, text, extraClass = '', meta = '') {
  const stick = nearBottom()
  const el = document.createElement('div')
  el.className = `msg ${role} ${extraClass}`.trim()
  el.textContent = text
  if (meta) {
    const m = document.createElement('span')
    m.className = 'meta'
    m.textContent = meta
    el.append(m)
  }
  transcript.append(el)
  if (stick) transcript.scrollTop = transcript.scrollHeight
  return el
}

const addSystem = (text, cls = '') => addMsg('system', text, cls)

async function loadHistory() {
  try {
    const res = await api('/api/history?limit=30')
    const { messages } = await res.json()
    transcript.innerHTML = ''
    for (const m of messages) addMsg(m.role, m.text, m.mode === 'listen' && m.role === 'user' ? 'listen' : '', m.offline ? 'sent from offline queue' : '')
    transcript.scrollTop = transcript.scrollHeight
  } catch {
    // shown via connection state
  }
}

// ---------------------------------------------------------------------------
// Talking to the architect

const input = $('input')
let outbox = readLocal('gain.outbox', [])
let flushing = false

function queueOffline(text) {
  outbox.push({ text, ts: new Date().toISOString() })
  writeLocal('gain.outbox', outbox)
  addSystem(`Saved offline (${outbox.length} waiting). It will be sent when the connection is back.`)
  speak(isRussian(text) ? 'Нет связи. Сохранил, отправлю позже.' : 'No connection. Saved, I will send it later.')
}

async function flushOutbox() {
  if (flushing || !outbox.length || !navigator.onLine) return
  flushing = true
  try {
    while (outbox.length) {
      const item = outbox[0]
      await streamSay(item.text, true)
      outbox.shift()
      writeLocal('gain.outbox', outbox)
    }
  } catch {
    // still offline; try again later
  } finally {
    flushing = false
  }
}

async function send(raw) {
  const text = (raw || '').trim()
  cancelAutoSend()
  if (!text) return
  input.value = ''
  autoResize()
  stopSpeaking()
  addMsg('user', text, state.mode === 'listen' ? 'listen' : '')
  sentTone()
  armGuard()
  if (!navigator.onLine) {
    queueOffline(text)
    return
  }
  try {
    await streamSay(text, false)
  } catch (err) {
    if (err instanceof TypeError) queueOffline(text)
    else if (!(err instanceof ApiError && err.message === 'unauthorized')) {
      addSystem(err.message, 'error')
      errorTone()
    }
  }
}

/** Posts one utterance and plays the streamed reply. Throws TypeError if the request never reached Gain. */
async function streamSay(text, offline) {
  const res = await api('/api/say', { method: 'POST', body: JSON.stringify({ text, offline }) })
  setConn(true)
  let bubble = null
  const sentences = new SentenceBuffer(s => speak(s))
  const handle = ev => {
    if (ev.type === 'delta') {
      bubble = bubble || addMsg('assistant', '')
      const stick = nearBottom()
      bubble.textContent += ev.text
      if (stick) transcript.scrollTop = transcript.scrollHeight
      sentences.push(ev.text)
    } else if (ev.type === 'task') {
      upsertTask(ev.task)
    } else if (ev.type === 'mode') {
      setMode(ev.mode)
    } else if (ev.type === 'error') {
      addSystem(ev.message, 'error')
      errorTone()
    } else if (ev.type === 'end') {
      sentences.flush()
    }
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      let nl
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim()
        buf = buf.slice(nl + 1)
        if (line) handle(JSON.parse(line))
      }
    }
  } catch {
    // The message reached Gain; only the reply was cut off. Do not queue it again.
    addSystem('Connection dropped during the reply. Your message was received.', 'error')
  }
  sentences.flush()
}

// ---------------------------------------------------------------------------
// Auto-send after dictation, plus spoken "send" words.

let autoTimer = null
const bar = $('autosendBar')
const TRIGGER = /(^|[.!?,;:]\s*)(over|send it|отправь|отправляй|приём|прием)[.!?]*\s*$/i

function cancelAutoSend() {
  clearTimeout(autoTimer)
  autoTimer = null
  bar.classList.remove('run')
  bar.style.transitionDuration = '0s'
}

function scheduleAutoSend() {
  cancelAutoSend()
  const text = input.value
  if (!text.trim()) return
  const m = text.match(TRIGGER)
  if (m) {
    const body = text.slice(0, m.index + m[1].length).trim()
    if (body) {
      send(body)
      return
    }
  }
  if (!settings.autoSend) return
  void bar.offsetWidth
  bar.style.transitionDuration = `${settings.delay}s`
  bar.classList.add('run')
  autoTimer = setTimeout(() => send(input.value), settings.delay * 1000)
}

function autoResize() {
  input.style.height = 'auto'
  input.style.height = `${Math.min(input.scrollHeight, 160)}px`
}

input.addEventListener('input', () => {
  stopSpeaking()
  autoResize()
  scheduleAutoSend()
  armGuard()
})
input.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault()
    send(input.value)
  }
})
input.addEventListener('focus', () => document.body.classList.add('typing'))
input.addEventListener('blur', () => document.body.classList.remove('typing'))
$('composer').addEventListener('submit', e => {
  e.preventDefault()
  send(input.value)
})

// ---------------------------------------------------------------------------
// Built-in mic (Web Speech API).

const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition
let recognition = null

function updateMicButton() {
  $('mic').hidden = !(Recognition && settings.mic)
}

$('mic').addEventListener('click', () => {
  if (recognition) {
    recognition.stop()
    return
  }
  stopSpeaking()
  cancelAutoSend()
  recognition = new Recognition()
  recognition.lang = settings.micLang === 'auto'
    ? (isRussian(input.value) ? 'ru-RU' : 'en-US')
    : settings.micLang
  recognition.interimResults = true
  recognition.continuous = true
  const base = input.value.trim() ? `${input.value.trim()} ` : ''
  recognition.onresult = e => {
    let t = ''
    for (const r of e.results) t += r[0].transcript
    input.value = base + t
    autoResize()
  }
  recognition.onerror = e => addSystem(`Mic: ${e.error}`, 'error')
  recognition.onend = () => {
    recognition = null
    $('mic').classList.remove('recording')
    if (input.value.trim()) {
      scheduleAutoSend()
      // Re-listen after the auto-send fires
      if (settings.autoSend && Recognition && settings.mic) {
        const tid = setTimeout(() => {
          if (!input.value.trim()) $('mic').click()
        }, (settings.delay + 0.5) * 1000)
        input.addEventListener('focus', () => clearTimeout(tid), { once: true })
      }
    }
  }
  recognition.start()
  $('mic').classList.add('recording')
})

// ---------------------------------------------------------------------------
// Mode, stop-all, tasks

function setMode(mode) {
  state.mode = mode
  const chip = $('modeChip')
  chip.textContent = mode === 'listen' ? 'Listening' : 'Spar'
  chip.classList.toggle('listen', mode === 'listen')
}

$('modeChip').addEventListener('click', async () => {
  const next = state.mode === 'listen' ? 'spar' : 'listen'
  try {
    await api('/api/mode', { method: 'POST', body: JSON.stringify({ mode: next }) })
    setMode(next)
    speak(next === 'listen' ? 'Listening.' : 'Sparring.', { force: true })
  } catch (err) {
    addSystem(err.message, 'error')
  }
})

$('stopAll').addEventListener('click', async () => {
  stopSpeaking()
  try {
    const res = await api('/api/stop-all', { method: 'POST' })
    const { stopped } = await res.json()
    const msg = stopped ? `Stopped ${stopped} agent task${stopped === 1 ? '' : 's'}.` : 'No agents were running.'
    addSystem(msg)
    speak(msg, { force: true })
  } catch (err) {
    addSystem(`Stop failed: ${err.message}`, 'error')
    errorTone()
  }
})

function upsertTask(task) {
  state.tasks.set(task.id, task)
  renderTasks()
}

function sortedTasks() {
  return [...state.tasks.values()].sort((a, b) => b.num - a.num)
}

function renderTasks() {
  const tasks = sortedTasks()
  const proposal = tasks.find(t => t.status === 'proposed')
  $('proposal').hidden = !proposal
  if (proposal) {
    $('proposal').dataset.id = proposal.id
    $('proposalTitle').textContent = `${proposal.num}. ${proposal.title} · ${proposal.project}`
    $('proposalPrompt').textContent = proposal.prompt
  }
  const running = tasks.find(t => t.status === 'running')
  const queued = tasks.filter(t => t.status === 'queued').length
  const strip = $('taskStrip')
  strip.hidden = !running && !queued
  strip.innerHTML = running
    ? `<b>Task ${running.num} running</b> · ${escapeHtml(running.title)}${queued ? ` · ${queued} queued` : ''}`
    : queued ? `<b>${queued} queued</b>` : ''
  const busy = tasks.filter(t => ['proposed', 'running', 'queued'].includes(t.status)).length
  $('taskBadge').hidden = !busy
  $('taskBadge').textContent = String(busy)

  $('tasks').innerHTML = tasks.length ? tasks.map(t => `
    <div class="task" data-id="${t.id}">
      <div class="head"><span class="title">${t.num}. ${escapeHtml(t.title)}</span><span class="pill ${t.status}">${t.status}</span></div>
      <div class="sub">${escapeHtml(t.project)}${t.branch ? ` · ${escapeHtml(t.branch)}` : ''}</div>
      ${t.commits && t.commits.length ? `<div class="sub">${t.commits.length} commit${t.commits.length === 1 ? '' : 's'}${t.diffStat ? ` · ${escapeHtml(t.diffStat)}` : ''}${t.check ? ` · checks ${t.check.ok ? 'passed' : 'failed'}` : ''}</div>` : ''}
      ${t.error ? `<div class="err">${escapeHtml(t.error)}</div>` : ''}
      <div class="row">
        ${t.status === 'proposed' ? '<button class="primary" data-act="start">Start</button><button data-act="dismiss">Dismiss</button>' : ''}
        ${t.logFile ? '<button data-act="log">Log</button>' : ''}
      </div>
    </div>`).join('') : '<p class="note">No tasks yet. Talk an idea through, and when the architect proposes a task, say "go". Or start a sentence with "task:".</p>'
}

async function taskAction(id, act) {
  try {
    if (act === 'log') {
      const res = await api(`/api/tasks/${id}/log`)
      const { log } = await res.json()
      $('logText').textContent = log || '(empty)'
      $('logDialog').showModal()
      return
    }
    const res = await api(`/api/tasks/${id}/${act}`, { method: 'POST' })
    const { task } = await res.json()
    upsertTask(task)
    if (act === 'start') speak(`Starting task ${task.num}.`)
  } catch (err) {
    addSystem(err.message, 'error')
  }
}

$('tasks').addEventListener('click', e => {
  const btn = e.target.closest('button[data-act]')
  if (btn) taskAction(btn.closest('.task').dataset.id, btn.dataset.act)
})
$('proposalStart').addEventListener('click', () => taskAction($('proposal').dataset.id, 'start'))
$('proposalDismiss').addEventListener('click', () => taskAction($('proposal').dataset.id, 'dismiss'))

// ---------------------------------------------------------------------------
// Brief (tiny markdown renderer: headings, lists, code, quotes, bold, italics)

function inlineMd(s) {
  return escapeHtml(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|\s)_([^_]+)_(?=\s|$|[.,])/g, '$1<i>$2</i>')
}

function renderMarkdown(md) {
  const out = []
  let list = false
  let code = null
  const closeList = () => {
    if (list) out.push('</ul>')
    list = false
  }
  for (const line of md.split('\n')) {
    if (code !== null) {
      if (line.startsWith('```')) {
        out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`)
        code = null
      } else code.push(line)
      continue
    }
    if (line.startsWith('```')) {
      closeList()
      code = []
      continue
    }
    const h = line.match(/^(#{1,4})\s+(.*)$/)
    if (h) {
      closeList()
      out.push(`<h${h[1].length}>${inlineMd(h[2])}</h${h[1].length}>`)
      continue
    }
    const li = line.match(/^\s*[-*]\s+(.*)$/)
    if (li) {
      if (!list) out.push('<ul>')
      list = true
      out.push(`<li>${inlineMd(li[1])}</li>`)
      continue
    }
    closeList()
    if (line.startsWith('>')) out.push(`<blockquote>${inlineMd(line.replace(/^>\s?/, ''))}</blockquote>`)
    else if (line.trim()) out.push(`<p>${inlineMd(line)}</p>`)
  }
  closeList()
  if (code !== null) out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`)
  return out.join('\n')
}

async function loadBrief() {
  try {
    const res = await api('/api/brief')
    const { markdown } = await res.json()
    $('brief').innerHTML = renderMarkdown(markdown)
  } catch (err) {
    $('brief').textContent = err.message
  }
}

$('briefRefresh').addEventListener('click', loadBrief)
$('minutesBtn').addEventListener('click', async () => {
  const btn = $('minutesBtn')
  btn.disabled = true
  btn.textContent = 'Writing…'
  try {
    await api('/api/minutes', { method: 'POST' })
    await loadBrief()
  } catch (err) {
    addSystem(err.message, 'error')
  } finally {
    btn.disabled = false
    btn.textContent = 'Write minutes'
  }
})

// ---------------------------------------------------------------------------
// Views

for (const btn of document.querySelectorAll('.tabs button')) {
  btn.addEventListener('click', () => {
    for (const b of document.querySelectorAll('.tabs button')) b.classList.toggle('active', b === btn)
    for (const v of document.querySelectorAll('.view')) v.classList.toggle('active', v.id === `view-${btn.dataset.view}`)
    if (btn.dataset.view === 'brief') loadBrief()
  })
}

// ---------------------------------------------------------------------------
// Server state and live events

function applyState(s) {
  state.info = s
  setMode(s.mode)
  for (const t of s.tasks) state.tasks.set(t.id, t)
  renderTasks()
  $('serverInfo').textContent = `Gain ${s.version}\nModel: ${s.model}\nAgent: ${s.agent}\nProjects: ${s.projects.map(p => p.name).join(', ')} (default ${s.defaultProject})`
}

async function refreshState() {
  try {
    const res = await api('/api/state')
    applyState(await res.json())
    setConn(true)
    flushOutbox()
  } catch (err) {
    if (err instanceof TypeError) setConn(false)
  }
}

let events = null
function connectEvents() {
  if (!token || !window.EventSource) return
  if (events && events.readyState !== 2) return
  events = new EventSource(`/api/events?token=${encodeURIComponent(token)}`)
  events.addEventListener('hello', e => {
    setConn(true)
    applyState(JSON.parse(e.data))
  })
  events.addEventListener('task', e => {
    const { task, announce } = JSON.parse(e.data)
    upsertTask(task)
    if (announce) {
      addSystem(announce)
      if (settings.announce) speak(announce)
    }
  })
  events.addEventListener('mode', e => setMode(JSON.parse(e.data).mode))
  events.onerror = () => setConn(false)
}

// ---------------------------------------------------------------------------
// Walking: audio unlock, wake lock, pocket guard

let wakeLock = null
async function keepAwake() {
  if (!settings.awake || !state.walking || !('wakeLock' in navigator)) return
  try {
    if (!wakeLock || wakeLock.released) wakeLock = await navigator.wakeLock.request('screen')
  } catch {
    // not allowed right now (e.g. page hidden)
  }
}

let guardTimer = null
function armGuard() {
  clearTimeout(guardTimer)
  if (!state.walking || !settings.guard || !$('guard').hidden) return
  guardTimer = setTimeout(() => {
    if (document.activeElement === input && input.value.trim()) return armGuard()
    if ($('logDialog').open) return armGuard()
    input.blur()
    $('guard').hidden = false
  }, settings.guardDelay * 1000)
}

{
  const guard = $('guard')
  const ring = $('guardRing')
  let holdTimer = null
  let held = false
  guard.addEventListener('pointerdown', e => {
    e.preventDefault()
    held = false
    ring.classList.add('hold')
    holdTimer = setTimeout(() => (held = true), 500)
  })
  const release = () => {
    clearTimeout(holdTimer)
    ring.classList.remove('hold')
    if (!held) return
    held = false
    guard.hidden = true
    input.focus()
    armGuard()
  }
  guard.addEventListener('pointerup', release)
  guard.addEventListener('pointercancel', () => {
    clearTimeout(holdTimer)
    ring.classList.remove('hold')
    held = false
  })
}

document.addEventListener('pointerdown', () => armGuard(), { passive: true })

$('startWalk').addEventListener('click', () => {
  state.walking = true
  $('startOverlay').hidden = true
  unlockAudio()
  // iOS only lets a page speak after it has spoken once inside a tap.
  speak(isRussian(navigator.language) ? 'Готов.' : 'Ready.', { force: true })
  keepAwake()
  api('/api/warmup', { method: 'POST' }).catch(() => {})
  input.focus()
  armGuard()
})

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return
  keepAwake()
  connectEvents()
  refreshState()
})
window.addEventListener('online', () => {
  refreshState()
  connectEvents()
})
window.addEventListener('offline', () => setConn(false))

// ---------------------------------------------------------------------------
// Settings form

function bindToggle(id, key, after) {
  const el = $(id)
  el.checked = !!settings[key]
  el.addEventListener('change', () => {
    settings[key] = el.checked
    saveSettings()
    if (after) after()
  })
}

function bindRange(id, key, labelId, fmt) {
  const el = $(id)
  const label = $(labelId)
  el.value = settings[key]
  label.textContent = fmt(settings[key])
  el.addEventListener('input', () => {
    settings[key] = Number(el.value)
    label.textContent = fmt(settings[key])
    saveSettings()
  })
}

bindToggle('setSpeak', 'speak')
bindToggle('setAnnounce', 'announce')
bindToggle('setEarcons', 'earcons', unlockAudio)
bindToggle('setAutoSend', 'autoSend')
bindToggle('setMic', 'mic', updateMicButton)
bindToggle('setAwake', 'awake', keepAwake)
bindToggle('setGuard', 'guard', armGuard)
bindRange('setRate', 'rate', 'rateVal', v => `${Number(v).toFixed(2)}×`)
bindRange('setDelay', 'delay', 'delayVal', v => `${v} s`)
bindRange('setGuardDelay', 'guardDelay', 'guardVal', v => `${v} s`)
for (const [id, key] of [['setVoiceEn', 'voiceEn'], ['setVoiceRu', 'voiceRu'], ['setMicLang', 'micLang']]) {
  $(id).value = settings[key]
  $(id).addEventListener('change', () => {
    settings[key] = $(id).value
    saveSettings()
  })
}
$('testVoice').addEventListener('click', () => {
  speak('This is how Gain sounds in English.', { force: true })
  speak('А так Gain звучит по-русски.', { force: true })
})
$('setToken').value = token
$('saveToken').addEventListener('click', () => {
  token = $('setToken').value.trim()
  writeLocal('gain.token', token)
  hint('')
  if (events) events.close()
  events = null
  connectEvents()
  refreshState()
  loadHistory()
})

// ---------------------------------------------------------------------------
// Start

if (synth) {
  loadVoices()
  synth.addEventListener?.('voiceschanged', loadVoices)
}
updateMicButton()
if (!standalone && /iPhone|iPad/.test(navigator.userAgent)) $('installHint').hidden = false
if (!token) hint('No access token yet. Open the link Gain printed on your computer.')
setConn(false)
refreshState()
loadHistory()
connectEvents()
setInterval(() => {
  if (document.visibilityState === 'visible') refreshState()
}, 15_000)

if ('serviceWorker' in navigator && (location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname))) {
  navigator.serviceWorker.register('sw.js').catch(() => {})
}

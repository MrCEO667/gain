/**
 * Spoken commands, recognised by plain rules (no model), in English and Russian.
 * Dictation tools such as Wispr Flow add capitals and punctuation, so matching ignores both.
 */

export type Intent =
  | { kind: 'stopAll' }
  | { kind: 'listen'; rest: string }
  | { kind: 'yourTurn'; rest: string }
  | { kind: 'go' }
  | { kind: 'cancel' }
  | { kind: 'task'; project: string | null; text: string }
  | { kind: 'remember'; text: string }
  | { kind: 'wrapUp' }
  | { kind: 'status' }
  | { kind: 'say'; text: string }

/** Lowercase, ё→е, no surrounding quotes/punctuation, single spaces. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[‘’“”«»"']/g, '')
    .replace(/[.!?,;:…\-–—]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const EXACT: { kind: 'stopAll' | 'go' | 'cancel' | 'wrapUp' | 'status'; phrases: string[] }[] = [
  {
    kind: 'stopAll',
    phrases: [
      'stop all', 'stop everything', 'stop all agents', 'stop the agents', 'kill all', 'kill all agents', 'abort all',
      'стоп все', 'стоп всем', 'стоп всё', 'останови все', 'остановить все', 'останови агентов', 'отбой всем',
    ],
  },
  {
    kind: 'go',
    phrases: [
      'go', 'go ahead', 'do it', 'start it', 'start the task', 'launch it', 'run it', 'yes do it', 'ship it', 'send it to the agent',
      'давай', 'давай делай', 'запускай', 'запусти', 'поехали', 'делай', 'вперед', 'го',
    ],
  },
  {
    kind: 'cancel',
    phrases: ['cancel', 'cancel that', 'never mind', 'nevermind', 'drop it', 'отмена', 'отмени', 'не надо', 'не запускай'],
  },
  {
    kind: 'wrapUp',
    phrases: ['wrap up', 'wrap it up', 'lets wrap up', 'sum up', 'summarize', 'summary', 'итоги', 'подведи итоги', 'подытожь', 'резюме'],
  },
  {
    kind: 'status',
    phrases: [
      'status', 'agent status', 'agents status', 'what are the agents doing', 'how are the agents', 'how are the agents doing',
      'статус', 'что с агентами', 'как агенты', 'что делают агенты',
    ],
  },
]

// JavaScript's \b only knows ASCII letters, so word ends are spelled out to work for Cyrillic too.
const END = String.raw`(?=$|[\s,.:;!?—–-])`
const LISTEN = new RegExp(String.raw`^(?:just listen|listen mode|only listen|listen only|просто слушай|режим слушания|слушай молча|только слушай)${END}[\s,.:;!—–-]*`)
const YOUR_TURN = new RegExp(String.raw`^(?:your turn|over to you|what do you think|твоя очередь|что думаешь|что скажешь|твое мнение)${END}[\s,.:;!?—–-]*`)
const TASK = /^(?:task|new task|agent task|задача|новая задача|задание)(?:\s+(?:for|in|для|в)\s+([\w.-]+))?\s*[:,—–-]\s*/
const REMEMBER = new RegExp(String.raw`^(?:remember that|remember|запомни что|запомни)${END}[\s,:—–-]+`)

/** Lowercases without changing string length, so match indexes map back onto the original text. */
function lowerSameLength(text: string): string {
  const lower = text.toLowerCase().replace(/ё/g, 'е')
  return lower.length === text.length ? lower : text
}

export function detectIntent(raw: string): Intent {
  const text = raw.trim().replace(/^["'«“]+|["'»”]+$/g, '').trim()
  const norm = normalize(text)
  for (const { kind, phrases } of EXACT) {
    if (phrases.some(p => normalize(p) === norm)) return { kind } as Intent
  }
  const lower = lowerSameLength(text)
  let m = lower.match(LISTEN)
  if (m) return { kind: 'listen', rest: text.slice(m[0].length).trim() }
  m = lower.match(YOUR_TURN)
  if (m) return { kind: 'yourTurn', rest: text.slice(m[0].length).trim() }
  m = lower.match(TASK)
  if (m) {
    const body = text.slice(m[0].length).trim()
    if (body) return { kind: 'task', project: m[1] ?? null, text: body }
  }
  m = lower.match(REMEMBER)
  if (m) {
    const fact = text.slice(m[0].length).trim()
    if (fact) return { kind: 'remember', text: fact }
  }
  return { kind: 'say', text }
}

/**
 * True when the text reads as Russian, so system phrases should be spoken in Russian.
 * Russian speech is full of English tech words, so a third of the letters being Cyrillic is enough.
 */
export function isRussian(text: string): boolean {
  const cyr = (text.match(/[а-яё]/gi) ?? []).length
  const lat = (text.match(/[a-z]/gi) ?? []).length
  return cyr > 0 && cyr * 2 >= lat
}

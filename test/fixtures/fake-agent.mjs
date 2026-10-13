// Stands in for a coding agent in tests. Behaviour is chosen with FAKE_AGENT_MODE.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const promptFile = process.argv[2]
const prompt = promptFile ? readFileSync(promptFile, 'utf8') : ''
const mode = process.env.FAKE_AGENT_MODE ?? 'commit'
console.log(`fake agent (${mode}) got ${prompt.length} chars`)

if (mode === 'sleep') {
  setTimeout(() => {}, 60_000)
} else if (mode === 'fail') {
  console.error('something went wrong')
  process.exit(3)
} else if (mode !== 'noop') {
  writeFileSync('AGENT_NOTE.md', `${prompt.split('\n')[0]}\n`)
  writeFileSync('.aider.tags.cache.v4', 'cache that must not be committed')
  if (mode === 'commit') {
    const git = args => execFileSync('git', ['-c', 'user.name=Agent', '-c', 'user.email=agent@test', ...args])
    git(['add', 'AGENT_NOTE.md'])
    git(['commit', '-m', 'Add agent note'])
  }
}

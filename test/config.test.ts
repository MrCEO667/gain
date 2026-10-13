import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { loadConfig, ROOT } from '../src/config.ts'
import { tempDir } from './fixtures/helpers.ts'

test('the example config loads and resolves paths relative to the config file', () => {
  const cfg = loadConfig(path.join(ROOT, 'gain.config.example.json'))
  assert.equal(cfg.projects[0].path, ROOT)
  assert.equal(cfg.dataDir, path.join(ROOT, 'data'))
  assert.equal(cfg.llm.model, 'qwen3:8b')
  assert.equal(cfg.llm.timeoutSeconds, 120, 'unset keys keep their defaults')
  assert.ok(cfg.agent.command.includes('{promptFile}'))
})

test('no config file means sensible defaults', () => {
  const cfg = loadConfig(path.join(tempDir(), 'missing.json'))
  assert.equal(cfg.defaultProject, 'gain')
  assert.equal(cfg.agent.command[0], 'aider')
})

test('bad configs fail with a readable message', () => {
  const dir = tempDir()
  const file = path.join(dir, 'gain.config.json')
  writeFileSync(file, JSON.stringify({ defaultProject: 'nope', projects: [{ name: 'a b', path: '.' }] }))
  assert.throws(() => loadConfig(file), /may only use letters[\s\S]*defaultProject "nope"/)
  writeFileSync(file, '{ not json')
  assert.throws(() => loadConfig(file), /Could not read/)
})

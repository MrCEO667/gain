import assert from 'node:assert/strict'
import { test } from 'node:test'
import { detectIntent, isRussian, normalize } from '../src/commands.ts'

test('normalize drops case, quotes and dictation punctuation', () => {
  assert.equal(normalize('  "Stop all!"  '), 'stop all')
  assert.equal(normalize('Стоп всё.'), 'стоп все')
})

test('exact commands survive Wispr Flow capitalisation and punctuation', () => {
  assert.deepEqual(detectIntent('Stop all.'), { kind: 'stopAll' })
  assert.deepEqual(detectIntent('Стоп всё!'), { kind: 'stopAll' })
  assert.deepEqual(detectIntent('Go.'), { kind: 'go' })
  assert.deepEqual(detectIntent('Давай!'), { kind: 'go' })
  assert.deepEqual(detectIntent('Do it'), { kind: 'go' })
  assert.deepEqual(detectIntent('Never mind.'), { kind: 'cancel' })
  assert.deepEqual(detectIntent('Wrap up.'), { kind: 'wrapUp' })
  assert.deepEqual(detectIntent('Подведи итоги'), { kind: 'wrapUp' })
  assert.deepEqual(detectIntent('Status?'), { kind: 'status' })
})

test('commands only match the whole utterance', () => {
  assert.equal(detectIntent('Go to the store and buy milk').kind, 'say')
  assert.equal(detectIntent('I want to stop all this complexity').kind, 'say')
  assert.equal(detectIntent('Давай подумаем про онбординг').kind, 'say')
})

test('listen and your-turn keep the rest of the sentence', () => {
  assert.deepEqual(detectIntent('Just listen. I think onboarding is too long'), { kind: 'listen', rest: 'I think onboarding is too long' })
  assert.deepEqual(detectIntent('Просто слушай'), { kind: 'listen', rest: '' })
  assert.deepEqual(detectIntent('Your turn, what is the weakest part?'), { kind: 'yourTurn', rest: 'what is the weakest part?' })
  assert.deepEqual(detectIntent('Твоя очередь.'), { kind: 'yourTurn', rest: '' })
})

test('task commands, with and without a project', () => {
  assert.deepEqual(detectIntent('Task: add a dark mode toggle'), { kind: 'task', project: null, text: 'add a dark mode toggle' })
  assert.deepEqual(detectIntent('Task for gain, Add a Dark Mode toggle.'), { kind: 'task', project: 'gain', text: 'Add a Dark Mode toggle.' })
  assert.deepEqual(detectIntent('Задача: добавить тёмную тему'), { kind: 'task', project: null, text: 'добавить тёмную тему' })
  assert.equal(detectIntent('Task:').kind, 'say')
  assert.equal(detectIntent('Tasks are piling up today').kind, 'say')
})

test('remember keeps the original casing of the fact', () => {
  assert.deepEqual(detectIntent('Remember that I prefer TypeScript.'), { kind: 'remember', text: 'I prefer TypeScript.' })
  assert.deepEqual(detectIntent('Запомни: я гуляю по утрам'), { kind: 'remember', text: 'я гуляю по утрам' })
})

test('isRussian looks at the dominant script', () => {
  assert.equal(isRussian('Привет, как дела?'), true)
  assert.equal(isRussian('Hello there'), false)
  assert.equal(isRussian('Запусти build в gain'), true)
})

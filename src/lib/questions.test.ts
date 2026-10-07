import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeAnswer, validateDraft } from './questions.ts'

test('normalizeAnswer trims, drops blanks and repeats, and caps the count', () => {
  assert.deepEqual(normalizeAnswer(['  Pedro  Raul ', '', 'Pedro Raul', 'Hulk', 'Gabigol'], 2), ['Pedro Raul', 'Hulk'])
})

test('validateDraft', () => {
  assert.equal(validateDraft({ kind: 'free', prompt: ' ', answerCount: 1, points: 5 }), 'Escreva a pergunta.')
  assert.equal(validateDraft({ kind: 'relegated', prompt: 'Rebaixados?', answerCount: 0, points: 5 }), 'Quantidade de respostas entre 1 e 20.')
  assert.equal(validateDraft({ kind: 'champion', prompt: 'Campeão?', answerCount: 1, points: 15 }), null)
})

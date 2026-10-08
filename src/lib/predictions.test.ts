import assert from 'node:assert/strict'
import test from 'node:test'
import { draftFrom, firstOf, parseScore, rowsToSave, stepGoals, type SavedPrediction } from './predictions.ts'

test('parseScore accepts 0 to 99 only', () => {
  assert.equal(parseScore('0'), 0)
  assert.equal(parseScore(' 12 '), 12)
  assert.equal(parseScore(''), null)
  assert.equal(parseScore('100'), null)
  assert.equal(parseScore('1a'), null)
})

const saved: SavedPrediction = {
  id: 1, match_id: 10, home_score: 2, away_score: 1, advancing_team_id: null, went_to_penalties: null, points: null, rules_hit: [],
}

test('rowsToSave keeps only complete, changed drafts for open matches', () => {
  const rows = rowsToSave(
    {
      10: draftFrom(saved), // unchanged
      11: { home: '1', away: '', advancing: null, penalties: null }, // incomplete
      12: { home: '0', away: '0', advancing: null, penalties: null }, // new
      13: { home: '3', away: '3', advancing: null, penalties: null }, // already kicked off
    },
    { 10: saved },
    new Set([10, 11, 12]),
  )
  assert.deepEqual(rows, [{ match_id: 12, home_score: 0, away_score: 0, advancing_team_id: null, went_to_penalties: null }])
})

test('rowsToSave notices a changed score', () => {
  const rows = rowsToSave({ 10: { ...draftFrom(saved), away: '2' } }, { 10: saved }, new Set([10]))
  assert.equal(rows.length, 1)
  assert.equal(rows[0].away_score, 2)
})

test('firstOf handles object and list embeds', () => {
  assert.equal(firstOf({ a: 1 })?.a, 1)
  assert.equal(firstOf([{ a: 2 }])?.a, 2)
  assert.equal(firstOf([]), null)
  assert.equal(firstOf(null), null)
})

test('stepGoals moves between 0 and 99, starting from an empty field', () => {
  assert.equal(stepGoals('', 1), '1')
  assert.equal(stepGoals('', -1), '0')
  assert.equal(stepGoals('2', 1), '3')
  assert.equal(stepGoals('0', -1), '0')
  assert.equal(stepGoals('99', 1), '99')
})

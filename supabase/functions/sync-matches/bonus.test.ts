import assert from 'node:assert/strict'
import { test } from 'node:test'
import { officialAnswer, tableOf, topScorersOf } from './bonus.ts'

const league = { table: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19], champion: null, scorers: ['Kevin Viveros'] }

test('league questions come from the final table', () => {
  assert.deepEqual(officialAnswer('champion', 1, league), ['10'])
  assert.deepEqual(officialAnswer('top_n', 4, league), ['10', '11', '12', '13'])
  assert.deepEqual(officialAnswer('relegated', 4, league), ['16', '17', '18', '19'])
  assert.deepEqual(officialAnswer('top_scorer', 1, league), ['Kevin Viveros'])
})

test('cups take the champion from the final, and missing data leaves the question open', () => {
  const cup = { table: [], champion: 7, scorers: [] }
  assert.deepEqual(officialAnswer('champion', 1, cup), ['7'])
  assert.equal(officialAnswer('relegated', 4, cup), null)
  assert.equal(officialAnswer('top_scorer', 1, cup), null)
  assert.equal(officialAnswer('top_n', 12, league), null)
})

test('the TOTAL table is read in position order', () => {
  assert.deepEqual(tableOf({ standings: [
    { type: 'HOME', table: [{ position: 1, team: { id: 99 } }] },
    { type: 'TOTAL', table: [{ position: 2, team: { id: 5 } }, { position: 1, team: { id: 3 } }] },
  ] }), [3, 5])
  assert.deepEqual(tableOf({}), [])
})

test('every player tied at the top is a top scorer', () => {
  assert.deepEqual(topScorersOf({ stats: [
    { name: 'assistsLeaders', leaders: [{ value: 20, athlete: { displayName: 'Assist Guy' } }] },
    { name: 'goalsLeaders', leaders: [
      { value: 18, athlete: { displayName: 'Kevin Viveros' } },
      { value: 18, athlete: { displayName: ' Pedro ' } },
      { value: 16, athlete: { displayName: 'Gabriel Barbosa' } },
    ] },
  ] }), ['Kevin Viveros', 'Pedro'])
  assert.deepEqual(topScorersOf({ stats: [] }), [])
})

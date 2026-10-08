import assert from 'node:assert/strict'
import { test } from 'node:test'
import { type Fixture, type Result, expectedGoals, guess } from './capivara.ts'

// Team 1 beats everyone, team 2 loses to everyone.
const results: Result[] = []
for (let i = 3; i < 13; i++) {
  results.push({ home_team_id: 1, away_team_id: i, home_score: 2, away_score: 0 })
  results.push({ home_team_id: i, away_team_id: 2, home_score: 2, away_score: 1 })
  results.push({ home_team_id: i, away_team_id: i + 1, home_score: 1, away_score: 1 })
}

const fixture = (match_id: number, home = 1, away = 2, stage = 'REGULAR_SEASON'): Fixture =>
  ({ pool_id: 'p1', match_id, stage, home_team_id: home, away_team_id: away })

test('strong attacks and weak defenses mean more goals', () => {
  const xg = expectedGoals(results, 1, 2)
  assert.ok(xg.home > 2 && xg.away < 0.8, JSON.stringify(xg))
  
  const even = expectedGoals([], 5, 6)
  assert.deepEqual(even, { home: 1.4, away: 1.1 })
})

test('the favourite usually wins, but not always', () => {
  const guesses = Array.from({ length: 200 }, (_, i) => guess(fixture(i), results))
  const wins = guesses.filter((g) => g.home_score > g.away_score).length
  assert.ok(wins > 120 && wins < 195, `home wins: ${wins}`)
  assert.ok(new Set(guesses.map((g) => `${g.home_score}x${g.away_score}`)).size > 5, 'scores vary')
})

test('the same pool and match always get the same guess; other pools differ', () => {
  assert.deepEqual(guess(fixture(7), results), guess(fixture(7), results))
  const pools = new Set(Array.from({ length: 20 }, (_, i) => JSON.stringify(guess({ ...fixture(7), pool_id: `p${i}` }, results))))
  assert.ok(pools.size > 1)
})

test('knockout guesses pick who goes through, with penalties on a draw', () => {
  for (let i = 0; i < 50; i++) {
    const g = guess(fixture(i, 1, 2, 'FINAL'), results)
    assert.equal(g.went_to_penalties, g.home_score === g.away_score)
    if (g.home_score > g.away_score) assert.equal(g.advancing_team_id, 1)
    if (g.home_score < g.away_score) assert.equal(g.advancing_team_id, 2)
    if (g.home_score === g.away_score) assert.ok([1, 2].includes(g.advancing_team_id!))
  }
  assert.equal(guess(fixture(1), results).advancing_team_id, null)
})

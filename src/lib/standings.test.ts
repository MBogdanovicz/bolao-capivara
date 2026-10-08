import assert from 'node:assert/strict'
import test from 'node:test'
import type { Team } from './matches.ts'
import { hasTable, standings } from './standings.ts'

const team = (id: number, name: string): Team => ({ id, name, short_name: null, tla: null, crest_url: null })
const [a, b, c, d] = [team(1, 'Alfa'), team(2, 'Beta'), team(3, 'Gama'), team(4, 'Delta')]
const match = (home: Team, away: Team, hs: number | null, as: number | null, status = 'finished', stage = 'REGULAR_SEASON') =>
  ({ home_team: home, away_team: away, home_score: hs, away_score: as, status: status as 'finished', stage })

test('points, then wins, goal difference and goals scored', () => {
  const table = standings([
    match(a, b, 2, 0), // A 3
    match(c, d, 1, 1), // C 1, D 1
    match(b, c, 3, 0), // B 3
    match(d, a, 0, 0), // D 2, A 4
    match(a, c, null, null, 'scheduled'),
  ])
  assert.deepEqual(table.map((r) => [r.team.name, r.points, r.played]), [['Alfa', 4, 2], ['Beta', 3, 2], ['Delta', 2, 2], ['Gama', 1, 2]])
  assert.deepEqual(table.map((r) => r.position), [1, 2, 3, 4])
  const beta = table[1]
  assert.deepEqual([beta.won, beta.drawn, beta.lost, beta.goalsFor, beta.goalsAgainst], [1, 0, 1, 3, 2])
})

test('teams that have not played yet are listed with zero', () => {
  const table = standings([match(a, b, null, null, 'scheduled')])
  assert.equal(table.length, 2)
  assert.ok(table.every((r) => r.played === 0))
})

test('live matches count with the current score and are flagged', () => {
  const table = standings([match(a, b, 1, 0, 'in_play')])
  assert.equal(table[0].team.name, 'Alfa')
  assert.ok(table[0].live && table[1].live)
})

test('only league stages make a table', () => {
  assert.equal(standings([match(a, b, 1, 0, 'finished', 'FINAL')]).length, 0)
  assert.equal(hasTable([{ stage: 'GROUP_STAGE' }]), false)
  assert.equal(hasTable([{ stage: 'LEAGUE_STAGE' }]), true)
})

import assert from 'node:assert/strict'
import test from 'node:test'
import { currentMatchday, firstOpenMatchday, teamsIn, type Team } from './matches.ts'

test('currentMatchday opens the first matchday with matches left', () => {
  const matches = [
    { matchday: 30, status: 'finished' as const },
    { matchday: 31, status: 'finished' as const },
    { matchday: 31, status: 'in_play' as const },
    { matchday: 32, status: 'scheduled' as const },
  ]
  assert.equal(currentMatchday(matches), 31)
})

test('after the last round finishes, currentMatchday stays on it', () => {
  assert.equal(currentMatchday([{ matchday: 37, status: 'finished' }, { matchday: 38, status: 'finished' }]), 38)
  assert.equal(currentMatchday([]), null)
})

test('a postponed match keeps its matchday open', () => {
  assert.equal(currentMatchday([{ matchday: 20, status: 'postponed' }, { matchday: 21, status: 'scheduled' }]), 20)
})

test('firstOpenMatchday is the first round that has not started', () => {
  const now = new Date('2026-10-10T12:00:00Z')
  const matches = [
    { matchday: 28, kickoff_at: '2026-10-04T19:00:00Z' },
    { matchday: 29, kickoff_at: '2026-10-10T11:00:00Z' }, // round under way
    { matchday: 29, kickoff_at: '2026-10-11T19:00:00Z' },
    { matchday: 30, kickoff_at: '2026-10-17T19:00:00Z' },
  ]
  assert.equal(firstOpenMatchday(matches, now), 30)
  assert.equal(firstOpenMatchday(matches, new Date('2026-12-31T00:00:00Z')), null)
})

test('teamsIn lists each team once, by name', () => {
  const team = (id: number, name: string): Team => ({ id, name, short_name: name, tla: null, crest_url: null })
  const teams = teamsIn([
    { home_team: team(2, 'Vasco'), away_team: team(1, 'Bahia') },
    { home_team: team(1, 'Bahia'), away_team: null },
  ])
  assert.deepEqual(teams.map((t) => t.name), ['Bahia', 'Vasco'])
})

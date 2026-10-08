import assert from 'node:assert/strict'
import { test } from 'node:test'
import { type EspnTeam, type FdMatch, espnDate, eventsOf, pairTeams, rosterOf, similarity, teamLook } from './espn.ts'

const espn = (id: string, displayName: string, abbreviation: string, shortDisplayName = displayName): EspnTeam =>
  ({ id, displayName, shortDisplayName, abbreviation, logo: `https://a.espncdn.com/${id}.png` })

const CAP = espn('3458', 'Athletico Paranaense', 'CAP', 'Athletico-PR')
const CAM = espn('7632', 'Atlético-MG', 'CAM')
const FLA = espn('819', 'Flamengo', 'FLA')
const FLU = espn('3445', 'Fluminense', 'FLU')
const GRE = espn('6273', 'Grêmio', 'GRE')
const INT = espn('1936', 'Internacional', 'INT')

const fd = (id: number, name: string, short_name: string, tla: string) => ({ id, name, short_name, tla })

test('similarity uses the three-letter code and shared words, ignoring accents', () => {
  assert.equal(similarity({ name: 'CA Paranaense', short_name: 'Paranaense', tla: 'CAP' }, CAP), 3)
  assert.equal(similarity({ name: 'Clube Atlético Mineiro', short_name: 'Mineiro', tla: 'CAM' }, CAM), 3)
  assert.equal(similarity({ name: 'Grêmio FBPA', short_name: 'Grêmio', tla: 'GRE' }, FLA), 0)
})

test('a lone game at the same kickoff pairs both teams, whatever their names', () => {
  const m: FdMatch = { kickoff_at: '2026-10-11T19:00:00Z', home: fd(1, 'CA Paranaense', 'Paranaense', 'XXX'), away: fd(2, 'CA Mineiro', 'Mineiro', 'YYY') }
  const pairs = pairTeams([m], [{ date: '2026-10-11T19:00Z', home: CAP, away: CAM }, { date: '2026-10-11T20:30Z', home: FLA, away: FLU }])
  assert.equal(pairs.get(1)?.id, '3458')
  assert.equal(pairs.get(2)?.id, '7632')
})

test('games at the same kickoff are told apart by name, and ties are skipped', () => {
  const events = [
    { date: '2026-10-11T20:30Z', home: FLA, away: FLU },
    { date: '2026-10-11T20:30Z', home: GRE, away: INT },
  ]
  const gre: FdMatch = { kickoff_at: '2026-10-11T20:30:00Z', home: fd(3, 'Grêmio FBPA', 'Grêmio', 'GRE'), away: fd(4, 'SC Internacional', 'Internacional', 'INT') }
  const unknown: FdMatch = { kickoff_at: '2026-10-11T20:30:00Z', home: fd(5, 'Team A', 'A', 'AAA'), away: fd(6, 'Team B', 'B', 'BBB') }
  const pairs = pairTeams([gre, unknown], events)
  assert.equal(pairs.get(3)?.id, '6273')
  assert.equal(pairs.get(4)?.id, '1936')
  assert.equal(pairs.has(5), false)
})

test('scoreboard events and rosters are parsed, and ESPN supplies the look', () => {
  const events = eventsOf({ events: [
    { date: '2026-10-11T19:00Z', competitions: [{ competitors: [{ homeAway: 'away', team: CAM }, { homeAway: 'home', team: CAP }] }] },
    { date: '2026-10-11T19:00Z', competitions: [] },
  ] })
  assert.deepEqual(events, [{ date: '2026-10-11T19:00Z', home: CAP, away: CAM }])

  assert.deepEqual(rosterOf({ athletes: [
    { id: '1', displayName: 'Carlos Eduardo ', position: { name: 'Goalkeeper' } },
    { items: [{ id: 2, fullName: 'Kevin Viveros' }] },
    { id: '3', displayName: '' },
  ] }), [
    { espn_id: '1', name: 'Carlos Eduardo', position: 'Goalkeeper' },
    { espn_id: '2', name: 'Kevin Viveros', position: null },
  ])

  assert.deepEqual(teamLook(CAP, 'bra.1'), {
    espn_id: '3458', espn_league: 'bra.1', name: 'Athletico Paranaense', short_name: 'Athletico-PR', crest_url: 'https://a.espncdn.com/3458.png',
  })
})

test('scoreboard days are US Eastern days', () => {
  assert.equal(espnDate('2026-10-11T22:30:00Z'), '20261011')
  assert.equal(espnDate('2026-10-12T00:30:00Z'), '20261011')
})

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { type Competition, competitionLabel, sortCompetitions } from './competitions.ts'

const today = new Date('2026-10-08T12:00:00Z')

function comp(overrides: Partial<Competition>): Competition {
  return {
    id: 1, name: 'X', type: 'LEAGUE', area_name: null, current_season: 2026, season_label: '2026', season_ends_on: '2026-12-02',
    ...overrides,
  }
}

test('labels show the area, the season and whether it ended', () => {
  assert.equal(competitionLabel(comp({ name: 'Serie A', area_name: 'Italy', season_label: '2026/27' }), today), 'Serie A (Itália) 2026/27')
  assert.equal(competitionLabel(comp({ name: 'Campeonato Brasileiro Série A', area_name: 'Brazil' }), today), 'Campeonato Brasileiro Série A (Brasil) 2026')
  assert.equal(competitionLabel(comp({ name: 'FIFA World Cup', area_name: 'World', season_ends_on: '2026-07-19' }), today), 'FIFA World Cup (Mundo) 2026 · encerrado')
  assert.equal(competitionLabel(comp({ name: 'Old', season_label: null, season_ends_on: null }), today), 'Old 2026')
})

test('running Brazilian competitions come first and ended ones last', () => {
  const list = [
    comp({ id: 1, name: 'FIFA World Cup', area_name: 'World', season_ends_on: '2026-07-19' }),
    comp({ id: 2, name: 'Bundesliga', area_name: 'Germany', season_ends_on: '2027-05-15' }),
    comp({ id: 3, name: 'Campeonato Brasileiro Série A', area_name: 'Brazil' }),
    comp({ id: 4, name: 'Premier League', area_name: 'England', season_ends_on: '2027-05-23' }),
  ]
  assert.deepEqual(sortCompetitions(list, today).map((c) => c.id), [3, 2, 4, 1])
})

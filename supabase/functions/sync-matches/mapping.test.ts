import assert from 'node:assert/strict'
import { test } from 'node:test'
import { type ApiMatch, competitionRow, mapStatus, matchResult, seasonOf, teamsOf } from './mapping.ts'

function match(overrides: Omit<Partial<ApiMatch>, 'score'> & { score?: Partial<ApiMatch['score']> } = {}): ApiMatch {
  const { score, ...rest } = overrides
  return {
    id: 1,
    utcDate: '2026-10-11T19:00:00Z',
    status: 'FINISHED',
    matchday: 29,
    stage: 'REGULAR_SEASON',
    homeTeam: { id: 10, name: 'Team A', tla: 'TMA' },
    awayTeam: { id: 20, name: 'Team B', tla: 'TMB' },
    ...rest,
    score: { winner: 'HOME_TEAM', duration: 'REGULAR', fullTime: { home: 2, away: 1 }, ...score },
  }
}

test('API statuses map to database statuses', () => {
  assert.equal(mapStatus('TIMED'), 'scheduled')
  assert.equal(mapStatus('IN_PLAY'), 'in_play')
  assert.equal(mapStatus('AWARDED'), 'finished')
  assert.equal(mapStatus('POSTPONED'), 'postponed')
  assert.equal(mapStatus('ALGO_NOVO'), 'scheduled')
})

test('league match uses the full-time score and has no knockout data', () => {
  assert.deepEqual(matchResult(match()), {
    home_score: 2, away_score: 1, went_to_penalties: null, advancing_side: null,
  })
})

test('scheduled match has no score yet', () => {
  const r = matchResult(match({ status: 'TIMED', score: { winner: null, fullTime: { home: null, away: null } } }))
  assert.equal(r.home_score, null)
  assert.equal(r.away_score, null)
})

test('knockout on penalties uses the regular-time score and marks who went through', () => {
  const r = matchResult(match({
    stage: 'FINAL',
    score: {
      winner: 'AWAY_TEAM',
      duration: 'PENALTY_SHOOTOUT',
      fullTime: { home: 5, away: 6 },
      regularTime: { home: 1, away: 1 },
      penalties: { home: 3, away: 4 },
    },
  }))
  assert.deepEqual(r, { home_score: 1, away_score: 1, went_to_penalties: true, advancing_side: 'AWAY' })
})

test('knockout decided in regular time', () => {
  const r = matchResult(match({ stage: 'QUARTER_FINALS' }))
  assert.deepEqual(r, { home_score: 2, away_score: 1, went_to_penalties: false, advancing_side: 'HOME' })
})

test('season comes from the response filter or the first match date', () => {
  const competition = { id: 2013, name: 'Brasileirão', code: 'BSA', type: 'LEAGUE' }
  assert.equal(seasonOf({ competition, filters: { season: '2026' }, matches: [] }), 2026)
  assert.equal(seasonOf({ competition, filters: {}, matches: [match()] }), 2026)
})

test('undecided teams (future knockout) are left out', () => {
  const teams = teamsOf([match(), match({ homeTeam: { id: null, name: null }, awayTeam: { id: 10, name: 'Team A' } })])
  assert.deepEqual(teams.map((t) => t.id).sort(), [10, 20])
})

test('competition list items become rows with a season label', () => {
  const row = competitionRow({
    id: 2021, code: 'PL', name: 'Premier League', type: 'LEAGUE', emblem: 'pl.png', area: { name: 'England' },
    currentSeason: { startDate: '2026-08-21', endDate: '2027-05-23' },
  })
  assert.equal(row.current_season, 2026)
  assert.equal(row.season_label, '2026/27')
  assert.equal(row.season_ends_on, '2027-05-23')
  assert.equal(row.area_name, 'England')

  const bsa = competitionRow({
    id: 2013, code: 'BSA', name: 'Campeonato Brasileiro Série A', type: 'LEAGUE',
    currentSeason: { startDate: '2026-01-28', endDate: '2026-12-02' },
  })
  assert.equal(bsa.season_label, '2026')
  assert.equal(bsa.emblem_url, null)

  const none = competitionRow({ id: 1, code: 'X', name: 'X', type: 'CUP', currentSeason: null })
  assert.equal(none.current_season, null)
  assert.equal(none.season_label, null)
})

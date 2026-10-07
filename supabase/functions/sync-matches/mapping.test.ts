import assert from 'node:assert/strict'
import { test } from 'node:test'
import { type ApiMatch, mapStatus, matchResult, seasonOf, teamsOf } from './mapping.ts'

function match(overrides: Omit<Partial<ApiMatch>, 'score'> & { score?: Partial<ApiMatch['score']> } = {}): ApiMatch {
  const { score, ...rest } = overrides
  return {
    id: 1,
    utcDate: '2026-10-11T19:00:00Z',
    status: 'FINISHED',
    matchday: 29,
    stage: 'REGULAR_SEASON',
    homeTeam: { id: 10, name: 'Time A', tla: 'TMA' },
    awayTeam: { id: 20, name: 'Time B', tla: 'TMB' },
    ...rest,
    score: { winner: 'HOME_TEAM', duration: 'REGULAR', fullTime: { home: 2, away: 1 }, ...score },
  }
}

test('status da API viram os status do banco', () => {
  assert.equal(mapStatus('TIMED'), 'scheduled')
  assert.equal(mapStatus('IN_PLAY'), 'in_play')
  assert.equal(mapStatus('AWARDED'), 'finished')
  assert.equal(mapStatus('POSTPONED'), 'postponed')
  assert.equal(mapStatus('ALGO_NOVO'), 'scheduled')
})

test('jogo de pontos corridos usa o placar final e não tem mata-mata', () => {
  assert.deepEqual(matchResult(match()), {
    home_score: 2, away_score: 1, went_to_penalties: null, advancing_side: null,
  })
})

test('jogo agendado ainda sem placar', () => {
  const r = matchResult(match({ status: 'TIMED', score: { winner: null, fullTime: { home: null, away: null } } }))
  assert.equal(r.home_score, null)
  assert.equal(r.away_score, null)
})

test('mata-mata nos pênaltis usa o placar do tempo regular e marca quem avançou', () => {
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

test('mata-mata decidido no tempo normal', () => {
  const r = matchResult(match({ stage: 'QUARTER_FINALS' }))
  assert.deepEqual(r, { home_score: 2, away_score: 1, went_to_penalties: false, advancing_side: 'HOME' })
})

test('temporada vem do filtro da resposta ou da data do primeiro jogo', () => {
  const competition = { id: 2013, name: 'Brasileirão', code: 'BSA', type: 'LEAGUE' }
  assert.equal(seasonOf({ competition, filters: { season: '2026' }, matches: [] }), 2026)
  assert.equal(seasonOf({ competition, filters: {}, matches: [match()] }), 2026)
})

test('times sem definição (mata-mata futuro) ficam de fora', () => {
  const teams = teamsOf([match(), match({ homeTeam: { id: null, name: null }, awayTeam: { id: 10, name: 'Time A' } })])
  assert.deepEqual(teams.map((t) => t.id).sort(), [10, 20])
})

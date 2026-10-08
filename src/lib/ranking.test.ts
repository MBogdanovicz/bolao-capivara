import assert from 'node:assert/strict'
import { test } from 'node:test'
import { monthLabel, periodsIn, rankPeriod, type PeriodPoints } from './ranking.ts'

const row = (user_id: string, matchday: number, month: string, points: number, exact_scores = 0, right_winners = 0): PeriodPoints =>
  ({ user_id, matchday, month, points, exact_scores, right_winners })

const rows = [
  row('ana', 30, '2026-09', 10, 1, 1),
  row('bia', 30, '2026-09', 10, 1, 1),
  row('caio', 30, '2026-09', 10, 0, 2),
  row('ana', 31, '2026-09', 2),
  row('ana', 31, '2026-10', 5, 0, 1),
  row('bia', 32, '2026-10', 7, 0, 1),
]

test('a round ranks everyone, ties share a position and the tiebreak is exact scores', () => {
  assert.deepEqual(rankPeriod(['ana', 'bia', 'caio', 'davi'], rows, { kind: 'round', matchday: 30 }).map((r) => `${r.user_id}:${r.points}:${r.position}`),
    ['ana:10:1', 'bia:10:1', 'caio:10:3', 'davi:0:4'])
})

test('a round spanning two months adds up, and a month adds up its rounds', () => {
  assert.equal(rankPeriod(['ana'], rows, { kind: 'round', matchday: 31 })[0].points, 7)
  assert.deepEqual(rankPeriod(['ana', 'bia'], rows, { kind: 'month', month: '2026-10' }).map((r) => `${r.user_id}:${r.points}`),
    ['bia:7', 'ana:5'])
})

test('periods with points and month names', () => {
  assert.deepEqual(periodsIn(rows), { matchdays: [30, 31, 32], months: ['2026-09', '2026-10'] })
  assert.equal(monthLabel('2026-03'), 'Março de 2026')
})

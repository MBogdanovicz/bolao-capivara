import assert from 'node:assert/strict'
import { test } from 'node:test'
import { type SummaryRow, summaryNotices } from './summaries.ts'

const row = (r: Partial<SummaryRow>): SummaryRow => ({
  user_id: 'ana', pool_id: 'p1', pool_name: 'Capivaras', matchday: 30, points: 12, place: 3, previous_place: 5, members: 8, ...r,
})

test('says the points and how the position changed', () => {
  const body = (r: Partial<SummaryRow>) => summaryNotices([row(r)])[0].notice.body
  assert.equal(body({}), 'Capivaras: você fez 12 pontos e subiu para 3º (era 5º).')
  assert.equal(body({ points: 1, place: 6 }), 'Capivaras: você fez 1 ponto e caiu para 6º (era 5º).')
  assert.equal(body({ points: 0, place: 5 }), 'Capivaras: você não pontuou e segue em 5º.')
  assert.equal(body({ previous_place: null }), 'Capivaras: você fez 12 pontos e está em 3º de 8.')
})

test('one notice per person and pool, about the latest round', () => {
  const notices = summaryNotices([row({ matchday: 29 }), row({}), row({ pool_id: 'p2', pool_name: 'Família' }), row({ user_id: 'bia' })])
  assert.equal(notices.length, 3)
  assert.deepEqual(notices[0], {
    user_id: 'ana',
    notice: { title: 'Rodada 30 encerrada', body: 'Capivaras: você fez 12 pontos e subiu para 3º (era 5º).', url: '/bolao/p1/ranking', tag: 'round-p1' },
  })
})

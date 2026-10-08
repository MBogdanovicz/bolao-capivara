// Text of the end-of-round summary (PT-BR, shown on the phone).
import type { Notice } from './push.ts'

export type SummaryRow = {
  user_id: string
  pool_id: string
  pool_name: string
  matchday: number
  points: number
  place: number
  previous_place: number | null
  members: number
}

const scored = (n: number) => (n === 0 ? 'não pontuou' : n === 1 ? 'fez 1 ponto' : `fez ${n} pontos`)

function movement(r: SummaryRow): string {
  if (r.previous_place === null) return `está em ${r.place}º de ${r.members}`
  if (r.place < r.previous_place) return `subiu para ${r.place}º (era ${r.previous_place}º)`
  if (r.place > r.previous_place) return `caiu para ${r.place}º (era ${r.previous_place}º)`
  return `segue em ${r.place}º`
}

// One notice per person and pool, about the latest round that ended (when a
// postponed match closes an older round at the same time, only the newest is
// worth telling). Tapping it opens the pool's ranking.
export function summaryNotices(rows: SummaryRow[]): { user_id: string; notice: Notice }[] {
  const latest = new Map<string, SummaryRow>()
  for (const r of rows) {
    const key = `${r.user_id}/${r.pool_id}`
    const seen = latest.get(key)
    if (!seen || r.matchday > seen.matchday) latest.set(key, r)
  }
  return [...latest.values()].map((r) => ({
    user_id: r.user_id,
    notice: {
      title: `Rodada ${r.matchday} encerrada`,
      body: `${r.pool_name}: você ${scored(r.points)} e ${movement(r)}.`,
      url: `/bolao/${r.pool_id}/ranking`,
      tag: `round-${r.pool_id}`,
    },
  }))
}

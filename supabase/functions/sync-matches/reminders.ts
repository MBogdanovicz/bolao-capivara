// Text of the prediction reminder (PT-BR, shown on the phone).
import type { Notice } from './push.ts'

export type ReminderRow = { user_id: string; pool_id: string; pool_name: string; missing: number }

const matches = (n: number) => (n === 1 ? '1 jogo' : `${n} jogos`)

// One notice per person, covering all their pools. Tapping it opens the pool,
// or the pool list when there are several.
export function reminderNotices(rows: ReminderRow[]): Map<string, Notice> {
  const byUser = new Map<string, ReminderRow[]>()
  for (const r of rows) byUser.set(r.user_id, [...(byUser.get(r.user_id) ?? []), r])
  const out = new Map<string, Notice>()
  for (const [user, pools] of byUser) {
    const total = pools.reduce((n, p) => n + p.missing, 0)
    out.set(user, pools.length === 1
      ? { title: 'Faltam palpites', body: `${matches(total)} hoje sem palpite no ${pools[0].pool_name}.`, url: `/bolao/${pools[0].pool_id}` }
      : { title: 'Faltam palpites', body: `${matches(total)} hoje sem palpite em ${pools.length} bolões.`, url: '/' })
  }
  return out
}

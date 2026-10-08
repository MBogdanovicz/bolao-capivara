// Round and monthly rankings, built from pool_period_points (match points
// grouped by round and month). Same tiebreak as the overall ranking:
// points, then exact scores, then right winners.

export type PeriodPoints = {
  user_id: string
  matchday: number | null
  month: string // 'YYYY-MM'
  points: number
  exact_scores: number
  right_winners: number
}

export type Period = { kind: 'round'; matchday: number } | { kind: 'month'; month: string }

export type Ranked = { user_id: string; points: number; exact_scores: number; right_winners: number; position: number }

// Every member is listed, with zero when they scored nothing in the period.
export function rankPeriod(memberIds: string[], rows: PeriodPoints[], period: Period): Ranked[] {
  const totals = new Map(memberIds.map((id) => [id, { user_id: id, points: 0, exact_scores: 0, right_winners: 0 }]))
  for (const r of rows) {
    const inPeriod = period.kind === 'round' ? r.matchday === period.matchday : r.month === period.month
    const t = totals.get(r.user_id)
    if (!inPeriod || !t) continue
    t.points += r.points
    t.exact_scores += r.exact_scores
    t.right_winners += r.right_winners
  }
  const sorted = [...totals.values()].sort(
    (a, b) => b.points - a.points || b.exact_scores - a.exact_scores || b.right_winners - a.right_winners,
  )
  // Equal on all three counts means the same position (1, 1, 3).
  let position = 0
  return sorted.map((t, i) => {
    const prev = sorted[i - 1]
    const tied = prev && prev.points === t.points && prev.exact_scores === t.exact_scores && prev.right_winners === t.right_winners
    if (!tied) position = i + 1
    return { ...t, position }
  })
}

// Rounds and months that already have points, oldest first.
export function periodsIn(rows: PeriodPoints[]): { matchdays: number[]; months: string[] } {
  const matchdays = [...new Set(rows.map((r) => r.matchday).filter((d): d is number => d !== null))].sort((a, b) => a - b)
  const months = [...new Set(rows.map((r) => r.month))].sort()
  return { matchdays, months }
}

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

export function monthLabel(month: string): string {
  const [year, m] = month.split('-').map(Number)
  const name = MONTHS[m - 1]
  return `${name[0].toUpperCase()}${name.slice(1)} de ${year}`
}

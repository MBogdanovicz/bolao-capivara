// Turning what the user typed into predictions rows.

export type SavedPrediction = {
  id: number
  match_id: number
  home_score: number
  away_score: number
  advancing_team_id: number | null
  went_to_penalties: boolean | null
  points: number | null
  rules_hit: string[]
}

export type Draft = { home: string; away: string; advancing: number | null; penalties: boolean | null }

export type PredictionRow = {
  match_id: number
  home_score: number
  away_score: number
  advancing_team_id: number | null
  went_to_penalties: boolean | null
}

// A score is a whole number from 0 to 99; anything else is "not filled in".
export function parseScore(text: string): number | null {
  if (!/^\d{1,2}$/.test(text.trim())) return null
  return Number(text.trim())
}

export function draftFrom(saved: SavedPrediction | undefined): Draft {
  return saved
    ? { home: String(saved.home_score), away: String(saved.away_score), advancing: saved.advancing_team_id, penalties: saved.went_to_penalties }
    : { home: '', away: '', advancing: null, penalties: null }
}

// The goal count after tapping + or −. On an empty field, + gives 1 and −
// gives 0, so a 0 can be picked without the keyboard too.
export function stepGoals(value: string, delta: 1 | -1): string {
  if (value === '') return delta === 1 ? '1' : '0'
  return String(Math.min(99, Math.max(0, Number(value) + delta)))
}

// Rows to save: complete drafts that differ from what is saved, for matches
// that have not kicked off. Incomplete drafts are left alone.
export function rowsToSave(
  drafts: Record<number, Draft>,
  saved: Record<number, SavedPrediction>,
  openMatchIds: Set<number>,
): PredictionRow[] {
  const rows: PredictionRow[] = []
  for (const [key, draft] of Object.entries(drafts)) {
    const matchId = Number(key)
    if (!openMatchIds.has(matchId)) continue
    const home = parseScore(draft.home)
    const away = parseScore(draft.away)
    if (home === null || away === null) continue
    const before = saved[matchId]
    if (
      before &&
      before.home_score === home &&
      before.away_score === away &&
      before.advancing_team_id === draft.advancing &&
      before.went_to_penalties === draft.penalties
    ) continue
    rows.push({ match_id: matchId, home_score: home, away_score: away, advancing_team_id: draft.advancing, went_to_penalties: draft.penalties })
  }
  return rows
}

// PostgREST returns a one-to-one embed as an object, older versions as a list.
export function firstOf<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

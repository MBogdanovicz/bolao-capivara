// Official answers of the automatic bonus questions, worked out when a season
// ends: champion, top N and relegated from the final table (or the final, in
// cups), top scorer from ESPN's goal leaders.
// No dependencies, so it runs the same on Deno (Edge Function) and Node (tests).

export type AutoKind = 'champion' | 'relegated' | 'top_n' | 'top_scorer'

export type SeasonOutcome = {
  table: number[]          // database team ids, first to last (leagues only)
  champion: number | null  // database team id of the winner of the final (cups)
  scorers: string[]        // top scorers' names; several when tied
}

// Team questions store team ids as strings. Null when the data is missing,
// so the question waits for another run instead of getting a wrong answer.
export function officialAnswer(kind: AutoKind, answerCount: number, outcome: SeasonOutcome): string[] | null {
  const ids = (list: number[]) => (list.length > 0 ? list.map(String) : null)
  switch (kind) {
    case 'champion':
      return outcome.champion != null ? [String(outcome.champion)] : ids(outcome.table.slice(0, 1))
    case 'top_n':
      return outcome.table.length >= answerCount ? ids(outcome.table.slice(0, answerCount)) : null
    case 'relegated':
      return outcome.table.length >= answerCount ? ids(outcome.table.slice(-answerCount)) : null
    case 'top_scorer':
      return outcome.scorers.length > 0 ? outcome.scorers : null
  }
}

// GET /v4/competitions/{code}/standings: the TOTAL table, as API team ids by position.
export type ApiStandingsResponse = {
  standings?: { type: string; table: { position: number; team: { id: number } }[] }[]
}

export function tableOf(response: ApiStandingsResponse): number[] {
  const total = response.standings?.find((s) => s.type === 'TOTAL')
  return [...(total?.table ?? [])].sort((a, b) => a.position - b.position).map((r) => r.team.id)
}

// ESPN GET /{league}/statistics: everyone tied at the top of goalsLeaders.
export type EspnStatisticsResponse = {
  stats?: { name: string; leaders?: { value: number; athlete?: { displayName?: string | null } }[] }[]
}

export function topScorersOf(response: EspnStatisticsResponse): string[] {
  const leaders = (response.stats?.find((s) => s.name === 'goalsLeaders')?.leaders ?? [])
    .filter((l) => l.athlete?.displayName)
  if (leaders.length === 0) return []
  const best = Math.max(...leaders.map((l) => l.value))
  return leaders.filter((l) => l.value === best).map((l) => l.athlete!.displayName!.trim())
}

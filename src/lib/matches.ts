// Match helpers shared by the pool screens.

export type Team = { id: number; name: string; short_name: string | null; tla: string | null; crest_url: string | null }

export type MatchStatus = 'scheduled' | 'in_play' | 'paused' | 'finished' | 'postponed' | 'suspended' | 'cancelled'

export type Match = {
  id: number
  matchday: number | null
  stage: string
  kickoff_at: string
  status: MatchStatus
  home_score: number | null
  away_score: number | null
  advancing_team_id: number | null
  went_to_penalties: boolean | null
  home_team: Team | null
  away_team: Team | null
}

export const MATCH_SELECT =
  'id, matchday, stage, kickoff_at, status, home_score, away_score, advancing_team_id, went_to_penalties, ' +
  'home_team:teams!matches_home_team_id_fkey(id, name, short_name, tla, crest_url), ' +
  'away_team:teams!matches_away_team_id_fkey(id, name, short_name, tla, crest_url)'

export function hasStarted(match: Pick<Match, 'kickoff_at'>, now: Date): boolean {
  return new Date(match.kickoff_at).getTime() <= now.getTime()
}

export function isLive(match: Pick<Match, 'status'>): boolean {
  return match.status === 'in_play' || match.status === 'paused'
}

const DONE: MatchStatus[] = ['finished', 'cancelled']

// The matchday to open by default: the first one that still has a match to be
// played (or being played); after the season ends, the last one.
export function currentMatchday(matches: Pick<Match, 'matchday' | 'status'>[]): number | null {
  const days = [...new Set(matches.map((m) => m.matchday).filter((d): d is number => d !== null))].sort((a, b) => a - b)
  if (days.length === 0) return null
  const open = days.find((d) => matches.some((m) => m.matchday === d && !DONE.includes(m.status)))
  return open ?? days[days.length - 1]
}

// First matchday that has not kicked off yet, used as the default start of a new pool.
export function firstOpenMatchday(matches: Pick<Match, 'matchday' | 'kickoff_at'>[], now: Date): number | null {
  const byDay = new Map<number, number>()
  for (const m of matches) {
    if (m.matchday === null) continue
    const t = new Date(m.kickoff_at).getTime()
    byDay.set(m.matchday, Math.min(byDay.get(m.matchday) ?? Infinity, t))
  }
  const open = [...byDay.entries()].filter(([, first]) => first > now.getTime()).map(([d]) => d)
  return open.length ? Math.min(...open) : null
}

export function teamName(team: Team | null): string {
  return team?.short_name || team?.name || 'A definir'
}

const kickoffFormat = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
})

export function formatKickoff(iso: string): string {
  return kickoffFormat.format(new Date(iso))
}

// Distinct teams that play in a list of matches, by name.
export function teamsIn(matches: Pick<Match, 'home_team' | 'away_team'>[]): Team[] {
  const byId = new Map<number, Team>()
  for (const m of matches) {
    for (const t of [m.home_team, m.away_team]) if (t) byId.set(t.id, t)
  }
  return [...byId.values()].sort((a, b) => teamName(a).localeCompare(teamName(b), 'pt-BR'))
}

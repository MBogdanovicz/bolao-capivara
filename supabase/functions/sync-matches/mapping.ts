// Converts football-data.org (API v4) data into database rows.
// No dependencies, so it runs the same on Deno (Edge Function) and Node (tests).

export type ApiTeam = {
  id: number | null
  name: string | null
  shortName?: string | null
  tla?: string | null
  crest?: string | null
}

type ApiScorePair = { home: number | null; away: number | null }

export type ApiMatch = {
  id: number
  utcDate: string
  status: string
  matchday: number | null
  stage: string
  homeTeam: ApiTeam
  awayTeam: ApiTeam
  score: {
    winner: 'HOME_TEAM' | 'AWAY_TEAM' | 'DRAW' | null
    duration: string
    fullTime: ApiScorePair
    // Present in matches with extra time (not documented on the v4 match
    // page, hence optional).
    regularTime?: ApiScorePair | null
    penalties?: ApiScorePair | null
  }
}

export type ApiCompetition = {
  id: number
  name: string
  code: string
  type: string
  emblem?: string | null
}

export type ApiMatchesResponse = {
  competition: ApiCompetition
  filters: { season?: string | number }
  matches: ApiMatch[]
}

export type MatchStatus =
  | 'scheduled' | 'in_play' | 'paused' | 'finished' | 'postponed' | 'suspended' | 'cancelled'

const STATUS: Record<string, MatchStatus> = {
  SCHEDULED: 'scheduled',
  TIMED: 'scheduled',
  IN_PLAY: 'in_play',
  PAUSED: 'paused',
  FINISHED: 'finished',
  AWARDED: 'finished',
  POSTPONED: 'postponed',
  SUSPENDED: 'suspended',
  CANCELLED: 'cancelled',
}

// Stages with no "advancing team" (league and group stages).
const NON_KNOCKOUT_STAGES = new Set([
  'REGULAR_SEASON', 'GROUP_STAGE', 'CLAUSURA', 'APERTURA', 'CHAMPIONSHIP_ROUND', 'RELEGATION_ROUND',
])

export function mapStatus(status: string): MatchStatus {
  return STATUS[status] ?? 'scheduled'
}

export type MatchResult = {
  home_score: number | null
  away_score: number | null
  went_to_penalties: boolean | null
  advancing_side: 'HOME' | 'AWAY' | null
}

// Predictions are scored against regular time, so use regularTime when the
// match had extra time; otherwise fullTime.
export function matchResult(match: ApiMatch): MatchResult {
  const regular = match.score.regularTime ?? match.score.fullTime
  const finished = mapStatus(match.status) === 'finished'
  const knockout = !NON_KNOCKOUT_STAGES.has(match.stage)

  let advancing_side: MatchResult['advancing_side'] = null
  if (finished && knockout) {
    if (match.score.winner === 'HOME_TEAM') advancing_side = 'HOME'
    else if (match.score.winner === 'AWAY_TEAM') advancing_side = 'AWAY'
  }

  return {
    home_score: regular.home,
    away_score: regular.away,
    went_to_penalties: finished && knockout
      ? match.score.duration === 'PENALTY_SHOOTOUT' || match.score.penalties?.home != null
      : null,
    advancing_side,
  }
}

export function seasonOf(response: ApiMatchesResponse): number {
  const season = Number(response.filters.season)
  if (Number.isInteger(season) && season > 0) return season
  const first = response.matches[0]
  return first ? new Date(first.utcDate).getUTCFullYear() : new Date().getUTCFullYear()
}

export function teamsOf(matches: ApiMatch[]): ApiTeam[] {
  const byId = new Map<number, ApiTeam>()
  for (const m of matches) {
    for (const t of [m.homeTeam, m.awayTeam]) {
      if (t.id != null && t.name) byId.set(t.id, t)
    }
  }
  return [...byId.values()]
}

// One item of GET /v4/competitions.
export type ApiCompetitionListItem = ApiCompetition & {
  area?: { name?: string | null } | null
  currentSeason?: { startDate: string; endDate: string } | null
}

export type CompetitionRow = {
  api_id: number
  code: string
  name: string
  type: string
  emblem_url: string | null
  area_name: string | null
  current_season: number | null
  season_label: string | null
  season_ends_on: string | null
}

// The season is identified by its start year, the same value the matches
// endpoint reports in filters.season. Seasons spanning two years are labeled
// '2026/27'.
export function competitionRow(c: ApiCompetitionListItem): CompetitionRow {
  const season = c.currentSeason ?? null
  const start = season ? Number(season.startDate.slice(0, 4)) : null
  const end = season ? Number(season.endDate.slice(0, 4)) : null
  return {
    api_id: c.id,
    code: c.code,
    name: c.name,
    type: c.type,
    emblem_url: c.emblem ?? null,
    area_name: c.area?.name ?? null,
    current_season: start,
    season_label: start == null ? null : end != null && end !== start ? `${start}/${String(end).slice(-2)}` : String(start),
    season_ends_on: season?.endDate ?? null,
  }
}

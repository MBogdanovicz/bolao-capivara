// Conversão dos dados da football-data.org (API v4) para as linhas do banco.
// Sem dependências, para rodar igual no Deno (Edge Function) e no Node (testes).

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
    // Presentes em jogos com prorrogação (formato não documentado na página
    // de match da v4, por isso tudo opcional).
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

// Fases sem "quem avança" (pontos corridos e grupos).
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

// O palpite vale para o tempo regular, então usa regularTime quando o jogo
// teve prorrogação; senão, fullTime.
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

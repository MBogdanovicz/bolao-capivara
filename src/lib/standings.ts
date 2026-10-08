// League table computed from the synced matches, so it needs no extra API
// call and moves with live scores. Only for league formats (one table for
// everyone): REGULAR_SEASON, or a cup's LEAGUE_STAGE.

import type { Match, Team } from './matches.ts'

export type Standing = {
  team: Team
  position: number
  points: number
  played: number
  won: number
  drawn: number
  lost: number
  goalsFor: number
  goalsAgainst: number
  live: boolean // playing now: the row includes the current score
}

const TABLE_STAGES = new Set(['REGULAR_SEASON', 'LEAGUE_STAGE'])

type TableMatch = Pick<Match, 'stage' | 'status' | 'home_score' | 'away_score' | 'home_team' | 'away_team'>

export function hasTable(matches: Pick<Match, 'stage'>[]): boolean {
  return matches.some((m) => TABLE_STAGES.has(m.stage))
}

// Order: points, wins, goal difference, goals scored (the Brasileirão's
// criteria, shared by most leagues); then name.
export function standings(matches: TableMatch[]): Standing[] {
  const rows = new Map<number, Standing>()
  const row = (team: Team) => {
    let r = rows.get(team.id)
    if (!r) {
      r = { team, position: 0, points: 0, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, live: false }
      rows.set(team.id, r)
    }
    return r
  }

  for (const m of matches) {
    if (!TABLE_STAGES.has(m.stage) || !m.home_team || !m.away_team) continue
    const home = row(m.home_team)
    const away = row(m.away_team)
    const live = m.status === 'in_play' || m.status === 'paused'
    if ((m.status !== 'finished' && !live) || m.home_score === null || m.away_score === null) continue
    for (const [r, gf, ga] of [[home, m.home_score, m.away_score], [away, m.away_score, m.home_score]] as const) {
      r.played++
      r.goalsFor += gf
      r.goalsAgainst += ga
      if (gf > ga) { r.won++; r.points += 3 }
      else if (gf === ga) { r.drawn++; r.points += 1 }
      else r.lost++
      if (live) r.live = true
    }
  }

  const key = (r: Standing) => [r.points, r.won, r.goalsFor - r.goalsAgainst, r.goalsFor]
  const sorted = [...rows.values()].sort((a, b) => {
    const ka = key(a), kb = key(b)
    for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return kb[i] - ka[i]
    return a.team.name.localeCompare(b.team.name, 'pt-BR')
  })
  sorted.forEach((r, i) => { r.position = i + 1 })
  return sorted
}

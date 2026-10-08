// The Capivara's predictions. Each team gets an attack and a defense rating
// from this season's finished matches (pulled towards the league average
// while there are few games), which give the expected goals of each side.
// The score is then drawn from those expectations, so a strong home side
// usually wins but upsets and odd scores happen: semi-random, like a real
// friend's guess. The draw is seeded by pool and match, so it never changes
// on a re-run and each pool's Capivara has its own guesses.

export type Result = { home_team_id: number; away_team_id: number; home_score: number; away_score: number }

export type Fixture = { pool_id: string; match_id: number; stage: string; home_team_id: number; away_team_id: number }

export type Guess = {
  home_score: number
  away_score: number
  advancing_team_id: number | null
  went_to_penalties: boolean | null
}

// League-wide goals per game when there is no data yet.
const DEFAULT_HOME = 1.4
const DEFAULT_AWAY = 1.1
// Games' worth of league average mixed into each team's numbers.
const PRIOR_GAMES = 5
const MAX_GOALS = 6
// Expected goals stay within what football actually sees.
const MIN_XG = 0.3
const MAX_XG = 3.5

// Stages without a team going through.
const NO_KNOCKOUT = new Set(['REGULAR_SEASON', 'GROUP_STAGE', 'LEAGUE_STAGE'])

export function expectedGoals(results: Result[], homeId: number, awayId: number): { home: number; away: number } {
  const games = results.length
  const avgHome = games ? results.reduce((n, r) => n + r.home_score, 0) / games : DEFAULT_HOME
  const avgAway = games ? results.reduce((n, r) => n + r.away_score, 0) / games : DEFAULT_AWAY
  const avg = (avgHome + avgAway) / 2 || 1

  function rating(team: number) {
    let played = 0, scored = 0, conceded = 0
    for (const r of results) {
      if (r.home_team_id === team) { played++; scored += r.home_score; conceded += r.away_score }
      else if (r.away_team_id === team) { played++; scored += r.away_score; conceded += r.home_score }
    }
    return {
      attack: (scored + PRIOR_GAMES * avg) / (played + PRIOR_GAMES) / avg,
      defense: (conceded + PRIOR_GAMES * avg) / (played + PRIOR_GAMES) / avg,
    }
  }

  const h = rating(homeId)
  const a = rating(awayId)
  const clamp = (x: number) => Math.min(MAX_XG, Math.max(MIN_XG, x))
  return { home: clamp(avgHome * h.attack * a.defense), away: clamp(avgAway * a.attack * h.defense) }
}

// Small, seedable random generator (mulberry32), seeded from a string.
export function seeded(seed: string): () => number {
  let s = 0
  for (let i = 0; i < seed.length; i++) s = Math.imul(s ^ seed.charCodeAt(i), 2654435761) >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// A goal count drawn from a Poisson distribution with mean `lambda`.
function poisson(lambda: number, random: () => number): number {
  const u = random()
  let p = Math.exp(-lambda), sum = p, k = 0
  while (u > sum && k < MAX_GOALS) {
    k++
    p *= lambda / k
    sum += p
  }
  return k
}

export function guess(fixture: Fixture, results: Result[]): Guess {
  const random = seeded(`${fixture.pool_id}/${fixture.match_id}`)
  const xg = expectedGoals(results, fixture.home_team_id, fixture.away_team_id)
  const home = poisson(xg.home, random)
  const away = poisson(xg.away, random)
  if (NO_KNOCKOUT.has(fixture.stage)) return { home_score: home, away_score: away, advancing_team_id: null, went_to_penalties: null }
  // Knockout: the winner goes through; a draw goes to penalties, where the
  // stronger side is likelier to win.
  const penalties = home === away
  const homeThrough = penalties ? random() < xg.home / (xg.home + xg.away) : home > away
  return {
    home_score: home,
    away_score: away,
    advancing_team_id: homeThrough ? fixture.home_team_id : fixture.away_team_id,
    went_to_penalties: penalties,
  }
}

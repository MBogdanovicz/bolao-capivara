// Edge Function: fetches competitions, matches and results from
// football-data.org, and team names, crests and squads from ESPN (espn.ts).
// Called by pg_cron every 10 minutes (supabase/setup/schedule.sql). Each run:
//   1. fetches the list of competitions the API key can access, once a day;
//   2. fetches the matches of each competition that is due (competitions_due():
//      a match in progress, or over 6 hours since the last fetch), at most
//      MAX_REQUESTS football-data.org calls in all;
//   3. pairs new teams with ESPN teams through a few days of fixtures;
//   4. fetches from ESPN the squads that are due (squads_due());
//   5. when a season ends, answers its automatic bonus questions (champion,
//      top N, relegated, top scorer; see bonus.ts).
//
// Secrets (Edge Functions > Secrets): FOOTBALL_DATA_API_KEY and CRON_SECRET.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.

import { createClient } from '@supabase/supabase-js'
import { type ApiStandingsResponse, type AutoKind, type EspnStatisticsResponse, officialAnswer, tableOf, topScorersOf } from './bonus.ts'
import {
  ESPN_LEAGUES, type FdMatch, espnDate, espnGet, eventsOf, pairTeams, rosterOf, teamLook,
} from './espn.ts'
import {
  type ApiCompetitionListItem, type ApiMatchesResponse, competitionRow, mapStatus, matchResult, seasonOf, teamsOf,
} from './mapping.ts'

const API_URL = 'https://api.football-data.org/v4'
// football-data.org allows 10 requests per minute; runs are 10 minutes apart.
const MAX_REQUESTS = 8
// ESPN has no published limit; keep each run small anyway.
const ESPN_DAYS_PER_RUN = 3
const ESPN_SQUADS_PER_RUN = 10
const LIST_EVERY_MS = 24 * 3600_000

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  const cronSecret = Deno.env.get('CRON_SECRET')
  if (!cronSecret || req.headers.get('x-cron-secret') !== cronSecret) {
    return json({ error: 'unauthorized' }, 401)
  }

  const apiKey = Deno.env.get('FOOTBALL_DATA_API_KEY')
  if (!apiKey) return json({ error: 'FOOTBALL_DATA_API_KEY is not set' }, 500)

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  // force: fetch the competition list now. competitions: fetch these codes now.
  const body = await req.json().catch(() => ({})) as { force?: boolean; competitions?: string[] }

  let budget = MAX_REQUESTS
  const api = (path: string) => {
    budget--
    return fetch(`${API_URL}${path}`, { headers: { 'X-Auth-Token': apiKey } })
  }
  const results: Record<string, unknown>[] = []

  // 1. Competition list.
  const { data: state } = await db.from('sync_state').select('competitions_listed_at').eq('id', 1).single()
  const listedAt = state?.competitions_listed_at ? new Date(state.competitions_listed_at).getTime() : 0
  if (body.force || Date.now() - listedAt > LIST_EVERY_MS) {
    const res = await api('/competitions')
    if (res.ok) {
      const { competitions } = (await res.json()) as { competitions: ApiCompetitionListItem[] }
      const { error } = await db.from('competitions').upsert(competitions.map(competitionRow), { onConflict: 'api_id' })
      if (error) results.push({ step: 'competitions', error: error.message })
      else {
        await db.from('sync_state').update({ competitions_listed_at: new Date().toISOString() }).eq('id', 1)
        results.push({ step: 'competitions', count: competitions.length })
      }
    } else {
      results.push({ step: 'competitions', error: `football-data.org responded ${res.status}` })
    }
  }

  // 2. Matches.
  let codes = body.competitions
  if (!codes) {
    const { data, error } = await db.rpc('competitions_due')
    if (error) return json({ error: error.message }, 500)
    codes = (data as { code: string }[]).map((r) => r.code)
  }
  for (const code of codes) {
    if (budget <= 0) break
    const res = await api(`/competitions/${code}/matches`)
    if (!res.ok) {
      results.push({ code, error: `football-data.org responded ${res.status}` })
      if (res.status === 429) break
      // Not in the plan or gone: try again only after the usual 6 hours.
      if (res.status === 403 || res.status === 404) {
        await db.from('competitions').update({ synced_at: new Date().toISOString() }).eq('code', code)
      }
      continue
    }
    results.push({ code, ...(await save(db, (await res.json()) as ApiMatchesResponse)) })
  }

  // 3. Pair teams with ESPN, a few match days per run.
  results.push(...(await pairWithEspn(db)))

  // 4. Squads from ESPN.
  const { data: squads, error: squadErr } = await db.rpc('squads_due').limit(ESPN_SQUADS_PER_RUN)
  if (squadErr) return json({ error: squadErr.message }, 500)
  for (const t of squads as { id: number; espn_id: string; espn_league: string }[]) {
    results.push({ team: t.id, ...(await saveSquad(db, t)) })
  }

  // 5. Bonus questions of seasons that just ended.
  const { data: seasons, error: seasonErr } = await db.rpc('seasons_to_resolve')
  if (seasonErr) return json({ error: seasonErr.message }, 500)
  for (const s of seasons as Season[]) {
    if (s.type === 'LEAGUE' && budget <= 0) break
    const standings = s.type === 'LEAGUE' ? await api(`/competitions/${s.code}/standings?season=${s.season}`) : null
    results.push({ resolve: `${s.code}/${s.season}`, ...(await resolveSeason(db, s, standings)) })
  }

  const failed = results.some((r) => 'error' in r)
  return json({ results, requests: MAX_REQUESTS - budget }, failed ? 502 : 200)
})

// deno-lint-ignore no-explicit-any
async function save(db: any, data: ApiMatchesResponse) {
  const season = seasonOf(data)
  const c = data.competition

  const { data: competition, error: compErr } = await db
    .from('competitions')
    .upsert(
      { api_id: c.id, code: c.code, name: c.name, type: c.type, current_season: season, emblem_url: c.emblem ?? null },
      { onConflict: 'api_id' },
    )
    .select('id')
    .single()
  if (compErr) return { error: compErr.message }

  // New teams only: names and crests of known teams come from ESPN.
  const apiTeams = teamsOf(data.matches)
  const { error: insertErr } = await db
    .from('teams')
    .upsert(
      apiTeams.map((t) => ({
        api_id: t.id, name: t.name, short_name: t.shortName ?? null, tla: t.tla ?? null, crest_url: t.crest ?? null,
      })),
      { onConflict: 'api_id', ignoreDuplicates: true },
    )
  if (insertErr) return { error: insertErr.message }
  const { data: teams, error: teamErr } = await db.from('teams').select('id, api_id').in('api_id', apiTeams.map((t) => t.id))
  if (teamErr) return { error: teamErr.message }

  const teamId = new Map<number, number>((teams as { id: number; api_id: number }[]).map((t) => [t.api_id, t.id]))
  const idOf = (apiId: number | null) => (apiId == null ? null : teamId.get(apiId) ?? null)

  const rows = data.matches.map((m) => {
    const r = matchResult(m)
    const home = idOf(m.homeTeam.id)
    const away = idOf(m.awayTeam.id)
    return {
      api_id: m.id,
      competition_id: competition.id,
      season,
      matchday: m.matchday,
      stage: m.stage,
      home_team_id: home,
      away_team_id: away,
      kickoff_at: m.utcDate,
      status: mapStatus(m.status),
      home_score: r.home_score,
      away_score: r.away_score,
      went_to_penalties: r.went_to_penalties,
      advancing_team_id: r.advancing_side === 'HOME' ? home : r.advancing_side === 'AWAY' ? away : null,
    }
  })

  const { error: matchErr } = await db.from('matches').upsert(rows, { onConflict: 'api_id' })
  if (matchErr) return { error: matchErr.message }
  await db.from('competitions').update({ synced_at: new Date().toISOString() }).eq('id', competition.id)
  return { season, teams: teamId.size, matches: rows.length }
}

type Season = { competition_id: number; code: string; type: string; season: number }

// Sets the official answer of every open automatic question of a finished
// season; the database then gives out the points.
// deno-lint-ignore no-explicit-any
async function resolveSeason(db: any, s: Season, standings: Response | null) {
  if (standings && !standings.ok) return { error: `football-data.org responded ${standings.status}` }
  const apiTable = standings ? tableOf((await standings.json()) as ApiStandingsResponse) : []

  const { data: teams } = await db.from('teams').select('id, api_id').in('api_id', apiTable)
  const idOf = new Map<number, number>((teams ?? []).map((t: { id: number; api_id: number }) => [t.api_id, t.id]))
  const table = apiTable.map((apiId) => idOf.get(apiId)).filter((id): id is number => id != null)

  const { data: final } = await db
    .from('matches')
    .select('advancing_team_id')
    .eq('competition_id', s.competition_id)
    .eq('season', s.season)
    .eq('stage', 'FINAL')
    .maybeSingle()

  let scorers: string[] = []
  const league = ESPN_LEAGUES[s.code]
  if (league) {
    const res = await espnGet(`${league}/statistics`)
    if (res.ok) scorers = topScorersOf(res.data as EspnStatisticsResponse)
  }

  const outcome = { table, champion: final?.advancing_team_id ?? null, scorers }
  const { data: questions, error } = await db
    .from('pool_questions')
    .select('id, kind, answer_count, pools!inner(competition_id, season)')
    .eq('pools.competition_id', s.competition_id)
    .eq('pools.season', s.season)
    .neq('kind', 'free')
    .is('official_answer', null)
  if (error) return { error: error.message }

  let answered = 0
  for (const q of questions as { id: number; kind: AutoKind; answer_count: number }[]) {
    const answer = officialAnswer(q.kind, q.answer_count, outcome)
    if (!answer) continue
    const { error } = await db.from('pool_questions').update({ official_answer: answer }).eq('id', q.id)
    if (!error) answered++
  }
  return { answered, open: questions.length - answered }
}

type UnpairedRow = {
  code: string; kickoff_at: string
  home_id: number; home_name: string; home_short: string | null; home_tla: string | null
  away_id: number; away_name: string; away_short: string | null; away_tla: string | null
}

// Looks up, on ESPN's scoreboard, a few days with games of teams not yet
// paired, and copies ESPN's name and crest onto the teams it can pair.
// deno-lint-ignore no-explicit-any
async function pairWithEspn(db: any): Promise<Record<string, unknown>[]> {
  const { data, error } = await db.rpc('unpaired_matches')
  if (error) return [{ step: 'espn', error: error.message }]

  const days = new Map<string, { league: string; date: string; matches: FdMatch[] }>()
  for (const r of data as UnpairedRow[]) {
    const league = ESPN_LEAGUES[r.code]
    if (!league) continue
    const date = espnDate(r.kickoff_at)
    const day = days.get(`${league}/${date}`) ?? { league, date, matches: [] }
    day.matches.push({
      kickoff_at: r.kickoff_at,
      home: { id: r.home_id, name: r.home_name, short_name: r.home_short, tla: r.home_tla },
      away: { id: r.away_id, name: r.away_name, short_name: r.away_short, tla: r.away_tla },
    })
    days.set(`${league}/${date}`, day)
  }

  // Random days, so a day ESPN cannot match does not block the others.
  const picked = [...days.values()].sort(() => Math.random() - 0.5).slice(0, ESPN_DAYS_PER_RUN)
  const results: Record<string, unknown>[] = []
  for (const day of picked) {
    const res = await espnGet(`${day.league}/scoreboard?dates=${day.date}`)
    if (!res.ok) {
      results.push({ espn: `${day.league}/${day.date}`, error: res.error })
      continue
    }
    const pairs = pairTeams(day.matches, eventsOf(res.data as Parameters<typeof eventsOf>[0]))
    let paired = 0
    for (const [teamId, espnTeam] of pairs) {
      const { error } = await db.from('teams').update(teamLook(espnTeam, day.league)).eq('id', teamId).is('espn_id', null)
      if (!error) paired++
    }
    results.push({ espn: `${day.league}/${day.date}`, paired })
  }
  return results
}

// Saves a team's squad from ESPN. Players who left the team keep their row
// (answers may name them) but lose the team.
// deno-lint-ignore no-explicit-any
async function saveSquad(db: any, team: { id: number; espn_id: string; espn_league: string }) {
  const res = await espnGet(`${team.espn_league}/teams/${team.espn_id}/roster`)
  if (!res.ok) return { error: res.error }
  const players = rosterOf(res.data as Parameters<typeof rosterOf>[0])

  if (players.length > 0) {
    const { error } = await db.from('players').upsert(players.map((p) => ({ ...p, team_id: team.id })), { onConflict: 'espn_id' })
    if (error) return { error: error.message }
  }
  const { error: leftErr } = await db
    .from('players')
    .update({ team_id: null })
    .eq('team_id', team.id)
    .not('espn_id', 'in', `(${players.map((p) => `"${p.espn_id}"`).join(',') || '""'})`)
  if (leftErr) return { error: leftErr.message }

  await db.from('teams').update({ squad_synced_at: new Date().toISOString() }).eq('id', team.id)
  return { players: players.length }
}

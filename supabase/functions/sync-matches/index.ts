// Edge Function: fetches matches and results from football-data.org and saves them.
// Called by pg_cron every 10 minutes (supabase/setup/schedule.sql). It only calls
// the API when a match is in progress or the last full sync is more than 6 hours
// old, staying well below the 10 requests/minute limit.
//
// Secrets (Edge Functions > Secrets): FOOTBALL_DATA_API_KEY and CRON_SECRET.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.

import { createClient } from '@supabase/supabase-js'
import { type ApiMatchesResponse, mapStatus, matchResult, seasonOf, teamsOf } from './mapping.ts'

const API_URL = 'https://api.football-data.org/v4'
const DEFAULT_COMPETITIONS = ['BSA']

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
  const body = await req.json().catch(() => ({})) as { force?: boolean; competitions?: string[] }

  if (!body.force) {
    const { data: due, error } = await db.rpc('sync_due')
    if (error) return json({ error: error.message }, 500)
    if (!due) return json({ skipped: true })
  }

  const results = []
  for (const code of body.competitions ?? DEFAULT_COMPETITIONS) {
    const res = await fetch(`${API_URL}/competitions/${code}/matches`, { headers: { 'X-Auth-Token': apiKey } })
    if (!res.ok) {
      results.push({ code, error: `football-data.org responded ${res.status}` })
      continue
    }
    results.push({ code, ...(await save(db, (await res.json()) as ApiMatchesResponse)) })
  }

  const failed = results.some((r) => 'error' in r)
  if (!failed) await db.from('sync_state').update({ last_sync_at: new Date().toISOString() }).eq('id', 1)
  return json({ results }, failed ? 502 : 200)
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

  const { data: teams, error: teamErr } = await db
    .from('teams')
    .upsert(
      teamsOf(data.matches).map((t) => ({
        api_id: t.id, name: t.name, short_name: t.shortName ?? null, tla: t.tla ?? null, crest_url: t.crest ?? null,
      })),
      { onConflict: 'api_id' },
    )
    .select('id, api_id')
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
  return { season, teams: teamId.size, matches: rows.length }
}

// ESPN's public site API (unofficial, no key) gives team names in Portuguese,
// current crests and squads. football-data.org stays the source of fixtures,
// rounds and results; ESPN only supplies how teams look.
//
// Teams are matched through fixtures: a football-data match and an ESPN event
// with the same kickoff are the same game, so their home teams are the same
// team, and so are their away teams. Names only break ties between games that
// kick off at the same time.
// No dependencies, so it runs the same on Deno (Edge Function) and Node (tests).

export const ESPN_URL = 'https://site.api.espn.com/apis/site/v2/sports/soccer'

// ESPN answers 403 to requests that do not look like they come from a
// browser (Deno's default User-Agent, for instance), so send browser headers.
const ESPN_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
  'Referer': 'https://www.espn.com.br/',
  'Origin': 'https://www.espn.com.br',
}

// GET {ESPN_URL}/{path} in Portuguese. On failure, the error names the status
// and the start of the body, which says who refused the request.
export async function espnGet(path: string): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  const sep = path.includes('?') ? '&' : '?'
  const res = await fetch(`${ESPN_URL}/${path}${sep}lang=pt&region=br`, { headers: ESPN_HEADERS })
  if (res.ok) return { ok: true, data: await res.json() }
  const body = (await res.text()).replace(/\s+/g, ' ').slice(0, 160)
  return { ok: false, error: `ESPN responded ${res.status}: ${body}` }
}

// football-data.org competition code -> ESPN league slug.
export const ESPN_LEAGUES: Record<string, string> = {
  BSA: 'bra.1',
  PL: 'eng.1',
  ELC: 'eng.2',
  PD: 'esp.1',
  SA: 'ita.1',
  BL1: 'ger.1',
  FL1: 'fra.1',
  DED: 'ned.1',
  PPL: 'por.1',
  CL: 'uefa.champions',
  EC: 'uefa.euro',
  WC: 'fifa.world',
}

export type EspnTeam = {
  id: string
  displayName: string
  shortDisplayName?: string | null
  abbreviation?: string | null
  logo?: string | null
}

export type EspnEvent = { date: string; home: EspnTeam; away: EspnTeam }

type ScoreboardResponse = {
  events?: {
    date: string
    competitions?: { competitors?: { homeAway: 'home' | 'away'; team: EspnTeam }[] }[]
  }[]
}

export function eventsOf(response: ScoreboardResponse): EspnEvent[] {
  const out: EspnEvent[] = []
  for (const e of response.events ?? []) {
    const competitors = e.competitions?.[0]?.competitors ?? []
    const home = competitors.find((c) => c.homeAway === 'home')?.team
    const away = competitors.find((c) => c.homeAway === 'away')?.team
    if (home?.id && away?.id) out.push({ date: e.date, home, away })
  }
  return out
}

// The scoreboard's ?dates=YYYYMMDD is a day in US Eastern time.
export function espnDate(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(iso))
  return parts.replaceAll('-', '')
}

const STOPWORDS = new Set([
  'fc', 'cf', 'ec', 'sc', 'ac', 'ca', 'se', 'cr', 'afc', 'sad', 'de', 'da', 'do', 'del', 'la', 'le',
  'clube', 'club', 'esporte', 'futebol', 'football', 'regatas', 'sport', 'associacao',
])

function tokens(...names: (string | null | undefined)[]): Set<string> {
  const out = new Set<string>()
  for (const name of names) {
    for (const t of (name ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/[^a-z0-9]+/)) {
      if (t.length > 1 && !STOPWORDS.has(t)) out.add(t)
    }
  }
  return out
}

export type FdTeam = { name: string; short_name: string | null; tla: string | null }

// How alike a football-data team and an ESPN team look: same three-letter
// code, plus one per shared word.
export function similarity(fd: FdTeam, espn: EspnTeam): number {
  const a = tokens(fd.name, fd.short_name)
  const b = tokens(espn.displayName, espn.shortDisplayName)
  let score = fd.tla && espn.abbreviation && fd.tla.toUpperCase() === espn.abbreviation.toUpperCase() ? 2 : 0
  for (const t of a) if (b.has(t)) score++
  return score
}

export type FdMatch = { kickoff_at: string; home: FdTeam & { id: number }; away: FdTeam & { id: number } }

// Pairs football-data teams with ESPN teams using games found in both.
// Returns football-data team id -> ESPN team.
export function pairTeams(matches: FdMatch[], events: EspnEvent[]): Map<number, EspnTeam> {
  const byKickoff = new Map<number, EspnEvent[]>()
  for (const e of events) {
    const t = new Date(e.date).getTime()
    byKickoff.set(t, [...(byKickoff.get(t) ?? []), e])
  }

  const pairs = new Map<number, EspnTeam>()
  for (const m of matches) {
    const candidates = byKickoff.get(new Date(m.kickoff_at).getTime()) ?? []
    let best: EspnEvent | null = null
    if (candidates.length === 1) best = candidates[0]
    else {
      // Several games at once: take the clearly most alike, or none.
      const scored = candidates
        .map((e) => ({ e, score: similarity(m.home, e.home) + similarity(m.away, e.away) }))
        .sort((x, y) => y.score - x.score)
      if (scored.length > 0 && scored[0].score > 0 && (scored.length === 1 || scored[0].score > scored[1].score)) {
        best = scored[0].e
      }
    }
    if (best) {
      pairs.set(m.home.id, best.home)
      pairs.set(m.away.id, best.away)
    }
  }
  return pairs
}

// Team columns that come from ESPN once a team is paired.
export function teamLook(t: EspnTeam, league: string) {
  return {
    espn_id: t.id,
    espn_league: league,
    name: t.displayName.trim(),
    short_name: t.shortDisplayName?.trim() || null,
    crest_url: t.logo ?? null,
  }
}

type Athlete = { id: string | number; displayName?: string | null; fullName?: string | null; position?: { name?: string | null } | null }

// GET /{league}/teams/{id}/roster lists athletes directly, or grouped by
// position ({ items }) in some sports; accept both.
export function rosterOf(response: { athletes?: (Athlete | { items?: Athlete[] })[] }) {
  const athletes = (response.athletes ?? []).flatMap((a) => ('items' in a && Array.isArray(a.items) ? a.items : [a as Athlete]))
  const out: { espn_id: string; name: string; position: string | null }[] = []
  for (const a of athletes) {
    const name = (a.displayName ?? a.fullName ?? '').trim()
    if (a.id != null && name) out.push({ espn_id: String(a.id), name, position: a.position?.name ?? null })
  }
  return out
}

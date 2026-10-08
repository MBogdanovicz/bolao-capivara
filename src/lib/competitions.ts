// Competitions offered when creating a pool: every one the sync found in the
// API, finished seasons last and marked as such.

export type Competition = {
  id: number
  name: string
  type: string
  area_name: string | null
  current_season: number | null
  season_label: string | null
  season_ends_on: string | null
}

export const COMPETITION_SELECT = 'id, name, type, area_name, current_season, season_label, season_ends_on'

export function hasEnded(c: Competition, today: Date): boolean {
  return c.season_ends_on !== null && new Date(`${c.season_ends_on}T23:59:59Z`) < today
}

export function seasonLabel(c: Pick<Competition, 'season_label' | 'current_season'>, season = c.current_season): string {
  return season === c.current_season && c.season_label ? c.season_label : String(season ?? '')
}

// The API names areas in English; these are the areas of its free plan.
const AREAS: Record<string, string> = {
  Brazil: 'Brasil', England: 'Inglaterra', Spain: 'Espanha', Italy: 'Itália', Germany: 'Alemanha',
  France: 'França', Netherlands: 'Holanda', Portugal: 'Portugal', Europe: 'Europa', World: 'Mundo',
}

export function competitionLabel(c: Competition, today: Date): string {
  const area = c.area_name ? ` (${AREAS[c.area_name] ?? c.area_name})` : ''
  return `${c.name}${area} ${seasonLabel(c)}${hasEnded(c, today) ? ' · encerrado' : ''}`
}

// Running seasons first, Brazilian ones on top, then by name.
export function sortCompetitions(list: Competition[], today: Date): Competition[] {
  const rank = (c: Competition) => (hasEnded(c, today) ? 2 : c.area_name === 'Brazil' ? 0 : 1)
  return [...list].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, 'pt-BR'))
}

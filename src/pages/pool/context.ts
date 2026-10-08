import { useOutletContext } from 'react-router'
import type { Rule } from '../../lib/rules'

export type Pool = {
  id: string
  name: string
  owner_id: string
  invite_code: string
  competition_id: number
  season: number
  first_matchday: number | null
  scoring_rules: Rule[]
  competition: { name: string; type: string; current_season: number | null; season_label: string | null } | null
}

export type Member = { user_id: string; role: 'owner' | 'member'; nickname: string; avatar_url: string | null }

export type PoolContext = {
  pool: Pool
  members: Member[]
  userId: string
  isOwner: boolean
}

export function usePool() {
  return useOutletContext<PoolContext>()
}

import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useParams } from 'react-router'
import { useAuth } from '../../auth/context'
import { seasonLabel } from '../../lib/competitions'
import { describeRules } from '../../lib/rules'
import { supabase } from '../../lib/supabase'
import type { Member, Pool, PoolContext } from './context'

type MemberRow = { user_id: string; role: Member['role']; profile: { nickname: string; avatar_url: string | null } | null }

export default function PoolLayout() {
  const { poolId = '' } = useParams()
  const { session } = useAuth()
  const [pool, setPool] = useState<Pool | null | undefined>(undefined)
  const [members, setMembers] = useState<Member[]>([])
  const [showInvite, setShowInvite] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    supabase
      .from('pools')
      .select('id, name, owner_id, invite_code, competition_id, season, first_matchday, scoring_rules, competition:competitions(name, type, current_season, season_label)')
      .eq('id', poolId)
      .maybeSingle()
      .then(({ data }) => setPool((data as Pool | null) ?? null))
    supabase
      .from('pool_members')
      .select('user_id, role, profile:profiles(nickname, avatar_url)')
      .eq('pool_id', poolId)
      .then(({ data }) =>
        setMembers(
          ((data ?? []) as unknown as MemberRow[]).map((m) => ({
            user_id: m.user_id,
            role: m.role,
            nickname: m.profile?.nickname ?? 'Capivara',
            avatar_url: m.profile?.avatar_url ?? null,
          })),
        ),
      )
  }, [poolId])

  if (pool === undefined) return <main className="page"><p>Carregando…</p></main>
  if (pool === null || !session) {
    return (
      <main className="page">
        <p>Bolão não encontrado. Para entrar num bolão, use o link de convite.</p>
        <Link to="/">Voltar</Link>
      </main>
    )
  }

  const userId = session.user.id
  const context: PoolContext = { pool, members, userId, isOwner: pool.owner_id === userId }
  const inviteUrl = `${window.location.origin}/convite/${pool.invite_code}`

  async function share() {
    const text = `Entra no bolão "${pool!.name}" no Bolão Capivara:`
    if (navigator.share) {
      try {
        await navigator.share({ title: pool!.name, text, url: inviteUrl })
        return
      } catch {
        // Cancelled or not allowed: fall back to copying.
      }
    }
    await navigator.clipboard.writeText(inviteUrl)
    setCopied(true)
  }

  return (
    <main className="page">
      <header className="bar">
        <Link to="/" aria-label="Meus bolões">‹ Bolões</Link>
        <button type="button" className="link" onClick={() => setShowInvite(!showInvite)}>Convidar</button>
      </header>
      <h1>{pool.name}</h1>
      <p className="hint">
        {pool.competition?.name} {pool.competition ? seasonLabel(pool.competition, pool.season) : pool.season}
        {pool.first_matchday ? ` · desde a rodada ${pool.first_matchday}` : ''} · {members.length}{' '}
        {members.length === 1 ? 'participante' : 'participantes'}
      </p>

      {showInvite && (
        <section className="card">
          <p>Mande este link para quem você quer no bolão:</p>
          <p className="invite">{inviteUrl}</p>
          <button type="button" onClick={share}>{copied ? 'Link copiado' : 'Compartilhar convite'}</button>
          <details>
            <summary>Regras de pontuação</summary>
            <ul>{describeRules(pool.scoring_rules).map((r) => <li key={r}>{r}</li>)}</ul>
            <p className="hint">Placar exato vale sozinho. Senão, as outras regras que acertar se somam.</p>
          </details>
        </section>
      )}

      <nav className="tabs">
        <NavLink to="" end>Palpites</NavLink>
        <NavLink to="ranking">Ranking</NavLink>
        <NavLink to="bonus">Bônus</NavLink>
      </nav>

      <Outlet context={context} />
    </main>
  )
}

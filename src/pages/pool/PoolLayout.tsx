import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useParams } from 'react-router'
import { useAuth } from '../../auth/context'
import RulesSummary, { type QuestionSummary } from '../../components/RulesSummary'
import { seasonLabel } from '../../lib/competitions'
import { supabase } from '../../lib/supabase'
import type { Member, Pool, PoolContext } from './context'
import DescriptionEditor from './DescriptionEditor'
import MembersCard from './MembersCard'

type MemberRow = { user_id: string; role: Member['role']; profile: { nickname: string; avatar_url: string | null } | null }

export default function PoolLayout() {
  const { poolId = '' } = useParams()
  const { session } = useAuth()
  const [pool, setPool] = useState<Pool | null | undefined>(undefined)
  const [members, setMembers] = useState<Member[]>([])
  const [panel, setPanel] = useState<'invite' | 'members' | 'description' | 'rules' | null>(null)
  const [questions, setQuestions] = useState<QuestionSummary[] | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    supabase
      .from('pools')
      .select('id, name, owner_id, invite_code, competition_id, season, first_matchday, scoring_rules, description, competition:competitions(name, type, current_season, season_label)')
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

  function toggle(p: typeof panel) {
    setPanel(panel === p ? null : p)
    if (p === 'rules' && questions === null) {
      supabase
        .from('pool_questions')
        .select('prompt, points, answer_count, closes_at')
        .eq('pool_id', poolId)
        .order('closes_at')
        .then(({ data }) => setQuestions((data ?? []) as QuestionSummary[]))
    }
  }

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
        <span className="actions">
          <button type="button" className="link" onClick={() => toggle('members')}>Participantes</button>
          <button type="button" className="link" onClick={() => toggle('invite')}>Convidar</button>
        </span>
      </header>
      <h1>{pool.name}</h1>
      <p className="hint">
        {pool.competition?.name} {pool.competition ? seasonLabel(pool.competition, pool.season) : pool.season}
        {pool.first_matchday ? ` · desde a rodada ${pool.first_matchday}` : ''} · {members.length}{' '}
        {members.length === 1 ? 'participante' : 'participantes'} ·{' '}
        <button type="button" className="link" onClick={() => toggle('rules')}>{panel === 'rules' ? 'Esconder regras' : 'Ver regras'}</button>
      </p>

      {panel === 'description' ? (
        <DescriptionEditor poolId={pool.id} value={pool.description} onCancel={() => setPanel(null)}
          onSaved={(description) => { setPool({ ...pool, description }); setPanel(null) }} />
      ) : (
        <>
          {pool.description && <p className="description">{pool.description}</p>}
          {context.isOwner && (
            <button type="button" className="link" onClick={() => setPanel('description')}>
              {pool.description ? 'Editar descrição' : 'Adicionar descrição'}
            </button>
          )}
        </>
      )}

      {panel === 'members' && (
        <MembersCard poolId={pool.id} poolName={pool.name} members={members} userId={userId} isOwner={context.isOwner}
          onRemoved={(id) => setMembers(members.filter((m) => m.user_id !== id))} />
      )}

      {panel === 'invite' && (
        <section className="card">
          <p>Mande este link para quem você quer no bolão:</p>
          <p className="invite">{inviteUrl}</p>
          <button type="button" onClick={share}>{copied ? 'Link copiado' : 'Compartilhar convite'}</button>
          <p className="hint">Quem abrir o link vê as regras antes de entrar.</p>
        </section>
      )}

      {panel === 'rules' && (
        <section className="card">
          <RulesSummary rules={pool.scoring_rules} questions={questions} />
          <button type="button" className="secondary" onClick={() => setPanel(null)}>Fechar regras</button>
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

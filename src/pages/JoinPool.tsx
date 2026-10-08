import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router'
import RulesSummary, { type QuestionSummary } from '../components/RulesSummary'
import { seasonLabel } from '../lib/competitions'
import type { Rule } from '../lib/rules'
import { supabase } from '../lib/supabase'

type Preview = {
  id: string
  name: string
  description: string | null
  season: number
  first_matchday: number | null
  scoring_rules: Rule[]
  owner: string | null
  competition: { name: string; type: string; current_season: number | null; season_label: string | null }
  member_count: number
  is_member: boolean
  questions: QuestionSummary[]
}

// The invite link: shows the pool and its rules, then joins on request.
export default function JoinPool() {
  const { code = '' } = useParams()
  const [preview, setPreview] = useState<Preview | null | undefined>(undefined)
  const [poolId, setPoolId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    supabase.rpc('pool_preview', { p_invite_code: code }).then(({ data, error }) => {
      if (error) setError(true)
      else setPreview((data as Preview | null) ?? null)
    })
  }, [code])

  async function join() {
    setBusy(true)
    const { data, error } = await supabase.rpc('join_pool', { p_invite_code: code })
    setBusy(false)
    if (error) setError(true)
    else setPoolId(data as string)
  }

  if (poolId) return <Navigate to={`/bolao/${poolId}`} replace />
  if (preview?.is_member) return <Navigate to={`/bolao/${preview.id}`} replace />
  if (error || preview === null) {
    return (
      <main className="page narrow">
        <p className="error">{error ? 'Não foi possível abrir o convite. Tente de novo.' : 'Convite inválido.'}</p>
        <Link to="/">Voltar</Link>
      </main>
    )
  }
  if (preview === undefined) return <main className="page narrow"><p>Abrindo o convite…</p></main>

  const people = preview.member_count === 1 ? '1 participante' : `${preview.member_count} participantes`
  return (
    <main className="page narrow">
      <p className="hint">{preview.owner ?? 'Alguém'} convidou você para o bolão</p>
      <h1>{preview.name}</h1>
      <p className="hint">
        {preview.competition.name} {seasonLabel(preview.competition, preview.season)}
        {preview.first_matchday ? ` · desde a rodada ${preview.first_matchday}` : ''} · {people}
      </p>
      {preview.description && <p className="description">{preview.description}</p>}

      <section className="card">
        <RulesSummary rules={preview.scoring_rules} questions={preview.questions} />
      </section>

      <div className="sticky-save">
        <button type="button" disabled={busy} onClick={join}>Entrar no bolão</button>
      </div>
    </main>
  )
}

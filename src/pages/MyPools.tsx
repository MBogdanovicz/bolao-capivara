import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../auth/context'
import InstallHelp from '../components/InstallHelp'
import Reminders from '../components/Reminders'
import { formatKickoff } from '../lib/matches'
import { saveNickname } from '../lib/profile'
import { supabase } from '../lib/supabase'

type PoolRow = { id: string; name: string }
type Pending = { pool_id: string; missing: number; next_kickoff: string }

export default function MyPools() {
  const [pools, setPools] = useState<PoolRow[] | null>(null)
  const [pending, setPending] = useState<Record<string, Pending>>({})

  useEffect(() => {
    // RLS only returns the pools the user is a member of.
    supabase
      .from('pools')
      .select('id, name')
      .order('created_at', { ascending: false })
      .then(({ data }) => setPools(data ?? []))
    supabase
      .rpc('my_pending_predictions')
      .then(({ data }) => setPending(Object.fromEntries(((data ?? []) as Pending[]).map((p) => [p.pool_id, p]))))
  }, [])

  return (
    <main className="page">
      <header className="bar">
        <h1>Meus bolões</h1>
        <button type="button" className="link" onClick={() => supabase.auth.signOut()}>Sair</button>
      </header>
      <NameLine />

      <InstallHelp />
      <Reminders />

      {pools === null && <p>Carregando…</p>}
      {pools?.length === 0 && <p>Você ainda não está em nenhum bolão. Crie um ou peça o link de convite a um amigo.</p>}
      <ul className="list">
        {pools?.map((pool) => {
          const p = pending[pool.id]
          return (
            <li key={pool.id}>
              <Link to={`/bolao/${pool.id}`}>
                {pool.name}
                {p && (
                  <small className="pending">
                    {p.missing === 1 ? 'Falta 1 palpite' : `Faltam ${p.missing} palpites`} · próximo jogo {formatKickoff(p.next_kickoff)}
                  </small>
                )}
              </Link>
            </li>
          )
        })}
      </ul>

      <Link className="button" to="/bolao/novo">Criar bolão</Link>
    </main>
  )
}

// "Você é X · Alterar": the user's name, editable in place.
function NameLine() {
  const { session, nickname, setNickname } = useAuth()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const result = await saveNickname(session!.user.id, name)
    setBusy(false)
    if ('error' in result) return setError(result.error)
    setNickname(result.name)
    setEditing(false)
  }

  if (!editing) {
    return (
      <p className="hint">
        Você aparece como <strong>{nickname}</strong> ·{' '}
        <button type="button" className="link" onClick={() => { setName(nickname ?? ''); setEditing(true) }}>Alterar nome</button>
      </p>
    )
  }
  return (
    <form className="card" onSubmit={submit}>
      <label>
        Seu nome
        <input required autoFocus maxLength={40} autoComplete="nickname" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <div className="grid">
        <button type="button" className="secondary" onClick={() => setEditing(false)}>Cancelar</button>
        <button type="submit" disabled={busy}>Salvar</button>
      </div>
      {error && <p className="error">{error}</p>}
    </form>
  )
}

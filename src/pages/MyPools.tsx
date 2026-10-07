import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { supabase } from '../lib/supabase'

type PoolRow = { id: string; name: string }

export default function MyPools() {
  const [pools, setPools] = useState<PoolRow[] | null>(null)

  useEffect(() => {
    // RLS only returns the pools the user is a member of.
    supabase
      .from('pools')
      .select('id, name')
      .order('created_at', { ascending: false })
      .then(({ data }) => setPools(data ?? []))
  }, [])

  return (
    <main className="page">
      <header className="bar">
        <h1>Meus bolões</h1>
        <button type="button" className="link" onClick={() => supabase.auth.signOut()}>Sair</button>
      </header>

      {pools === null && <p>Carregando…</p>}
      {pools?.length === 0 && <p>Você ainda não está em nenhum bolão. Crie um ou peça o link de convite a um amigo.</p>}
      <ul className="list">
        {pools?.map((pool) => (
          <li key={pool.id}>
            <Link to={`/bolao/${pool.id}`}>{pool.name}</Link>
          </li>
        ))}
      </ul>

      <Link className="button" to="/bolao/novo">Criar bolão</Link>
    </main>
  )
}

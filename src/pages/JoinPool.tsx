import { useEffect, useState } from 'react'
import { Navigate, useParams } from 'react-router'
import { supabase } from '../lib/supabase'

export default function JoinPool() {
  const { code = '' } = useParams()
  const [poolId, setPoolId] = useState<string | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    supabase.rpc('join_pool', { p_invite_code: code }).then(({ data, error }) => {
      if (error) setError(true)
      else setPoolId(data as string)
    })
  }, [code])

  if (poolId) return <Navigate to={`/bolao/${poolId}`} replace />
  return <main className="page narrow">{error ? <p className="error">Convite inválido.</p> : <p>Entrando no bolão…</p>}</main>
}

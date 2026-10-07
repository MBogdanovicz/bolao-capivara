import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { useAuth } from './context'

export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()
  const location = useLocation()

  if (loading) return <p className="center">Carregando…</p>
  if (!session) return <Navigate to="/entrar" replace state={{ from: location.pathname }} />
  return children
}

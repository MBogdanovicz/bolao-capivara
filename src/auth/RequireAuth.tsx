import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import ChooseName from '../pages/ChooseName'
import { useAuth } from './context'

// Logged-in screens. Someone without a name yet (first login by email, or a
// Google name already taken) picks one before anything else.
export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading, nickname } = useAuth()
  const location = useLocation()

  if (loading) return <p className="center">Carregando…</p>
  if (!session) return <Navigate to="/entrar" replace state={{ from: location.pathname }} />
  if (nickname === undefined) return <p className="center">Carregando…</p>
  if (nickname === null) return <ChooseName />
  return children
}

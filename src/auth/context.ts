import type { Session } from '@supabase/supabase-js'
import { createContext, useContext } from 'react'

export type AuthState = {
  session: Session | null
  loading: boolean
  // The user's name in the app: undefined while loading, null until chosen.
  nickname: string | null | undefined
  setNickname: (name: string) => void
}

export const AuthContext = createContext<AuthState>({ session: null, loading: true, nickname: undefined, setNickname: () => {} })

export function useAuth() {
  return useContext(AuthContext)
}

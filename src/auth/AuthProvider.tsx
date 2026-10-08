import type { Session } from '@supabase/supabase-js'
import { useEffect, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { AuthContext } from './context'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<{ session: Session | null; loading: boolean }>({ session: null, loading: true })
  // Name loaded for a given user id, so switching accounts never shows the old one.
  const [profile, setProfile] = useState<{ userId: string; nickname: string | null } | null>(null)
  const userId = auth.session?.user.id

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setAuth({ session: data.session, loading: false }))
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setAuth({ session, loading: false }))
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!userId) return
    supabase
      .from('profiles')
      .select('nickname')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data }) => setProfile({ userId, nickname: data?.nickname ?? null }))
  }, [userId])

  const nickname = userId && profile?.userId === userId ? profile.nickname : undefined
  const setNickname = (name: string) => userId && setProfile({ userId, nickname: name })

  return (
    <AuthContext.Provider value={{ ...auth, nickname, setNickname }}>
      {children}
    </AuthContext.Provider>
  )
}

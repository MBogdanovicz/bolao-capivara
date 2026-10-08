import { useState } from 'react'
import { useNavigate } from 'react-router'
import { supabase } from '../../lib/supabase'
import type { Member } from './context'

type Props = {
  poolId: string
  members: Member[]
  userId: string
  isOwner: boolean
  onRemoved: (userId: string) => void
}

// Who is in the pool. The owner removes members; members leave. Predictions
// and bonus answers of whoever leaves are deleted with the membership.
export default function MembersCard({ poolId, members, userId, isOwner, onRemoved }: Props) {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function remove(member: Member) {
    const self = member.user_id === userId
    const question = self
      ? 'Sair do bolão? Seus palpites e pontos neste bolão serão apagados.'
      : `Remover ${member.nickname} do bolão? Os palpites e pontos de ${member.nickname} neste bolão serão apagados.`
    if (!window.confirm(question)) return
    setBusy(true)
    setError(null)
    const { data, error } = await supabase.from('pool_members').delete().eq('pool_id', poolId).eq('user_id', member.user_id).select('user_id')
    setBusy(false)
    if (error || !data?.length) return setError('Não foi possível. Tente de novo.')
    if (self) navigate('/', { replace: true })
    else onRemoved(member.user_id)
  }

  const sorted = [...members].sort((a, b) => (a.role === 'owner' ? -1 : b.role === 'owner' ? 1 : a.nickname.localeCompare(b.nickname, 'pt-BR')))
  const me = members.find((m) => m.user_id === userId)

  return (
    <section className="card">
      <ul className="members">
        {sorted.map((m) => (
          <li key={m.user_id}>
            <span className="member-name">
              {m.avatar_url && <img className="avatar" src={m.avatar_url} alt="" referrerPolicy="no-referrer" />}
              {m.nickname}
              {m.user_id === userId && <small>você</small>}
              {m.role === 'owner' && <small>dono</small>}
            </span>
            {isOwner && m.role === 'member' && (
              <button type="button" className="link danger" disabled={busy} onClick={() => remove(m)}>Remover</button>
            )}
          </li>
        ))}
      </ul>
      {!isOwner && me && (
        <button type="button" className="secondary danger" disabled={busy} onClick={() => remove(me)}>Sair do bolão</button>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  )
}

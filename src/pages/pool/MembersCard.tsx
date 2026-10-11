import { useState } from 'react'
import { useNavigate } from 'react-router'
import { CAPIVARA_ID } from '../../lib/capivara'
import { supabase } from '../../lib/supabase'
import type { Member } from './context'

type Props = {
  poolId: string
  poolName: string
  members: Member[]
  userId: string
  isOwner: boolean
  hasFee: boolean
  onRemoved: (userId: string) => void
  onPaymentChanged: (userId: string, paidAt: string | null) => void
}

// Who is in the pool. The owner removes members or deletes the whole pool;
// members leave. Predictions and bonus answers of whoever leaves are deleted
// with the membership. With an entry fee, the owner confirms who paid.
export default function MembersCard({ poolId, poolName, members, userId, isOwner, hasFee, onRemoved, onPaymentChanged }: Props) {
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

  async function setPaid(member: Member, paid: boolean) {
    if (!paid && !window.confirm(`Desfazer a confirmação do pagamento de ${member.nickname}?`)) return
    setBusy(true)
    setError(null)
    const { error } = await supabase.rpc('confirm_payment', { p_pool_id: poolId, p_user_id: member.user_id, p_paid: paid })
    setBusy(false)
    if (error) return setError('Não foi possível. Tente de novo.')
    onPaymentChanged(member.user_id, paid ? new Date().toISOString() : null)
  }

  async function deletePool() {
    if (!window.confirm(`Excluir o bolão "${poolName}"? Todos os palpites, bônus e o ranking serão apagados para todos. Não dá para desfazer.`)) return
    setBusy(true)
    setError(null)
    const { data, error } = await supabase.from('pools').delete().eq('id', poolId).select('id')
    setBusy(false)
    if (error || !data?.length) return setError('Não foi possível excluir. Tente de novo.')
    navigate('/', { replace: true })
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
              {m.user_id === CAPIVARA_ID && <small>automática</small>}
              {hasFee && m.role === 'member' && m.user_id !== CAPIVARA_ID && <PaymentTag member={m} />}
            </span>
            {isOwner && m.role === 'member' && (
              <span className="member-actions">
                {hasFee && m.user_id !== CAPIVARA_ID && (
                  m.paid_at === null
                    ? <button type="button" className="link" disabled={busy} onClick={() => setPaid(m, true)}>Confirmar</button>
                    : <button type="button" className="link" disabled={busy} onClick={() => setPaid(m, false)}>Desfazer</button>
                )}
                <button type="button" className="link danger" disabled={busy} onClick={() => remove(m)}>Remover</button>
              </span>
            )}
          </li>
        ))}
      </ul>
      {!isOwner && me && (
        <button type="button" className="secondary danger" disabled={busy} onClick={() => remove(me)}>Sair do bolão</button>
      )}
      {isOwner && (
        <button type="button" className="secondary danger" disabled={busy} onClick={deletePool}>Excluir bolão</button>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  )
}

function PaymentTag({ member }: { member: Member }) {
  if (member.paid_at !== null) return <small className="paid-tag">pagou</small>
  return <small className="unpaid-tag">{member.payment_reported_at !== null ? 'diz que pagou' : 'não pagou'}</small>
}

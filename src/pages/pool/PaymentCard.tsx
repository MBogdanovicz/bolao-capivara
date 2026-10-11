import { useState } from 'react'
import PixQr from '../../components/PixQr'
import { formatMoney, pixCode } from '../../lib/pix'
import { supabase } from '../../lib/supabase'

type Props = {
  poolId: string
  poolName: string
  fee: number
  pixKey: string
  ownerName: string
  reported: boolean
  onReported: () => void
}

// What a member who still owes the entry fee sees: the Pix to pay and a
// button to tell the owner they paid. They already predict meanwhile.
export default function PaymentCard({ poolId, poolName, fee, pixKey, ownerName, reported, onReported }: Props) {
  const [open, setOpen] = useState(!reported)
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const code = pixCode({ key: pixKey, name: ownerName, amount: fee, message: `Bolao ${poolName}` })

  async function copy() {
    await navigator.clipboard.writeText(code)
    setCopied(true)
  }

  async function report() {
    setBusy(true)
    setError(false)
    const { error } = await supabase.rpc('report_payment', { p_pool_id: poolId })
    setBusy(false)
    if (error) return setError(true)
    setOpen(false)
    onReported()
  }

  if (!open) {
    return (
      <section className="card payment">
        <p>
          <strong>Pagamento aguardando confirmação.</strong> {ownerName} confirma quando vir o Pix de {formatMoney(fee)}.{' '}
          <button type="button" className="link" onClick={() => setOpen(true)}>Ver Pix</button>
        </p>
      </section>
    )
  }

  return (
    <section className="card payment">
      <h3>Entrada: {formatMoney(fee)} por Pix</h3>
      <p className="hint">
        Você já pode palpitar. Pague para {ownerName} e avise aqui; se o pagamento não for confirmado, {ownerName} pode remover você do bolão.
      </p>
      <PixQr code={code} />
      <button type="button" onClick={copy}>{copied ? 'Código copiado' : 'Copiar Pix copia e cola'}</button>
      <p className="hint">Chave Pix de {ownerName}: <span className="invite">{pixKey}</span></p>
      {reported ? (
        <button type="button" className="secondary" onClick={() => setOpen(false)}>Fechar</button>
      ) : (
        <button type="button" className="secondary" disabled={busy} onClick={report}>Já paguei</button>
      )}
      {error && <p className="error">Não foi possível avisar. Tente de novo.</p>}
    </section>
  )
}

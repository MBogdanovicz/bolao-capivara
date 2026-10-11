import { useState, type FormEvent } from 'react'
import PixFields from '../../components/PixFields'
import { pixColumns, pixForm } from '../../lib/pix'
import { supabase } from '../../lib/supabase'

// The owner turns the entry fee on or off, or changes the amount or the key.
export default function PaymentEditor({ poolId, fee, pixKey, onSaved, onCancel }: {
  poolId: string
  fee: number | null
  pixKey: string | null
  onSaved: (columns: { entry_fee: number | null; pix_key: string | null }) => void
  onCancel: () => void
}) {
  const [form, setForm] = useState(() => pixForm(fee, pixKey))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const columns = pixColumns(form)
    if ('error' in columns) return setError(columns.error)
    setBusy(true)
    setError(null)
    const { error } = await supabase.from('pools').update(columns).eq('id', poolId)
    setBusy(false)
    if (error) return setError('Não foi possível salvar. Tente de novo.')
    onSaved(columns)
  }

  return (
    <form className="card" onSubmit={submit}>
      <PixFields value={form} onChange={(patch) => setForm({ ...form, ...patch })} />
      <div className="grid">
        <button type="button" className="secondary" onClick={onCancel}>Cancelar</button>
        <button type="submit" disabled={busy}>Salvar</button>
      </div>
      {error && <p className="error">{error}</p>}
    </form>
  )
}

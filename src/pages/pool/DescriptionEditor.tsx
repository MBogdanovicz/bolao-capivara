import { useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'

// The owner writes or changes the pool description (entry fee, prizes...).
export default function DescriptionEditor({ poolId, value, onSaved, onCancel }: {
  poolId: string
  value: string | null
  onSaved: (description: string | null) => void
  onCancel: () => void
}) {
  const [text, setText] = useState(value ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const description = text.trim() || null
    setBusy(true)
    setError(false)
    const { error } = await supabase.from('pools').update({ description }).eq('id', poolId)
    setBusy(false)
    if (error) return setError(true)
    onSaved(description)
  }

  return (
    <form className="card" onSubmit={submit}>
      <label>
        Descrição
        <textarea rows={4} maxLength={1000} autoFocus value={text} onChange={(e) => setText(e.target.value)}
          placeholder="Ex.: R$ 20 por pessoa. 1º leva 70%, 2º leva 30%." />
      </label>
      <div className="grid">
        <button type="button" className="secondary" onClick={onCancel}>Cancelar</button>
        <button type="submit" disabled={busy}>Salvar</button>
      </div>
      {error && <p className="error">Não foi possível salvar. Tente de novo.</p>}
    </form>
  )
}

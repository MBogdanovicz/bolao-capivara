import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth/context'
import { saveNickname } from '../lib/profile'
import { supabase } from '../lib/supabase'

// Asked once, before using the app. Names are unique (ignoring case), so the
// ranking never shows two people with the same name.
export default function ChooseName() {
  const { session, setNickname } = useAuth()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const result = await saveNickname(session!.user.id, name)
    setBusy(false)
    if ('error' in result) return setError(result.error)
    setNickname(result.name)
  }

  return (
    <main className="page narrow">
      <h1>Como você quer ser chamado?</h1>
      <p className="hint">É o nome que aparece no ranking e nos palpites dos bolões. Cada pessoa tem um nome diferente.</p>
      <form onSubmit={submit}>
        <label>
          Seu nome
          <input required autoFocus maxLength={40} autoComplete="nickname" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <button type="submit" disabled={busy}>Continuar</button>
        {error && <p className="error">{error}</p>}
      </form>
      <button type="button" className="link" onClick={() => supabase.auth.signOut()}>Sair</button>
    </main>
  )
}

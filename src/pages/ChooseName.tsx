import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth/context'
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
    const nickname = name.trim().replace(/\s+/g, ' ')
    if (nickname.length < 2) return setError('Use pelo menos 2 letras.')
    setBusy(true)
    setError(null)
    const { error } = await supabase.from('profiles').update({ nickname }).eq('id', session!.user.id)
    setBusy(false)
    if (error?.code === '23505') return setError('Esse nome já está em uso. Escolha outro.')
    if (error) return setError('Não foi possível salvar. Tente de novo.')
    setNickname(nickname)
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

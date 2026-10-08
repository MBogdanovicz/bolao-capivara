import { useState, type FormEvent } from 'react'
import { Navigate, useLocation } from 'react-router'
import { useAuth } from '../auth/context'
import { supabase } from '../lib/supabase'

// Passwordless login: Google or a 6-digit code sent by email. The code is
// typed inside the app because on iPhone an email link would open in Safari,
// not in the installed PWA.
export default function Login() {
  const { session } = useAuth()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/'

  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (session) return <Navigate to={from} replace />

  async function sendCode(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })
    setBusy(false)
    if (error) setError('Não foi possível enviar o código. Tente de novo em instantes.')
    else setCodeSent(true)
  }

  async function verifyCode(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' })
    setBusy(false)
    if (error) setError('Código inválido ou expirado.')
  }

  async function signInWithGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + from },
    })
  }

  return (
    <>
      <header className="hero">
        <img src="/crest.png" alt="Brasão do Capivara Esporte Clube" />
        <span className="wordmark">Bolão <span>Capivara</span></span>
        <p>Palpites, ranking e resenha com os amigos.</p>
      </header>
      <main className="page narrow">
        <button type="button" className="secondary" onClick={signInWithGoogle}>
          Entrar com Google
        </button>

        <p className="divider">ou</p>

        {!codeSent ? (
          <form onSubmit={sendCode}>
            <label>
              E-mail
              <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <button type="submit" disabled={busy}>Receber código</button>
          </form>
        ) : (
          <form onSubmit={verifyCode}>
            <p>Enviamos um código de 6 dígitos para {email}.</p>
            <label>
              Código
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </label>
            <button type="submit" disabled={busy}>Entrar</button>
            <button type="button" className="link" onClick={() => setCodeSent(false)}>Usar outro e-mail</button>
          </form>
        )}

        {error && <p className="error">{error}</p>}
      </main>
    </>
  )
}

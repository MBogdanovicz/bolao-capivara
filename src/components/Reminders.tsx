import { useEffect, useState } from 'react'
import { disableReminders, enableReminders, pushSupport, remindersOn } from '../lib/push'

type State = 'loading' | 'off' | 'on' | 'dismissed' | 'denied' | 'error'

// Home screen switch for push notifications on this device: prediction
// reminders and the end-of-round summary.
export default function Reminders() {
  const support = pushSupport()
  const [state, setState] = useState<State>('loading')
  const [busy, setBusy] = useState(false)

  // Read the permission when the screen opens and again whenever the user
  // comes back to the app (e.g. after allowing notifications in settings).
  useEffect(() => {
    if (support !== 'ok') return
    let active = true
    const check = () => {
      if (Notification.permission === 'denied') return setState('denied')
      remindersOn().then((on) => active && setState(on ? 'on' : 'off'), () => active && setState('off'))
    }
    check()
    const onVisible = () => document.visibilityState === 'visible' && check()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      active = false
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [support])

  async function enable() {
    setBusy(true)
    setState(await enableReminders())
    setBusy(false)
  }

  async function disable() {
    setBusy(true)
    await disableReminders().catch(() => {})
    setState('off')
    setBusy(false)
  }

  if (support === 'unsupported') return null
  if (support === 'install-first') {
    return <p className="hint">Para receber lembretes de palpite e o resumo das rodadas no iPhone, instale o Bolão na Tela de Início.</p>
  }
  if (state === 'loading') return null
  if (state === 'on') {
    return (
      <p className="hint">
        Notificações ativadas ·{' '}
        <button type="button" className="link" disabled={busy} onClick={disable}>Desativar</button>
      </p>
    )
  }
  if (state === 'denied') {
    return (
      <section className="card">
        <h3>Notificações</h3>
        <p>As notificações do Bolão estão bloqueadas neste aparelho. Para liberar:</p>
        <ul className="steps">
          <li>App instalado: Configurações do Android &gt; Apps &gt; Bolão &gt; Notificações.</li>
          <li>No Chrome: toque no ícone à esquerda do endereço &gt; Permissões &gt; Notificações.</li>
        </ul>
        <p className="hint">Depois, volte aqui e toque em Ativar notificações.</p>
      </section>
    )
  }
  return (
    <section className="card">
      <h3>Notificações</h3>
      <p>Receba um aviso quando faltar palpite para um jogo que começa em até 3 horas, e o resumo de cada rodada com seus pontos e sua posição.</p>
      <button type="button" disabled={busy} onClick={enable}>Ativar notificações</button>
      {state === 'dismissed' && <p className="hint">O pedido de permissão foi fechado. Toque de novo e escolha Permitir.</p>}
      {state === 'error' && <p className="error">Não foi possível ativar agora. Tente de novo mais tarde.</p>}
    </section>
  )
}

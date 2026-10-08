import { useEffect, useState } from 'react'
import { disableReminders, enableReminders, pushSupport, remindersOn } from '../lib/push'

type State = 'loading' | 'off' | 'on' | 'denied' | 'error'

// Home screen switch for prediction reminders on this device.
export default function Reminders() {
  const support = pushSupport()
  const [state, setState] = useState<State>(() => (support === 'ok' && Notification.permission === 'denied' ? 'denied' : 'loading'))
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (support !== 'ok' || Notification.permission === 'denied') return
    remindersOn().then((on) => setState(on ? 'on' : 'off'), () => setState('off'))
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
    return <p className="hint">Para receber lembretes de palpite no iPhone, instale o Bolão na Tela de Início.</p>
  }
  if (state === 'loading') return null
  if (state === 'on') {
    return (
      <p className="hint">
        Lembretes de palpite ativados ·{' '}
        <button type="button" className="link" disabled={busy} onClick={disable}>Desativar</button>
      </p>
    )
  }
  if (state === 'denied') {
    return <p className="hint">As notificações do Bolão estão bloqueadas. Libere nas configurações do navegador para receber lembretes.</p>
  }
  return (
    <section className="card">
      <h3>Lembretes de palpite</h3>
      <p>Receba um aviso quando faltar palpite para um jogo que começa em até 3 horas.</p>
      <button type="button" disabled={busy} onClick={enable}>Ativar lembretes</button>
      {state === 'error' && <p className="error">Não foi possível ativar agora. Tente de novo mais tarde.</p>}
    </section>
  )
}

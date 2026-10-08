import { useEffect, useState } from 'react'
import { canPromptInstall, isAndroid, isInstalled, isIos, onInstallPromptChange, promptInstall } from '../lib/install'

const DISMISSED_KEY = 'install-help-dismissed'

function wasDismissed() {
  try {
    return localStorage.getItem(DISMISSED_KEY) === '1'
  } catch {
    return false
  }
}

// Card on the home screen explaining how to put the app on the phone's home
// screen. Hidden once installed or dismissed.
export default function InstallHelp() {
  const [canPrompt, setCanPrompt] = useState(canPromptInstall)
  const [hidden, setHidden] = useState(() => isInstalled() || wasDismissed())

  useEffect(() => onInstallPromptChange(() => setCanPrompt(canPromptInstall())), [])

  function dismiss() {
    try {
      localStorage.setItem(DISMISSED_KEY, '1')
    } catch {
      // Private mode: hide just for now.
    }
    setHidden(true)
  }

  async function install() {
    if (await promptInstall()) setHidden(true)
  }

  if (hidden) return null
  const ios = isIos()
  // Android browsers that never offer the install dialog (Brave, or Chrome
  // after it was dismissed) still install from their menu.
  const manual = !ios && !canPrompt && isAndroid()
  if (!ios && !canPrompt && !manual) return null // desktop

  return (
    <section className="card">
      <h3>Instale o Bolão no celular</h3>
      {ios ? (
        <ol className="steps">
          <li>No Safari, toque em <strong>Compartilhar</strong> (o quadrado com a seta para cima).</li>
          <li>Escolha <strong>Adicionar à Tela de Início</strong>.</li>
          <li>Toque em <strong>Adicionar</strong>. O Bolão vira um ícone, como um app.</li>
        </ol>
      ) : manual ? (
        <ol className="steps">
          <li>Abra o menu do navegador (⋮ no Chrome, ≡ ou ⋯ no Brave).</li>
          <li>Toque em <strong>Instalar app</strong> ou <strong>Adicionar à tela inicial</strong>.</li>
          <li>Confirme. O Bolão vira um ícone, como um app.</li>
        </ol>
      ) : (
        <>
          <p>Ele vira um ícone na tela inicial e abre como um app.</p>
          <button type="button" onClick={install}>Instalar</button>
        </>
      )}
      <button type="button" className="link" onClick={dismiss}>Agora não</button>
    </section>
  )
}

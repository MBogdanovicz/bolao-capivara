// Installing the PWA. Android Chrome fires beforeinstallprompt (often before
// any screen mounts), which lets a button open the install dialog; iPhone has
// no such event, so the app shows the Share > Add to Home Screen steps.

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

let deferred: InstallPromptEvent | null = null
const listeners = new Set<() => void>()

export function captureInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e as InstallPromptEvent
    listeners.forEach((l) => l())
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    listeners.forEach((l) => l())
  })
}

export function canPromptInstall() {
  return deferred !== null
}

export function onInstallPromptChange(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

// Opens the browser's install dialog; true if the user installed.
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false
  const event = deferred
  deferred = null
  await event.prompt()
  const { outcome } = await event.userChoice
  listeners.forEach((l) => l())
  return outcome === 'accepted'
}

export function isInstalled() {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
}

// iPadOS reports itself as a Mac, so a Mac with a touch screen is an iPad.
export function isIos() {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1)
}

export function isAndroid() {
  return /Android/i.test(navigator.userAgent)
}

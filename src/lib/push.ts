// Prediction reminders by push notification: this device subscribes with the
// app's VAPID public key and the subscription is saved for the user; the sync
// sends the reminders (supabase/functions/sync-matches/push.ts).
import { isInstalled, isIos } from './install'
import { supabase } from './supabase'

export type PushSupport = 'ok' | 'install-first' | 'unsupported'

export function pushSupport(): PushSupport {
  // iPhone only allows notifications for apps added to the Home Screen.
  if (isIos() && !isInstalled()) return 'install-first'
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported'
  return 'ok'
}

async function registration() {
  return navigator.serviceWorker.ready
}

function toBytes(b64url: string) {
  const bin = atob(b64url.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (b64url.length % 4)) % 4))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

async function save(sub: PushSubscription) {
  const { keys } = sub.toJSON() as { keys: { p256dh: string; auth: string } }
  const { error } = await supabase.rpc('save_push_subscription', { p_endpoint: sub.endpoint, p_p256dh: keys.p256dh, p_auth: keys.auth })
  if (error) throw error
}

// Whether this device has reminders on. Also re-saves the subscription, so a
// device shared by two accounts reminds whoever is logged in.
export async function remindersOn(): Promise<boolean> {
  if (Notification.permission !== 'granted') return false
  const sub = await (await registration()).pushManager.getSubscription()
  if (!sub) return false
  await save(sub).catch(() => {})
  return true
}

export type EnableResult = 'on' | 'denied' | 'error'

export async function enableReminders(): Promise<EnableResult> {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return 'denied'
  try {
    const { data: key } = await supabase.rpc('vapid_public_key')
    if (!key) return 'error'
    const reg = await registration()
    const sub = await reg.pushManager.getSubscription()
      ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toBytes(key as string) })
    await save(sub)
    return 'on'
  } catch {
    return 'error'
  }
}

export async function disableReminders() {
  const sub = await (await registration()).pushManager.getSubscription()
  if (!sub) return
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
  await sub.unsubscribe()
}

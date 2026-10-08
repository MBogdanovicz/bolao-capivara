import assert from 'node:assert/strict'
import { test } from 'node:test'
import { b64url, encrypt, fromB64url, generateKeys, vapidAuthorization } from './push.ts'

// RFC 8291, Appendix A.
const server = {
  publicKey: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  privateKey: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
}
const sub = {
  endpoint: 'https://push.example.net/push/JzLQ3raZJfFBR0aqvOMsLrt54w4rJUsV',
  p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
}

test('encrypts the RFC 8291 example byte for byte', async () => {
  const body = await encrypt(fromB64url('V2hlbiBJIGdyb3cgdXAsIEkgd2FudCB0byBiZSBhIHdhdGVybWVsb24'), sub, server, fromB64url('DGv6ra1nlYgDCS1FRnbzlw'))
  assert.equal(b64url(body.slice(0, 86)),
    'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8')
  assert.equal(b64url(body.slice(86)), '8pfeW0KbunFT06SuDKoJH9Ql87S1QUrdirN6GcG7sFz1y1sqLgVi1VhjVkHsUoEsbI_0LpXMuGvnzQ')
})

test('VAPID header carries a valid ES256 JWT for the push service origin', async () => {
  const vapid = await generateKeys()
  const header = await vapidAuthorization('https://fcm.googleapis.com/fcm/send/abc', vapid, 'https://bolao.capivaraec.com', 1_000_000_000_000)
  const [, jwt, k] = header.match(/^vapid t=([^,]+), k=(.+)$/)!
  assert.equal(k, vapid.publicKey)
  const [h, c, s] = jwt.split('.')
  assert.deepEqual(JSON.parse(new TextDecoder().decode(fromB64url(c))),
    { aud: 'https://fcm.googleapis.com', exp: 1_000_000_000 + 12 * 3600, sub: 'https://bolao.capivaraec.com' })
  const key = await crypto.subtle.importKey('raw', fromB64url(k), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
  assert.ok(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, fromB64url(s), new TextEncoder().encode(`${h}.${c}`)))
})

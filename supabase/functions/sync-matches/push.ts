// Web Push with no dependencies (WebCrypto only), so it runs the same on Deno
// (Edge Function) and Node (tests):
//   - payload encryption: RFC 8291 (aes128gcm content coding, RFC 8188);
//   - sender identification: VAPID, RFC 8292 (an ES256 JWT per push service).
// The VAPID key pair is created by the sync on its first run and kept in the
// database (push_config), so nobody has to generate or paste keys.

const subtle = globalThis.crypto.subtle

type Bytes = Uint8Array<ArrayBuffer>
const enc = new TextEncoder()

export function b64url(bytes: Bytes): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

export function fromB64url(s: string): Bytes {
  const bin = atob(s.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (s.length % 4)) % 4))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

function concat(...parts: Bytes[]): Bytes {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let i = 0
  for (const p of parts) {
    out.set(p, i)
    i += p.length
  }
  return out
}

async function hmac(key: Bytes, data: Bytes): Promise<Bytes> {
  const k = await subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await subtle.sign('HMAC', k, data))
}

// HKDF with a single output block, which is all Web Push needs (<= 32 bytes).
async function hkdf(salt: Bytes, ikm: Bytes, info: Bytes, length: number): Promise<Bytes> {
  const prk = await hmac(salt, ikm)
  return (await hmac(prk, concat(info, new Uint8Array([1])))).slice(0, length)
}

// Uncompressed P-256 point (0x04 || x || y) -> JWK coordinates.
function pointToJwk(point: Bytes) {
  return { kty: 'EC', crv: 'P-256', x: b64url(point.slice(1, 33)), y: b64url(point.slice(33, 65)) }
}

export type EcKeys = { publicKey: string; privateKey: string } // raw point and d, base64url

export async function generateKeys(): Promise<EcKeys> {
  const pair = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  const jwk = await subtle.exportKey('jwk', pair.privateKey)
  const raw = new Uint8Array(await subtle.exportKey('raw', pair.publicKey))
  return { publicKey: b64url(raw), privateKey: jwk.d! }
}

function privateJwk(keys: EcKeys) {
  return { ...pointToJwk(fromB64url(keys.publicKey)), d: keys.privateKey }
}

export type Subscription = { endpoint: string; p256dh: string; auth: string }

// Encrypts a push message for one subscription (RFC 8291). `server` and
// `salt` are random unless given (the tests use the RFC's example values).
export async function encrypt(payload: Bytes, sub: Subscription, server?: EcKeys, salt?: Bytes): Promise<Bytes> {
  const keys = server ?? (await generateKeys())
  salt ??= globalThis.crypto.getRandomValues(new Uint8Array(16))
  const uaPublic = fromB64url(sub.p256dh)
  const asPublic = fromB64url(keys.publicKey)

  const priv = await subtle.importKey('jwk', privateJwk(keys), { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits'])
  const pub = await subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const ecdh = new Uint8Array(await subtle.deriveBits({ name: 'ECDH', public: pub }, priv, 256))

  const ikm = await hkdf(fromB64url(sub.auth), ecdh, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32)
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12)

  const key = await subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  // A single record: the payload, then the last-record delimiter (0x02).
  const ciphertext = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(payload, new Uint8Array([2]))))

  const header = new Uint8Array(21)
  header.set(salt)
  new DataView(header.buffer).setUint32(16, 4096) // record size
  header[20] = asPublic.length
  return concat(header, asPublic, ciphertext)
}

// "vapid t=<JWT>, k=<public key>" for the push service that owns `endpoint`.
export async function vapidAuthorization(endpoint: string, vapid: EcKeys, subject: string, now = Date.now()): Promise<string> {
  const header = b64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const claims = b64url(enc.encode(JSON.stringify({
    aud: new URL(endpoint).origin,
    exp: Math.floor(now / 1000) + 12 * 3600,
    sub: subject,
  })))
  const key = await subtle.importKey('jwk', privateJwk(vapid), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  // WebCrypto signs in the r || s form that JWS expects.
  const signature = new Uint8Array(await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${header}.${claims}`)))
  return `vapid t=${header}.${claims}.${b64url(signature)}, k=${vapid.publicKey}`
}

export type Notice = { title: string; body: string; url: string; tag?: string }

// Sends one notification. Returns the push service's status: 201 when
// accepted; 404 and 410 mean the subscription is gone and should be deleted.
export async function sendPush(sub: Subscription, notice: Notice, vapid: EcKeys, subject: string): Promise<number> {
  const body = await encrypt(enc.encode(JSON.stringify(notice)), sub)
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      'Authorization': await vapidAuthorization(sub.endpoint, vapid, subject),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      'TTL': String(3 * 3600), // pointless after the match starts
      'Urgency': 'high',
    },
    body,
  })
  await res.body?.cancel()
  return res.status
}

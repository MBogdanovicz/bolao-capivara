// Pix "copia e cola" (BR Code) for a static charge to the pool owner's key,
// following the Banco Central BR Code manual (EMV merchant-presented QR).
// No bank API is involved: whoever pays scans the code in their bank app.

export type PixKeyType = 'cpf' | 'phone' | 'email' | 'random'

export const PIX_KEY_TYPES: { type: PixKeyType; label: string; placeholder: string }[] = [
  { type: 'cpf', label: 'CPF ou CNPJ', placeholder: '000.000.000-00' },
  { type: 'phone', label: 'Celular', placeholder: '(11) 91234-5678' },
  { type: 'email', label: 'E-mail', placeholder: 'voce@email.com' },
  { type: 'random', label: 'Chave aleatória', placeholder: '123e4567-e89b-12d3-a456-426614174000' },
]

// The key in the format Pix expects, or null when it is not valid for its type.
export function normalizePixKey(type: PixKeyType, input: string): string | null {
  const value = input.trim()
  const digits = value.replace(/\D/g, '')
  switch (type) {
    case 'cpf':
      return digits.length === 11 || digits.length === 14 ? digits : null
    case 'phone': {
      // Brazilian numbers: area code + 8 or 9 digits, with or without +55.
      const national = digits.length >= 12 && digits.startsWith('55') ? digits.slice(2) : digits
      return national.length === 10 || national.length === 11 ? `+55${national}` : null
    }
    case 'email':
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 77 ? value.toLowerCase() : null
    case 'random':
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ? value.toLowerCase() : null
  }
}

// Which kind of key a stored (normalized) key is, to edit it again.
export function pixKeyType(key: string): PixKeyType {
  if (key.includes('@')) return 'email'
  if (key.startsWith('+')) return 'phone'
  if (key.includes('-')) return 'random'
  return 'cpf'
}

export function formatMoney(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

type Charge = { key: string; name: string; amount: number; message?: string }

export function pixCode({ key, name, amount, message }: Charge): string {
  const keyField = field('00', 'br.gov.bcb.pix') + field('01', key)
  // The message (shown by some banks) has to fit in the 99-character account field.
  const room = 99 - keyField.length - 4
  const info = message ? ascii(message).slice(0, Math.min(room, 72)).trim() : ''
  const payload =
    field('00', '01') +
    field('26', keyField + (info ? field('02', info) : '')) +
    field('52', '0000') +
    field('53', '986') +
    field('54', amount.toFixed(2)) +
    field('58', 'BR') +
    field('59', ascii(name).slice(0, 25).trim() || 'BOLAO') +
    field('60', 'BRASIL') +
    field('62', field('05', '***')) +
    '6304'
  return payload + crc16(payload)
}

function field(id: string, value: string): string {
  return id + String(value.length).padStart(2, '0') + value
}

// Banks read these fields as plain ASCII: drop accents and anything else.
function ascii(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7e]/g, '')
}

// CRC-16/CCITT-FALSE, as the BR Code requires.
export function crc16(payload: string): string {
  let crc = 0xffff
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

// The entry fee settings as the owner fills them in.
export type PixForm = { enabled: boolean; fee: string; keyType: PixKeyType; key: string }

export function pixForm(fee: number | null, key: string | null): PixForm {
  return {
    enabled: fee !== null,
    fee: fee === null ? '' : String(fee).replace('.', ','),
    keyType: key ? pixKeyType(key) : 'cpf',
    key: key ?? '',
  }
}

// The pool columns for the form, or what is wrong with it.
export function pixColumns(form: PixForm): { entry_fee: number | null; pix_key: string | null } | { error: string } {
  if (!form.enabled) return { entry_fee: null, pix_key: null }
  // "1.234,50" (Brazilian) or "20.50" (keyboards that only offer a dot).
  const text = form.fee.trim()
  const fee = Number(text.includes(',') ? text.replace(/\./g, '').replace(',', '.') : text)
  if (!Number.isFinite(fee) || fee <= 0 || fee > 100000) return { error: 'Informe o valor da entrada.' }
  const key = normalizePixKey(form.keyType, form.key)
  if (!key) return { error: 'Confira a chave Pix.' }
  return { entry_fee: Math.round(fee * 100) / 100, pix_key: key }
}

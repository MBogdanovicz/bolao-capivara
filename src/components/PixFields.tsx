import { PIX_KEY_TYPES, type PixForm, type PixKeyType } from '../lib/pix'

// Entry fee settings: on or off, the amount and the owner's Pix key.
export default function PixFields({ value, onChange }: { value: PixForm; onChange: (patch: Partial<PixForm>) => void }) {
  const placeholder = PIX_KEY_TYPES.find((t) => t.type === value.keyType)?.placeholder
  return (
    <>
      <label className="check">
        <input type="checkbox" checked={value.enabled} onChange={(e) => onChange({ enabled: e.target.checked })} />
        <span>
          Cobrar entrada por Pix
          <small>Quem entrar vê um QR Code do Pix para você. Você confirma quem pagou; quem não pagar, você remove.</small>
        </span>
      </label>
      {value.enabled && (
        <>
          <label>
            Valor da entrada (R$)
            <input required inputMode="decimal" value={value.fee} onChange={(e) => onChange({ fee: e.target.value })} placeholder="20,00" />
          </label>
          <label>
            Tipo da chave Pix
            <select value={value.keyType} onChange={(e) => onChange({ keyType: e.target.value as PixKeyType, key: '' })}>
              {PIX_KEY_TYPES.map((t) => <option key={t.type} value={t.type}>{t.label}</option>)}
            </select>
          </label>
          <label>
            Sua chave Pix
            <input required value={value.key} onChange={(e) => onChange({ key: e.target.value })} placeholder={placeholder}
              inputMode={value.keyType === 'cpf' || value.keyType === 'phone' ? 'numeric' : value.keyType === 'email' ? 'email' : 'text'}
              autoCapitalize="off" autoCorrect="off" spellCheck={false} />
          </label>
        </>
      )}
    </>
  )
}

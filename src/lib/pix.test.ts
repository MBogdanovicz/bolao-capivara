import assert from 'node:assert/strict'
import test from 'node:test'
import { crc16, normalizePixKey, pixCode, pixColumns, pixForm, pixKeyType } from './pix.ts'

test('crc16 is CRC-16/CCITT-FALSE', () => {
  assert.equal(crc16('123456789'), '29B1')
})

test('crc16 matches the example in the Banco Central BR Code manual', () => {
  const code = '00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***6304'
  assert.equal(crc16(code), '1D3D')
})

test('pixCode builds a static charge with the amount', () => {
  const code = pixCode({ key: 'ana@example.com', name: 'Ána Capivara', amount: 20, message: 'Bolão da firma' })
  assert.equal(
    code.slice(0, -4),
    '000201' +
      '26550014br.gov.bcb.pix0115ana@example.com0214Bolao da firma' +
      '52040000530398654052' + '0.00' + '5802BR' + '5912Ana Capivara' + '6006BRASIL' + '62070503***' + '6304',
  )
  assert.equal(code.slice(-4), crc16(code.slice(0, -4)))
})

test('pixCode keeps the account field within 99 characters', () => {
  const code = pixCode({ key: '123e4567-e89b-12d3-a456-426614174000', name: 'Fulano', amount: 1.5, message: 'x'.repeat(200) })
  const length = Number(code.slice(code.indexOf('26') + 2, code.indexOf('26') + 4))
  assert.ok(length <= 99)
  assert.match(code, /54041\.50/)
})

test('normalizePixKey', () => {
  assert.equal(normalizePixKey('cpf', '123.456.789-09'), '12345678909')
  assert.equal(normalizePixKey('cpf', '12.345.678/0001-95'), '12345678000195')
  assert.equal(normalizePixKey('cpf', '1234'), null)
  assert.equal(normalizePixKey('phone', '(11) 91234-5678'), '+5511912345678')
  assert.equal(normalizePixKey('phone', '+55 11 91234-5678'), '+5511912345678')
  assert.equal(normalizePixKey('phone', '91234-5678'), null)
  assert.equal(normalizePixKey('email', ' Ana@Example.com '), 'ana@example.com')
  assert.equal(normalizePixKey('email', 'ana@'), null)
  assert.equal(normalizePixKey('random', '123E4567-E89B-12D3-A456-426614174000'), '123e4567-e89b-12d3-a456-426614174000')
})

test('pixKeyType reads a stored key back', () => {
  assert.equal(pixKeyType('ana@example.com'), 'email')
  assert.equal(pixKeyType('+5511912345678'), 'phone')
  assert.equal(pixKeyType('123e4567-e89b-12d3-a456-426614174000'), 'random')
  assert.equal(pixKeyType('12345678909'), 'cpf')
})

test('pixColumns reads the owner form', () => {
  assert.deepEqual(pixColumns({ enabled: false, fee: '', keyType: 'cpf', key: '' }), { entry_fee: null, pix_key: null })
  assert.deepEqual(pixColumns({ enabled: true, fee: '1.234,50', keyType: 'email', key: 'Ana@x.com' }), { entry_fee: 1234.5, pix_key: 'ana@x.com' })
  assert.deepEqual(pixColumns({ enabled: true, fee: '20.50', keyType: 'cpf', key: '12345678909' }), { entry_fee: 20.5, pix_key: '12345678909' })
  assert.deepEqual(pixColumns({ enabled: true, fee: '20', keyType: 'cpf', key: '123' }), { error: 'Confira a chave Pix.' })
  assert.deepEqual(pixColumns({ enabled: true, fee: '0', keyType: 'cpf', key: '12345678909' }), { error: 'Informe o valor da entrada.' })
})

test('pixForm round-trips stored values', () => {
  assert.deepEqual(pixForm(20.5, '+5511912345678'), { enabled: true, fee: '20,5', keyType: 'phone', key: '+5511912345678' })
  assert.deepEqual(pixColumns(pixForm(20.5, '+5511912345678')), { entry_fee: 20.5, pix_key: '+5511912345678' })
})

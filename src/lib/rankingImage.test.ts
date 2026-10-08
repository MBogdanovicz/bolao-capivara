import assert from 'node:assert/strict'
import test from 'node:test'
import { imageEntries, type ImageRow } from './rankingImage.ts'

const rows: ImageRow[] = Array.from({ length: 9 }, (_, i) => ({ user_id: `u${i + 1}`, nickname: `P${i + 1}`, points: 50 - i, position: i + 1 }))
const ids = (entries: ReturnType<typeof imageEntries>) => entries.map((e) => (e === 'gap' ? '…' : e.user_id))

test('the top 5, plus the user after a gap when they are further down', () => {
  assert.deepEqual(ids(imageEntries(rows, 'u2')), ['u1', 'u2', 'u3', 'u4', 'u5'])
  assert.deepEqual(ids(imageEntries(rows, 'u6')), ['u1', 'u2', 'u3', 'u4', 'u5', 'u6'])
  assert.deepEqual(ids(imageEntries(rows, 'u9')), ['u1', 'u2', 'u3', 'u4', 'u5', '…', 'u9'])
  assert.equal(imageEntries(rows, 'u9').filter((e) => e !== 'gap' && e.me).length, 1)
  assert.deepEqual(ids(imageEntries(rows.slice(0, 3), 'nobody')), ['u1', 'u2', 'u3'])
})

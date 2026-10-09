import assert from 'node:assert/strict'
import test from 'node:test'
import { imageEntries, type ImageRow } from './rankingImage.ts'

const rows: ImageRow[] = Array.from({ length: 14 }, (_, i) => ({ user_id: `u${i + 1}`, nickname: `P${i + 1}`, points: 50 - i, position: i + 1 }))
const ids = (entries: ReturnType<typeof imageEntries>) => entries.map((e) => (e === 'gap' ? '…' : e.user_id))

test('the top 10, plus the user after a gap when they are further down', () => {
  const top10 = ['u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7', 'u8', 'u9', 'u10']
  assert.deepEqual(ids(imageEntries(rows, 'u2')), top10)
  assert.deepEqual(ids(imageEntries(rows, 'u11')), [...top10, 'u11'])
  assert.deepEqual(ids(imageEntries(rows, 'u14')), [...top10, '…', 'u14'])
  assert.equal(imageEntries(rows, 'u14').filter((e) => e !== 'gap' && e.me).length, 1)
  assert.deepEqual(ids(imageEntries(rows.slice(0, 8), 'nobody')), ['u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7', 'u8'])
})

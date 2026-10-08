import assert from 'node:assert/strict'
import { test } from 'node:test'
import { reminderNotices } from './reminders.ts'

test('one notice per person, pointing at the pool or the pool list', () => {
  const notices = reminderNotices([
    { user_id: 'ana', pool_id: 'p1', pool_name: 'Capivaras', missing: 1 },
    { user_id: 'bia', pool_id: 'p1', pool_name: 'Capivaras', missing: 2 },
    { user_id: 'bia', pool_id: 'p2', pool_name: 'Família', missing: 3 },
  ])
  assert.deepEqual(notices.get('ana'), { title: 'Faltam palpites', body: '1 jogo hoje sem palpite no Capivaras.', url: '/bolao/p1' })
  assert.deepEqual(notices.get('bia'), { title: 'Faltam palpites', body: '5 jogos hoje sem palpite em 2 bolões.', url: '/' })
})

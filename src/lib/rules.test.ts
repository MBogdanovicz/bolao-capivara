import assert from 'node:assert/strict'
import test from 'node:test'
import { buildRules, describeRules, isKnockoutStage, livePoints, pointsOf, ruleOptionsFor, type Rule } from './rules.ts'

test('leagues only offer the per-match score rules', () => {
  assert.deepEqual(ruleOptionsFor('LEAGUE').map((o) => o.type), ['exact_score', 'winner', 'goal_difference', 'one_team_goals'])
  assert.equal(ruleOptionsFor('CUP').length, 6)
})

test('buildRules drops rules at zero and truncates decimals', () => {
  const rules = buildRules({ exact_score: 10, winner: 0, one_team_goals: 2.7 }, ruleOptionsFor('LEAGUE'))
  assert.deepEqual(rules, [
    { type: 'exact_score', points: 10 },
    { type: 'one_team_goals', points: 2 },
  ])
})

test('buildRules ignores rules not offered for the competition', () => {
  const rules = buildRules({ exact_score: 10, advancing_team: 4 }, ruleOptionsFor('LEAGUE'))
  assert.equal(pointsOf(rules, 'advancing_team'), 0)
})

test('describeRules lists the rules in Portuguese', () => {
  assert.deepEqual(describeRules([{ type: 'winner', points: 1 }, { type: 'exact_score', points: 10 }]), [
    'Placar exato: 10 pontos',
    'Vencedor ou empate: 1 ponto',
  ])
})

test('knockout stages', () => {
  assert.equal(isKnockoutStage('FINAL'), true)
  assert.equal(isKnockoutStage('REGULAR_SEASON'), false)
})

test('livePoints matches the database scoring (supabase/tests section 1)', () => {
  const basic: Rule[] = [{ type: 'exact_score', points: 10 }, { type: 'winner', points: 5 }, { type: 'one_team_goals', points: 2 }]
  const gd: Rule[] = [{ type: 'exact_score', points: 10 }, { type: 'winner', points: 5 }, { type: 'goal_difference', points: 3 }]
  const pts = (rules: Rule[], ph: number, pa: number, rh: number, ra: number, stage = 'REGULAR_SEASON') =>
    livePoints(rules, stage, { home: ph, away: pa }, { home: rh, away: ra })
  assert.equal(pts(basic, 2, 1, 2, 1), 10)
  assert.equal(pts(basic, 3, 1, 2, 1), 7)
  assert.equal(pts(basic, 2, 2, 2, 1), 2)
  assert.equal(pts(basic, 1, 0, 2, 1), 5)
  assert.equal(pts(basic, 0, 3, 2, 1), 0)
  assert.equal(pts(gd, 0, 0, 1, 1), 5)
  assert.equal(pts(gd, 2, 0, 3, 1), 8)
  assert.equal(pts(gd, 1, 1, 2, 2), 5)
  assert.equal(pts([...gd, { type: 'stage_weight', stages: { FINAL: 2 } }], 1, 1, 1, 1, 'FINAL'), 20)
})

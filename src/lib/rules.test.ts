import assert from 'node:assert/strict'
import test from 'node:test'
import { buildRules, describeRules, isKnockoutStage, pointsOf, ruleOptionsFor } from './rules.ts'

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

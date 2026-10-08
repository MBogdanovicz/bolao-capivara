// Scoring rules as stored in pools.scoring_rules. The database scores them in
// score_prediction(); this module only builds and describes them.

export type PointsRuleType = 'exact_score' | 'winner' | 'goal_difference' | 'one_team_goals' | 'advancing_team' | 'penalties'

export type Rule =
  | { type: PointsRuleType; points: number }
  | { type: 'stage_weight'; stages: Record<string, number> }

export type RuleOption = {
  type: PointsRuleType
  label: string
  hint: string
  defaultPoints: number
  knockoutOnly: boolean
}

export const RULE_OPTIONS: RuleOption[] = [
  { type: 'exact_score', label: 'Placar exato', hint: 'Vale sozinho, não soma com os outros.', defaultPoints: 10, knockoutOnly: false },
  { type: 'winner', label: 'Vencedor ou empate', hint: 'Acertou quem ganhou, ou que empatou.', defaultPoints: 5, knockoutOnly: false },
  { type: 'goal_difference', label: 'Saldo de gols', hint: 'Acertou o vencedor e a diferença de gols (2×0 num 3×1). Soma com o vencedor. Não vale para empates.', defaultPoints: 3, knockoutOnly: false },
  { type: 'one_team_goals', label: 'Gols de um time', hint: 'Acertou os gols de um dos dois times.', defaultPoints: 2, knockoutOnly: false },
  { type: 'advancing_team', label: 'Quem se classifica', hint: 'Só em jogos de mata-mata.', defaultPoints: 4, knockoutOnly: true },
  { type: 'penalties', label: 'Se vai para os pênaltis', hint: 'Só em jogos de mata-mata.', defaultPoints: 3, knockoutOnly: true },
]

// Stages that have a team going through (football-data.org stage names).
const KNOCKOUT_STAGES = new Set([
  'LAST_64', 'LAST_32', 'LAST_16', 'ROUND_OF_16', 'QUARTER_FINALS', 'SEMI_FINALS', 'THIRD_PLACE', 'FINAL',
  'PLAYOFFS', 'PLAYOFF_ROUND', 'QUALIFICATION', 'PRELIMINARY_ROUND',
  '1ST_ROUND', '2ND_ROUND', '3RD_ROUND', '4TH_ROUND', '5TH_ROUND',
])

export function isKnockoutStage(stage: string): boolean {
  return KNOCKOUT_STAGES.has(stage)
}

// Leagues have no knockout rules to offer.
export function ruleOptionsFor(competitionType: string): RuleOption[] {
  return competitionType === 'LEAGUE' ? RULE_OPTIONS.filter((o) => !o.knockoutOnly) : RULE_OPTIONS
}

// Keeps rules worth at least one point; a rule left at zero is simply not used.
export function buildRules(points: Partial<Record<PointsRuleType, number>>, options: RuleOption[]): Rule[] {
  return options
    .map((o) => ({ type: o.type, points: Math.trunc(points[o.type] ?? 0) }))
    .filter((r) => r.points > 0)
}

export function pointsOf(rules: Rule[], type: PointsRuleType): number {
  const rule = rules.find((r) => r.type === type)
  return rule && 'points' in rule ? rule.points : 0
}

export function describeRules(rules: Rule[]): string[] {
  return RULE_OPTIONS.filter((o) => pointsOf(rules, o.type) > 0).map(
    (o) => `${o.label}: ${pointsOf(rules, o.type)} ${pointsOf(rules, o.type) === 1 ? 'ponto' : 'pontos'}`,
  )
}

export const RULE_LABELS: Record<PointsRuleType, string> = Object.fromEntries(
  RULE_OPTIONS.map((o) => [o.type, o.label]),
) as Record<PointsRuleType, string>

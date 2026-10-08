import { useState } from 'react'
import { formatKickoff } from '../lib/matches'
import { RULE_OPTIONS, pointsOf, type Rule } from '../lib/rules'

export type QuestionSummary = { prompt: string; points: number; answer_count: number; closes_at: string }

const pts = (n: number) => (n === 1 ? '1 ponto' : `${n} pontos`)

// "How it works": scoring, deadlines, bonus questions and tiebreak. Shown on
// the invite before joining and in the pool's Regras panel.
export default function RulesSummary({ rules, questions }: { rules: Rule[]; questions: QuestionSummary[] | null }) {
  const scored = RULE_OPTIONS.filter((o) => pointsOf(rules, o.type) > 0)
  const [now] = useState(() => Date.now())
  return (
    <div className="rules">
      <h3>Pontos por jogo</h3>
      <ul className="rule-list">
        {scored.map((o) => (
          <li key={o.type}>
            <span><strong>{o.label}</strong><small>{o.hint}</small></span>
            <span className="rule-points">{pts(pointsOf(rules, o.type))}</span>
          </li>
        ))}
      </ul>
      {pointsOf(rules, 'exact_score') > 0 && scored.length > 1 && (
        <p className="hint">Acertou o placar exato, leva só os pontos dele. Senão, soma as outras regras que acertar.</p>
      )}

      <h3>Palpites</h3>
      <p>Dá para palpitar e mudar o palpite até o início de cada jogo. Quando o jogo começa, todo mundo vê os palpites da turma.</p>

      {questions && questions.length > 0 && (
        <>
          <h3>Bônus</h3>
          <ul className="rule-list">
            {questions.map((q) => (
              <li key={q.prompt + q.closes_at}>
                <span>
                  <strong>{q.prompt}</strong>
                  <small>
                    {new Date(q.closes_at).getTime() > now ? `Responda até ${formatKickoff(q.closes_at)}` : 'Respostas encerradas'}
                  </small>
                </span>
                <span className="rule-points">{pts(q.points)}{q.answer_count > 1 ? ' cada' : ''}</span>
              </li>
            ))}
          </ul>
          <p className="hint">Os pontos de bônus contam só no ranking geral.</p>
        </>
      )}

      <h3>Desempate</h3>
      <p>Empatou em pontos, fica na frente quem acertou mais placares exatos e, depois, mais vencedores.</p>
    </div>
  )
}

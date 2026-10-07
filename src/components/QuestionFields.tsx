import { isTeamQuestion, type QuestionDraft } from '../lib/questions'

export type QuestionForm = QuestionDraft & { closesAt: string }

// Fields of one bonus question, used when creating a pool and in the Bonus tab.
export function QuestionFields({ value, onChange }: { value: QuestionForm; onChange: (patch: Partial<QuestionForm>) => void }) {
  return (
    <>
      <label>
        Pergunta
        <input required maxLength={200} value={value.prompt} onChange={(e) => onChange({ prompt: e.target.value })} />
      </label>
      <div className="grid">
        {value.kind !== 'champion' && value.kind !== 'top_scorer' && (
          <label>
            {isTeamQuestion(value.kind) ? 'Times' : 'Respostas'}
            <input type="number" inputMode="numeric" min={1} max={20} value={value.answerCount}
              onChange={(e) => onChange({ answerCount: Number(e.target.value) })} />
          </label>
        )}
        <label>
          Pontos por acerto
          <input type="number" inputMode="numeric" min={0} max={100} value={value.points}
            onChange={(e) => onChange({ points: Number(e.target.value) })} />
        </label>
      </div>
      <label>
        Prazo para responder
        <input type="datetime-local" required value={value.closesAt} onChange={(e) => onChange({ closesAt: e.target.value })} />
      </label>
    </>
  )
}

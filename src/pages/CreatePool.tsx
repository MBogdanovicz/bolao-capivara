import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { useAuth } from '../auth/context'
import { COMPETITION_SELECT, competitionLabel, sortCompetitions, type Competition } from '../lib/competitions'
import { firstOpenMatchday } from '../lib/matches'
import { QuestionFields, type QuestionForm } from '../components/QuestionFields'
import { QUESTION_TEMPLATES, toLocalInput, validateDraft } from '../lib/questions'
import { buildRules, ruleOptionsFor, type PointsRuleType } from '../lib/rules'
import { supabase } from '../lib/supabase'

type MatchSlot = { matchday: number | null; kickoff_at: string }

export default function CreatePool() {
  const { session } = useAuth()
  const navigate = useNavigate()

  const [competitions, setCompetitions] = useState<Competition[] | null>(null)
  const [competitionId, setCompetitionId] = useState<number | null>(null)
  const [slots, setSlots] = useState<MatchSlot[]>([])
  const [name, setName] = useState('')
  const [firstMatchday, setFirstMatchday] = useState<number | null>(null)
  const [points, setPoints] = useState<Partial<Record<PointsRuleType, number>>>({})
  const [questions, setQuestions] = useState<QuestionForm[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [today] = useState(() => new Date())
  const competition = competitions?.find((c) => c.id === competitionId) ?? null
  const ruleOptions = useMemo(() => ruleOptionsFor(competition?.type ?? 'LEAGUE'), [competition])

  useEffect(() => {
    supabase
      .from('competitions')
      .select(COMPETITION_SELECT)
      .not('current_season', 'is', null)
      .then(({ data }) => {
        const list = sortCompetitions((data ?? []) as Competition[], new Date())
        setCompetitions(list)
        if (list.length > 0) chooseCompetition(list[0])
      })
  }, [])

  useEffect(() => {
    if (!competition) return
    supabase
      .from('matches')
      .select('matchday, kickoff_at')
      .eq('competition_id', competition.id)
      .eq('season', competition.current_season!)
      .order('kickoff_at')
      .then(({ data }) => {
        const list = (data ?? []) as MatchSlot[]
        setSlots(list)
        setFirstMatchday(firstOpenMatchday(list, new Date()))
      })
  }, [competition])

  function chooseCompetition(c: Competition) {
    setCompetitionId(c.id)
    setPoints(Object.fromEntries(ruleOptionsFor(c.type).map((o) => [o.type, o.defaultPoints])))
  }

  const matchdays = useMemo(
    () => [...new Set(slots.map((s) => s.matchday).filter((d): d is number => d !== null))].sort((a, b) => a - b),
    [slots],
  )

  // Bonus answers close, by default, when the pool's first match kicks off.
  const firstKickoff = slots.find((s) => firstMatchday === null || (s.matchday ?? 0) >= firstMatchday)?.kickoff_at

  function addQuestion(index: number) {
    const t = QUESTION_TEMPLATES[index]
    setQuestions([
      ...questions,
      { kind: t.kind, prompt: t.prompt, answerCount: t.answerCount, points: t.points, closesAt: firstKickoff ? toLocalInput(firstKickoff) : '' },
    ])
  }

  function updateQuestion(index: number, patch: Partial<QuestionForm>) {
    setQuestions(questions.map((q, i) => (i === index ? { ...q, ...patch } : q)))
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!competition || !session) return
    const rules = buildRules(points, ruleOptions)
    if (rules.length === 0) return setError('Defina pontos para pelo menos uma regra.')
    for (const q of questions) {
      const problem = validateDraft(q) ?? (q.closesAt ? null : 'Defina o prazo de cada palpite bônus.')
      if (problem) return setError(problem)
    }

    setBusy(true)
    setError(null)
    const { data: pool, error: poolError } = await supabase
      .from('pools')
      .insert({
        name: name.trim(),
        competition_id: competition.id,
        season: competition.current_season,
        owner_id: session.user.id,
        scoring_rules: rules,
        first_matchday: firstMatchday,
      })
      .select('id')
      .single()

    if (poolError || !pool) {
      setBusy(false)
      return setError('Não foi possível criar o bolão. Tente de novo.')
    }

    if (questions.length > 0) {
      const { error: qError } = await supabase.from('pool_questions').insert(
        questions.map((q) => ({
          pool_id: pool.id,
          kind: q.kind,
          prompt: q.prompt.trim(),
          answer_count: q.answerCount,
          points: q.points,
          closes_at: new Date(q.closesAt).toISOString(),
        })),
      )
      if (qError) {
        setBusy(false)
        return setError('O bolão foi criado, mas os palpites bônus não foram salvos. Adicione-os na aba Bônus.')
      }
    }

    navigate(`/bolao/${pool.id}`, { replace: true })
  }

  if (competitions === null) return <main className="page"><p>Carregando…</p></main>

  return (
    <main className="page">
      <header className="bar">
        <h1>Criar bolão</h1>
        <Link to="/">Cancelar</Link>
      </header>

      {competitions.length === 0 ? (
        <p>Nenhum campeonato disponível ainda. Os jogos aparecem depois da primeira sincronização.</p>
      ) : (
        <form onSubmit={submit}>
          <label>
            Nome do bolão
            <input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="Bolão da firma" />
          </label>

          <label>
            Campeonato
            <select value={competitionId ?? ''} onChange={(e) => chooseCompetition(competitions.find((c) => c.id === Number(e.target.value))!)}>
              {competitions.map((c) => (
                <option key={c.id} value={c.id}>{competitionLabel(c, today)}</option>
              ))}
            </select>
          </label>

          {matchdays.length > 0 && (
            <label>
              Começa na rodada
              <select value={firstMatchday ?? ''} onChange={(e) => setFirstMatchday(e.target.value ? Number(e.target.value) : null)}>
                <option value="">Desde o início</option>
                {matchdays.map((d) => <option key={d} value={d}>Rodada {d}</option>)}
              </select>
            </label>
          )}

          <fieldset>
            <legend>Pontuação por jogo</legend>
            <p className="hint">Acertou o placar exato, ganha só esses pontos. Senão, as outras regras que acertar se somam. Regra com 0 não vale.</p>
            {ruleOptions.map((o) => (
              <label key={o.type} className="row">
                <span>
                  {o.label}
                  <small>{o.hint}</small>
                </span>
                <input
                  type="number" inputMode="numeric" min={0} max={100} className="points"
                  value={points[o.type] ?? 0}
                  onChange={(e) => setPoints({ ...points, [o.type]: Number(e.target.value) })}
                />
              </label>
            ))}
          </fieldset>

          <fieldset>
            <legend>Palpites bônus</legend>
            <p className="hint">Perguntas sobre o campeonato inteiro, respondidas até um prazo. Os pontos valem para cada item certo.</p>
            {questions.map((q, i) => (
              <div key={i} className="card">
                <QuestionFields value={q} onChange={(patch) => updateQuestion(i, patch)} />
                <button type="button" className="link danger" onClick={() => setQuestions(questions.filter((_, j) => j !== i))}>
                  Remover
                </button>
              </div>
            ))}
            <div className="chips">
              {QUESTION_TEMPLATES.map((t, i) => (
                <button key={t.kind} type="button" className="chip" onClick={() => addQuestion(i)}>+ {t.label}</button>
              ))}
            </div>
          </fieldset>

          <p className="hint">As regras ficam travadas quando o primeiro jogo do bolão começar.</p>
          <button type="submit" disabled={busy}>Criar bolão</button>
          {error && <p className="error">{error}</p>}
        </form>
      )}
    </main>
  )
}

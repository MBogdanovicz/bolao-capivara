import { useCallback, useEffect, useMemo, useState } from 'react'
import { PlayerPicker } from '../../components/PlayerPicker'
import { QuestionFields, type QuestionForm } from '../../components/QuestionFields'
import { teamName, teamsIn, type Match, type Team } from '../../lib/matches'
import {
  QUESTION_TEMPLATES, isTeamQuestion, normalizeAnswer, toLocalInput, validateDraft, type QuestionKind,
} from '../../lib/questions'
import { supabase } from '../../lib/supabase'
import { usePool } from './context'

type Question = {
  id: number
  kind: QuestionKind
  prompt: string
  answer_count: number
  points: number
  closes_at: string
  official_answer: string[] | null
}

type Answer = { question_id: number; user_id: string; answer: string[]; points: number | null }

export default function Bonus() {
  const { pool, userId, isOwner, members } = usePool()
  const [questions, setQuestions] = useState<Question[] | null>(null)
  const [mine, setMine] = useState<Record<number, Answer>>({})
  const [teams, setTeams] = useState<Team[]>([])
  const [adding, setAdding] = useState<QuestionForm | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchQuestions = useCallback(async () => {
    const { data } = await supabase
      .from('pool_questions')
      .select('id, kind, prompt, answer_count, points, closes_at, official_answer')
      .eq('pool_id', pool.id)
      .order('closes_at')
    const list = (data ?? []) as Question[]
    if (list.length === 0) return { list, answers: [] as Answer[] }
    const { data: answers } = await supabase
      .from('question_answers')
      .select('question_id, user_id, answer, points')
      .eq('user_id', userId)
      .in('question_id', list.map((q) => q.id))
    return { list, answers: (answers ?? []) as Answer[] }
  }, [pool.id, userId])

  const apply = useCallback(({ list, answers }: Awaited<ReturnType<typeof fetchQuestions>>) => {
    setQuestions(list)
    setMine(Object.fromEntries(answers.map((a) => [a.question_id, a])))
  }, [])

  const load = useCallback(() => {
    fetchQuestions().then(apply)
  }, [fetchQuestions, apply])

  useEffect(() => {
    fetchQuestions().then(apply)
    supabase
      .from('matches')
      .select('home_team:teams!matches_home_team_id_fkey(id, name, short_name, tla, crest_url), away_team:teams!matches_away_team_id_fkey(id, name, short_name, tla, crest_url)')
      .eq('competition_id', pool.competition_id)
      .eq('season', pool.season)
      .then(({ data }) => setTeams(teamsIn((data ?? []) as unknown as Pick<Match, 'home_team' | 'away_team'>[])))
  }, [fetchQuestions, apply, pool.competition_id, pool.season])

  const teamNames = useMemo(() => Object.fromEntries(teams.map((t) => [String(t.id), teamName(t)])), [teams])
  const nicknames = useMemo(() => Object.fromEntries(members.map((m) => [m.user_id, m.nickname])), [members])

  async function addQuestion() {
    if (!adding) return
    const problem = validateDraft(adding) ?? (adding.closesAt ? null : 'Defina o prazo.')
    if (problem) return setError(problem)
    const { error } = await supabase.from('pool_questions').insert({
      pool_id: pool.id,
      kind: adding.kind,
      prompt: adding.prompt.trim(),
      answer_count: adding.answerCount,
      points: adding.points,
      closes_at: new Date(adding.closesAt).toISOString(),
    })
    if (error) return setError('Não foi possível salvar a pergunta.')
    setAdding(null)
    setError(null)
    load()
  }

  if (questions === null) return <p>Carregando…</p>

  return (
    <section>
      {questions.length === 0 && <p>Este bolão não tem palpites bônus.</p>}
      {questions.map((q) => (
        <QuestionCard
          // Remount when the saved answer changes, so the form starts from it.
          key={`${q.id}:${mine[q.id]?.answer.join('|') ?? ''}`}
          question={q}
          mine={mine[q.id]}
          teams={teams}
          teamNames={teamNames}
          nicknames={nicknames}
          userId={userId}
          isOwner={isOwner}
          onChanged={load}
        />
      ))}

      {isOwner && (
        adding ? (
          <div className="card">
            <QuestionFields value={adding} onChange={(patch) => setAdding({ ...adding, ...patch })} />
            <button type="button" onClick={addQuestion}>Adicionar pergunta</button>
            <button type="button" className="link" onClick={() => setAdding(null)}>Cancelar</button>
            {error && <p className="error">{error}</p>}
          </div>
        ) : (
          <div className="chips">
            {QUESTION_TEMPLATES.map((t) => (
              <button key={t.kind} type="button" className="chip" onClick={() => setAdding({
                kind: t.kind, prompt: t.prompt, answerCount: t.answerCount, points: t.points,
                closesAt: toLocalInput(new Date(Date.now() + 7 * 86_400_000).toISOString()),
              })}>+ {t.label}</button>
            ))}
          </div>
        )
      )}
    </section>
  )
}

type CardProps = {
  question: Question
  mine: Answer | undefined
  teams: Team[]
  teamNames: Record<string, string>
  nicknames: Record<string, string>
  userId: string
  isOwner: boolean
  onChanged: () => void
}

function QuestionCard({ question: q, mine, teams, teamNames, nicknames, userId, isOwner, onChanged }: CardProps) {
  const teamQuestion = isTeamQuestion(q.kind)
  const [now] = useState(() => Date.now())
  const closed = new Date(q.closes_at).getTime() <= now
  const [values, setValues] = useState<string[]>(() => mine?.answer ?? [])
  const [all, setAll] = useState<Answer[] | null>(null)
  const [official, setOfficial] = useState<string[] | null>(null)
  const [extra, setExtra] = useState('')
  const [status, setStatus] = useState<string | null>(null)

  const show = (v: string) => (teamQuestion ? teamNames[v] ?? v : v)
  const deadline = new Date(q.closes_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

  async function saveAnswer() {
    const answer = normalizeAnswer(values, q.answer_count)
    if (answer.length === 0) return setStatus('Preencha pelo menos uma resposta.')
    const { error } = await supabase
      .from('question_answers')
      .upsert({ question_id: q.id, user_id: userId, answer }, { onConflict: 'question_id,user_id' })
    setStatus(error ? 'Não foi possível salvar. O prazo pode ter acabado.' : 'Resposta salva.')
    if (!error) onChanged()
  }

  async function loadAll() {
    if (all) return setAll(null)
    const { data } = await supabase.from('question_answers').select('question_id, user_id, answer, points').eq('question_id', q.id)
    setAll((data ?? []) as Answer[])
  }

  async function saveOfficial() {
    const answer = normalizeAnswer([...(official ?? []), extra], 20)
    const { error } = await supabase.from('pool_questions').update({ official_answer: answer.length ? answer : null }).eq('id', q.id)
    setStatus(error ? 'Não foi possível salvar a resposta oficial.' : 'Resposta oficial salva. Os pontos foram calculados.')
    if (!error) {
      setOfficial(null)
      setExtra('')
      onChanged()
    }
  }

  async function remove() {
    if (!window.confirm('Apagar esta pergunta e as respostas dela?')) return
    await supabase.from('pool_questions').delete().eq('id', q.id)
    onChanged()
  }

  // Options for the official answer: every team, or every distinct text answer given.
  const officialOptions = teamQuestion
    ? teams.map((t) => String(t.id))
    : [...new Set((all ?? []).flatMap((a) => a.answer))].sort((a, b) => a.localeCompare(b, 'pt-BR'))

  return (
    <article className="card">
      <h3>{q.prompt}</h3>
      <p className="hint">
        {q.points} {q.points === 1 ? 'ponto' : 'pontos'} por acerto · {closed ? 'encerrada em' : 'responda até'} {deadline}
      </p>

      {!closed && (
        <>
          {Array.from({ length: q.answer_count }, (_, i) =>
            q.kind === 'top_scorer' ? (
              <PlayerPicker key={i} teams={teams} value={values[i] ?? ''} onChange={(name) => setValues(Object.assign([...values], { [i]: name }))} />
            ) : teamQuestion ? (
              <select key={i} value={values[i] ?? ''} onChange={(e) => setValues(Object.assign([...values], { [i]: e.target.value }))}>
                <option value="">{q.answer_count > 1 ? `${i + 1}º time` : 'Escolha o time'}</option>
                {teams.map((t) => <option key={t.id} value={String(t.id)}>{teamName(t)}</option>)}
              </select>
            ) : (
              <input key={i} maxLength={80} value={values[i] ?? ''} placeholder={q.answer_count > 1 ? `Resposta ${i + 1}` : 'Sua resposta'}
                onChange={(e) => setValues(Object.assign([...values], { [i]: e.target.value }))} />
            ),
          )}
          <button type="button" onClick={saveAnswer}>{mine ? 'Atualizar resposta' : 'Salvar resposta'}</button>
        </>
      )}

      {closed && (
        <>
          <p>
            Sua resposta: {mine ? mine.answer.map(show).join(', ') : 'nenhuma'}
            {mine?.points != null && <strong className="points-badge">+{mine.points}</strong>}
          </p>
          {q.official_answer && <p>Resposta oficial: <strong>{q.official_answer.map(show).join(', ')}</strong></p>}
          <button type="button" className="link" onClick={loadAll}>{all ? 'Esconder respostas' : 'Ver respostas da turma'}</button>
          {all && (
            <ul className="others">
              {all.filter((a) => a.user_id !== userId).map((a) => (
                <li key={a.user_id}>
                  <span>{nicknames[a.user_id] ?? 'Capivara'}</span>
                  <span>{a.answer.map(show).join(', ')}{a.points != null ? ` · +${a.points}` : ''}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {isOwner && closed && (
        official === null ? (
          <button type="button" className="link" onClick={async () => {
            if (!teamQuestion && !all) await loadAll()
            setOfficial(q.official_answer ?? [])
          }}>
            {q.official_answer ? 'Corrigir resposta oficial' : 'Definir resposta oficial'}
          </button>
        ) : (
          <div className="official">
            <p className="hint">Marque as respostas certas. Cada participante ganha os pontos por item que acertou.</p>
            <div className="checks">
              {officialOptions.map((v) => (
                <label key={v} className="check">
                  <input type="checkbox" checked={official.includes(v)}
                    onChange={(e) => setOfficial(e.target.checked ? [...official, v] : official.filter((x) => x !== v))} />
                  {show(v)}
                </label>
              ))}
            </div>
            {!teamQuestion && <input value={extra} placeholder="Outra resposta certa" onChange={(e) => setExtra(e.target.value)} />}
            <button type="button" onClick={saveOfficial}>Salvar resposta oficial</button>
            <button type="button" className="link" onClick={() => setOfficial(null)}>Cancelar</button>
          </div>
        )
      )}

      {isOwner && !closed && <button type="button" className="link danger" onClick={remove}>Apagar pergunta</button>}
      {status && <p className="hint">{status}</p>}
    </article>
  )
}

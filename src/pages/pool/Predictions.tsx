import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  MATCH_SELECT, currentMatchday, formatKickoff, hasStarted, isLive, teamName, type Match, type Team,
} from '../../lib/matches'
import {
  draftFrom, firstOf, rowsToSave, type Draft, type SavedPrediction,
} from '../../lib/predictions'
import { RULE_LABELS, isKnockoutStage, pointsOf, type PointsRuleType } from '../../lib/rules'
import { supabase } from '../../lib/supabase'
import { usePool } from './context'

type PredictionRow = Omit<SavedPrediction, 'points' | 'rules_hit'> & {
  user_id: string
  score: { points: number; rules_hit: string[] } | { points: number; rules_hit: string[] }[] | null
}

const PREDICTION_SELECT = 'id, match_id, user_id, home_score, away_score, advancing_team_id, went_to_penalties, score:prediction_scores(points, rules_hit)'

function toSaved(row: PredictionRow): SavedPrediction {
  const score = firstOf(row.score)
  return { ...row, points: score?.points ?? null, rules_hit: score?.rules_hit ?? [] }
}

export default function Predictions() {
  const { pool, members, userId } = usePool()
  const [matches, setMatches] = useState<Match[] | null>(null)
  const [saved, setSaved] = useState<Record<number, SavedPrediction>>({})
  const [drafts, setDrafts] = useState<Record<number, Draft>>({})
  const [matchday, setMatchday] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null)
  const [now, setNow] = useState(() => new Date())

  const knockoutRules = pointsOf(pool.scoring_rules, 'advancing_team') > 0 || pointsOf(pool.scoring_rules, 'penalties') > 0

  const fetchData = useCallback(async () => {
    let query = supabase
      .from('matches')
      .select(MATCH_SELECT)
      .eq('competition_id', pool.competition_id)
      .eq('season', pool.season)
      .order('kickoff_at')
    if (pool.first_matchday) query = query.gte('matchday', pool.first_matchday)
    const [{ data: matchData }, { data: predData }] = await Promise.all([
      query,
      supabase.from('predictions').select(PREDICTION_SELECT).eq('pool_id', pool.id).eq('user_id', userId),
    ])
    return {
      list: (matchData ?? []) as unknown as Match[],
      predictions: (predData ?? []) as unknown as PredictionRow[],
    }
  }, [pool, userId])

  useEffect(() => {
    let active = true
    function apply({ list, predictions }: Awaited<ReturnType<typeof fetchData>>) {
      if (!active) return
      setMatches(list)
      setSaved(Object.fromEntries(predictions.map((p) => [p.match_id, toSaved(p)])))
      setMatchday((current) => current ?? currentMatchday(list))
      setNow(new Date())
    }
    fetchData().then(apply)
    // Keep live scores and points fresh while the screen is open.
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') fetchData().then(apply)
    }, 60_000)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [fetchData])

  const matchdays = useMemo(
    () => [...new Set((matches ?? []).map((m) => m.matchday).filter((d): d is number => d !== null))].sort((a, b) => a - b),
    [matches],
  )
  const dayMatches = (matches ?? []).filter((m) => m.matchday === matchday)
  const openIds = new Set(dayMatches.filter((m) => !hasStarted(m, now)).map((m) => m.id))
  const pending = rowsToSave(drafts, saved, openIds)

  function draftOf(match: Match): Draft {
    return drafts[match.id] ?? draftFrom(saved[match.id])
  }

  function edit(match: Match, patch: Partial<Draft>) {
    setDrafts({ ...drafts, [match.id]: { ...draftOf(match), ...patch } })
    setMessage(null)
  }

  async function save() {
    setBusy(true)
    const { data, error } = await supabase
      .from('predictions')
      .upsert(pending.map((row) => ({ ...row, pool_id: pool.id, user_id: userId })), { onConflict: 'pool_id,user_id,match_id' })
      .select(PREDICTION_SELECT)
    setBusy(false)
    if (error) {
      setMessage({ text: 'Não foi possível salvar. Algum jogo pode ter começado; atualize a página.', error: true })
      return
    }
    const updated = { ...saved }
    for (const row of (data ?? []) as unknown as PredictionRow[]) updated[row.match_id] = toSaved(row)
    setSaved(updated)
    setDrafts({})
    setMessage({ text: 'Palpites salvos.' })
  }

  if (matches === null) return <p>Carregando…</p>
  if (matches.length === 0) return <p>Os jogos deste campeonato ainda não foram carregados.</p>

  const index = matchday === null ? -1 : matchdays.indexOf(matchday)
  const dayTotal = dayMatches.reduce((sum, m) => sum + (saved[m.id]?.points ?? 0), 0)

  return (
    <section>
      <div className="stepper">
        <button type="button" className="secondary" disabled={index <= 0} onClick={() => setMatchday(matchdays[index - 1])} aria-label="Rodada anterior">‹</button>
        <strong>Rodada {matchday}</strong>
        <button type="button" className="secondary" disabled={index >= matchdays.length - 1} onClick={() => setMatchday(matchdays[index + 1])} aria-label="Próxima rodada">›</button>
      </div>
      {dayTotal > 0 && <p className="hint center-text">Seus pontos nesta rodada: {dayTotal}</p>}

      <ul className="matches">
        {dayMatches.map((m) => (
          <MatchCard
            key={m.id}
            match={m}
            draft={draftOf(m)}
            saved={saved[m.id]}
            started={hasStarted(m, now)}
            showKnockout={knockoutRules && isKnockoutStage(m.stage)}
            poolId={pool.id}
            nicknames={Object.fromEntries(members.map((x) => [x.user_id, x.nickname]))}
            userId={userId}
            onEdit={(patch) => edit(m, patch)}
          />
        ))}
      </ul>

      {openIds.size > 0 && (
        <div className="sticky-save">
          <button type="button" disabled={busy || pending.length === 0} onClick={save}>
            {pending.length > 0
              ? `Salvar ${pending.length} ${pending.length === 1 ? 'palpite' : 'palpites'}`
              : [...openIds].every((id) => saved[id]) ? 'Palpites salvos' : 'Preencha os placares'}
          </button>
          {message && <p className={message.error ? 'error' : 'hint'}>{message.text}</p>}
        </div>
      )}
    </section>
  )
}

type CardProps = {
  match: Match
  draft: Draft
  saved: SavedPrediction | undefined
  started: boolean
  showKnockout: boolean
  poolId: string
  nicknames: Record<string, string>
  userId: string
  onEdit: (patch: Partial<Draft>) => void
}

function Crest({ team }: { team: Team | null }) {
  return team?.crest_url ? <img className="crest" src={team.crest_url} alt="" loading="lazy" /> : <span className="crest" />
}

function MatchCard({ match, draft, saved, started, showKnockout, poolId, nicknames, userId, onEdit }: CardProps) {
  const [others, setOthers] = useState<SavedPrediction[] | null>(null)
  const [user, setUser] = useState<Record<number, string>>({})
  const hasResult = match.home_score !== null && match.away_score !== null
  const teams = [match.home_team, match.away_team].filter((t): t is Team => t !== null)

  async function loadOthers() {
    if (others) return setOthers(null)
    const { data } = await supabase.from('predictions').select(PREDICTION_SELECT).eq('pool_id', poolId).eq('match_id', match.id)
    const rows = ((data ?? []) as unknown as PredictionRow[]).filter((r) => r.user_id !== userId)
    setUser(Object.fromEntries(rows.map((r) => [r.id, r.user_id])))
    setOthers(rows.map(toSaved).sort((a, b) => (b.points ?? 0) - (a.points ?? 0)))
  }

  return (
    <li className="match">
      <div className="match-meta">
        <span>{formatKickoff(match.kickoff_at)}</span>
        {isLive(match) && <span className="live">Ao vivo</span>}
        {match.status === 'postponed' && <span>Adiado</span>}
        {match.status === 'cancelled' && <span>Cancelado</span>}
      </div>

      <div className="match-row">
        <span className="team"><Crest team={match.home_team} /><span>{teamName(match.home_team)}</span></span>
        {started ? (
          <span className="score">{hasResult ? `${match.home_score} × ${match.away_score}` : '×'}</span>
        ) : (
          <span className="score-inputs">
            <input inputMode="numeric" maxLength={2} aria-label={`Gols ${teamName(match.home_team)}`} value={draft.home}
              onChange={(e) => onEdit({ home: e.target.value.replace(/\D/g, '') })} />
            <span>×</span>
            <input inputMode="numeric" maxLength={2} aria-label={`Gols ${teamName(match.away_team)}`} value={draft.away}
              onChange={(e) => onEdit({ away: e.target.value.replace(/\D/g, '') })} />
          </span>
        )}
        <span className="team"><Crest team={match.away_team} /><span>{teamName(match.away_team)}</span></span>
      </div>

      {showKnockout && !started && (
        <div className="knockout">
          <label>
            Quem se classifica
            <select value={draft.advancing ?? ''} onChange={(e) => onEdit({ advancing: e.target.value ? Number(e.target.value) : null })}>
              <option value="">—</option>
              {teams.map((t) => <option key={t.id} value={t.id}>{teamName(t)}</option>)}
            </select>
          </label>
          <label className="check">
            <input type="checkbox" checked={draft.penalties === true} onChange={(e) => onEdit({ penalties: e.target.checked })} />
            Vai para os pênaltis
          </label>
        </div>
      )}

      {started && (
        <div className="match-foot">
          <span>
            Seu palpite: {saved ? `${saved.home_score} × ${saved.away_score}` : 'nenhum'}
            {saved?.points != null && <strong className="points-badge">+{saved.points}</strong>}
          </span>
          {saved && saved.rules_hit.length > 0 && (
            <small>{saved.rules_hit.map((r) => RULE_LABELS[r as PointsRuleType] ?? r).join(', ')}</small>
          )}
          <button type="button" className="link" onClick={loadOthers}>{others ? 'Esconder palpites' : 'Ver palpites da turma'}</button>
          {others && (
            others.length === 0 ? <small>Ninguém mais palpitou neste jogo.</small> : (
              <ul className="others">
                {others.map((o) => (
                  <li key={o.id}>
                    <span>{nicknames[user[o.id]] ?? 'Capivara'}</span>
                    <span>{o.home_score} × {o.away_score}{o.points != null ? ` · +${o.points}` : ''}</span>
                  </li>
                ))}
              </ul>
            )
          )}
        </div>
      )}
    </li>
  )
}

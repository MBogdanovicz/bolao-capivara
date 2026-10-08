import { useEffect, useState } from 'react'
import { monthLabel, periodsIn, rankPeriod, type PeriodPoints } from '../../lib/ranking'
import { supabase } from '../../lib/supabase'
import { usePool } from './context'

type RankingRow = {
  user_id: string
  nickname: string
  avatar_url: string | null
  total_points: number
  exact_scores: number
  right_winners: number
  position: number
}

type View = 'overall' | 'round' | 'month'

const VIEWS: { view: View; label: string }[] = [
  { view: 'overall', label: 'Geral' },
  { view: 'round', label: 'Rodada' },
  { view: 'month', label: 'Mês' },
]

export default function Ranking() {
  const { pool, members, userId } = usePool()
  const [view, setView] = useState<View>('overall')
  const [overall, setOverall] = useState<RankingRow[] | null>(null)
  const [periodRows, setPeriodRows] = useState<PeriodPoints[] | null>(null)
  const [matchday, setMatchday] = useState<number | null>(null)
  const [month, setMonth] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('pool_ranking')
      .select('user_id, nickname, avatar_url, total_points, exact_scores, right_winners, position')
      .eq('pool_id', pool.id)
      .order('position')
      .order('nickname')
      .then(({ data }) => setOverall((data ?? []) as RankingRow[]))
    supabase
      .from('pool_period_points')
      .select('user_id, matchday, month, points, exact_scores, right_winners')
      .eq('pool_id', pool.id)
      .then(({ data }) => setPeriodRows((data ?? []) as PeriodPoints[]))
  }, [pool.id])

  if (overall === null || periodRows === null) return <p>Carregando…</p>

  const { matchdays, months } = periodsIn(periodRows)
  // Start on the latest round and month that already have points.
  const round = matchday ?? matchdays.at(-1) ?? null
  const currentMonth = month ?? months.at(-1) ?? null

  const byId = Object.fromEntries(members.map((m) => [m.user_id, m]))
  let rows: RankingRow[] = overall
  if (view !== 'overall') {
    const period = view === 'round' ? (round === null ? null : { kind: 'round' as const, matchday: round })
      : currentMonth === null ? null : { kind: 'month' as const, month: currentMonth }
    rows = period === null ? [] : rankPeriod(members.map((m) => m.user_id), periodRows, period).map((r) => ({
      ...r,
      total_points: r.points,
      nickname: byId[r.user_id]?.nickname ?? 'Capivara',
      avatar_url: byId[r.user_id]?.avatar_url ?? null,
    }))
  }

  return (
    <section>
      <div className="segmented" role="tablist">
        {VIEWS.map((v) => (
          <button key={v.view} type="button" role="tab" aria-selected={view === v.view}
            className={view === v.view ? 'active' : undefined} onClick={() => setView(v.view)}>
            {v.label}
          </button>
        ))}
      </div>

      {view === 'round' && round !== null && (
        <Stepper label={`Rodada ${round}`} list={matchdays} value={round} onChange={setMatchday} prev="Rodada anterior" next="Próxima rodada" />
      )}
      {view === 'month' && currentMonth !== null && (
        <Stepper label={monthLabel(currentMonth)} list={months} value={currentMonth} onChange={setMonth} prev="Mês anterior" next="Próximo mês" />
      )}

      {rows.length === 0 ? (
        <p>Nenhum jogo do bolão terminou ainda.</p>
      ) : (
        <table className="ranking">
          <thead>
            <tr>
              <th>#</th>
              <th className="name">Participante</th>
              <th title="Pontos">Pts</th>
              <th title="Placares exatos">Exatos</th>
              <th title="Vencedores certos">Venc.</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.user_id} className={r.user_id === userId ? 'me' : undefined}>
                <td>{r.position}º</td>
                <td className="name">
                  {r.avatar_url && <img className="avatar" src={r.avatar_url} alt="" referrerPolicy="no-referrer" />}
                  {r.nickname}
                </td>
                <td><strong>{r.total_points}</strong></td>
                <td>{r.exact_scores}</td>
                <td>{r.right_winners}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="hint">
        Desempate: mais placares exatos, depois mais vencedores certos. Os pontos entram quando o jogo termina.
        {view !== 'overall' && ' Por rodada e por mês contam só os jogos; os bônus entram no ranking geral.'}
      </p>
    </section>
  )
}

function Stepper<T>({ label, list, value, onChange, prev, next }: { label: string; list: T[]; value: T; onChange: (v: T) => void; prev: string; next: string }) {
  const index = list.indexOf(value)
  return (
    <div className="stepper">
      <button type="button" className="secondary" disabled={index <= 0} onClick={() => onChange(list[index - 1])} aria-label={prev}>‹</button>
      <strong>{label}</strong>
      <button type="button" className="secondary" disabled={index >= list.length - 1} onClick={() => onChange(list[index + 1])} aria-label={next}>›</button>
    </div>
  )
}

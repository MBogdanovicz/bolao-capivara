import { useEffect, useState } from 'react'
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

export default function Ranking() {
  const { pool, userId } = usePool()
  const [rows, setRows] = useState<RankingRow[] | null>(null)

  useEffect(() => {
    supabase
      .from('pool_ranking')
      .select('user_id, nickname, avatar_url, total_points, exact_scores, right_winners, position')
      .eq('pool_id', pool.id)
      .order('position')
      .order('nickname')
      .then(({ data }) => setRows((data ?? []) as RankingRow[]))
  }, [pool.id])

  if (rows === null) return <p>Carregando…</p>

  return (
    <section>
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
      <p className="hint">Desempate: mais placares exatos, depois mais vencedores certos. Os pontos entram quando o jogo termina.</p>
    </section>
  )
}

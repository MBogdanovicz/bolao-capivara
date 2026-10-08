import { useEffect, useState } from 'react'
import { MATCH_SELECT, teamName, type Match } from '../../lib/matches'
import { hasTable, standings } from '../../lib/standings'
import { supabase } from '../../lib/supabase'
import { usePool } from './context'

// The competition's league table, from the synced results.
export default function Table() {
  const { pool } = usePool()
  const [matches, setMatches] = useState<Match[] | null>(null)

  useEffect(() => {
    let active = true
    const load = () =>
      supabase
        .from('matches')
        .select(MATCH_SELECT)
        .eq('competition_id', pool.competition_id)
        .eq('season', pool.season)
        .then(({ data }) => active && setMatches((data ?? []) as unknown as Match[]))
    load()
    // Keep live scores fresh while the screen is open.
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') load()
    }, 60_000)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [pool.competition_id, pool.season])

  if (matches === null) return <p>Carregando…</p>
  if (!hasTable(matches)) return <p>Este campeonato não tem uma tabela única de pontos corridos.</p>

  const rows = standings(matches)
  return (
    <section>
      <table className="ranking standings">
        <thead>
          <tr>
            <th>#</th>
            <th className="name">Time</th>
            <th title="Pontos">P</th>
            <th title="Jogos">J</th>
            <th title="Vitórias">V</th>
            <th title="Empates">E</th>
            <th title="Derrotas">D</th>
            <th title="Saldo de gols">SG</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.team.id}>
              <td>{r.position}</td>
              <td className="name">
                <span className="who">
                  {r.team.crest_url ? <img className="crest" src={r.team.crest_url} alt="" loading="lazy" /> : <span className="crest" />}
                  <span>{teamName(r.team)}</span>
                  {r.live && <span className="live-dot" title="Jogando agora" />}
                </span>
              </td>
              <td><strong>{r.points}</strong></td>
              <td>{r.played}</td>
              <td>{r.won}</td>
              <td>{r.drawn}</td>
              <td>{r.lost}</td>
              <td>{r.goalsFor - r.goalsAgainst}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="hint">
        Calculada com os resultados do app{rows.some((r) => r.live) && '; quem tem o ponto vermelho está jogando agora e conta com o placar parcial'}.
        Desempate: vitórias, saldo de gols e gols marcados.
      </p>
    </section>
  )
}

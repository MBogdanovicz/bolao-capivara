import { useEffect, useState } from 'react'
import { teamName, type Team } from '../lib/matches'
import { supabase } from '../lib/supabase'

type Player = { id: number; name: string }

const OTHER = '__other'

// Answer for the top scorer question: pick a team, then one of its players.
// "Outro jogador" (or a team without a squad) falls back to typing the name.
// The answer saved is always the player's name.
export function PlayerPicker({ teams, value, onChange }: { teams: Team[]; value: string; onChange: (name: string) => void }) {
  const [teamId, setTeamId] = useState('')
  const [players, setPlayers] = useState<Player[] | null>(null)
  const [typing, setTyping] = useState(false)

  useEffect(() => {
    if (!teamId) return
    supabase
      .from('players')
      .select('id, name')
      .eq('team_id', Number(teamId))
      .order('name')
      .then(({ data }) => setPlayers((data ?? []) as Player[]))
  }, [teamId])

  const noSquad = players !== null && players.length === 0
  const listed = players?.some((p) => p.name === value) ?? false

  return (
    <>
      <select value={teamId} onChange={(e) => {
        setTeamId(e.target.value)
        setPlayers(null)
        setTyping(false)
        onChange('')
      }}>
        <option value="">{value ? 'Trocar: escolha o time' : 'Escolha o time'}</option>
        {teams.map((t) => <option key={t.id} value={String(t.id)}>{teamName(t)}</option>)}
        <option value={OTHER}>Não sei o time</option>
      </select>

      {teamId && teamId !== OTHER && players && !noSquad && (
        <select value={typing ? OTHER : listed ? value : ''} onChange={(e) => {
          const other = e.target.value === OTHER
          setTyping(other)
          onChange(other ? '' : e.target.value)
        }}>
          <option value="">Escolha o jogador</option>
          {players.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
          <option value={OTHER}>Outro jogador (digitar)</option>
        </select>
      )}

      {(typing || noSquad || teamId === OTHER) && (
        <input maxLength={80} value={value} placeholder="Nome do jogador" autoFocus onChange={(e) => onChange(e.target.value)} />
      )}

      {value && !teamId && <p className="hint">Sua resposta: {value}</p>}
    </>
  )
}

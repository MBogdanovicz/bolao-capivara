import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { evolution, type PeriodPoints } from '../../lib/ranking'
import type { Member } from './context'

// Position after each round: one line per member, 1st at the top. One member
// is highlighted (you, unless another name is picked); the rest stay gray as
// context. The round ranking (Rodada tab) is the table view of the same data.

const PAD = { top: 12, right: 40, bottom: 28, left: 32 }

export default function Evolution({ members, rows, userId }: { members: Member[]; rows: PeriodPoints[]; userId: string }) {
  const wrap = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [selected, setSelected] = useState(userId)
  const [hover, setHover] = useState<number | null>(null)

  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const lines = evolution(members.map((m) => m.user_id), rows)
  const rounds = lines.get(members[0]?.user_id ?? '')?.map((p) => p.matchday) ?? []
  if (rounds.length < 2) return <p>O gráfico aparece depois de duas rodadas com jogos encerrados.</p>

  const count = members.length
  const height = Math.min(360, Math.max(180, count * 24)) + PAD.top + PAD.bottom
  const x = (i: number) => PAD.left + (i * (width - PAD.left - PAD.right)) / (rounds.length - 1)
  const y = (position: number) => PAD.top + ((position - 1) * (height - PAD.top - PAD.bottom)) / Math.max(1, count - 1)
  const path = (id: string) => lines.get(id)!.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.position)}`).join('')

  const byId = Object.fromEntries(members.map((m) => [m.user_id, m]))
  const focus = byId[selected] ? selected : userId
  const focusLine = lines.get(focus) ?? []
  const last = focusLine.at(-1)
  // Label at most ~8 rounds on the axis, always the first and the last.
  const every = Math.ceil(rounds.length / 8)
  const positions = [...new Set([1, Math.ceil(count / 2), count])]

  function move(e: PointerEvent<SVGSVGElement>) {
    const box = e.currentTarget.getBoundingClientRect()
    const i = Math.round(((e.clientX - box.left - PAD.left) / (width - PAD.left - PAD.right)) * (rounds.length - 1))
    setHover(Math.max(0, Math.min(rounds.length - 1, i)))
  }

  const tip = hover !== null ? focusLine[hover] : null

  return (
    <section className="evolution">
      <p className="legend">
        <span className="key focus" /> {focus === userId ? 'Você' : byId[focus]?.nickname}
        <span className="key other" /> Outros participantes
      </p>
      <div ref={wrap} className="chart">
        {width > 0 && (
          <svg width={width} height={height} role="img" onPointerMove={move} onPointerDown={move} onPointerLeave={() => setHover(null)}
            aria-label={`Posição de ${byId[focus]?.nickname} por rodada: ${focusLine.map((p) => `rodada ${p.matchday}, ${p.position}º`).join('; ')}`}>
            {positions.map((p) => (
              <g key={p}>
                <line className="grid" x1={PAD.left} x2={width - PAD.right} y1={y(p)} y2={y(p)} />
                <text className="axis" x={PAD.left - 8} y={y(p)} textAnchor="end" dominantBaseline="middle">{p}º</text>
              </g>
            ))}
            {rounds.map((r, i) => (i % every === 0 || i === rounds.length - 1) && (
              <text key={r} className="axis" x={x(i)} y={height - 8} textAnchor="middle">{r}</text>
            ))}
            {hover !== null && <line className="crosshair" x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={height - PAD.bottom} />}
            {members.filter((m) => m.user_id !== focus).map((m) => (
              <path key={m.user_id} className="line other" d={path(m.user_id)} onClick={() => setSelected(m.user_id)} />
            ))}
            <path className="line focus" d={path(focus)} />
            {last && (
              <>
                <circle className="dot" cx={x(rounds.length - 1)} cy={y(last.position)} r={5} />
                <text className="end-label" x={x(rounds.length - 1) + 10} y={y(last.position)} dominantBaseline="middle">{last.position}º</text>
              </>
            )}
            {tip && <circle className="dot" cx={x(hover!)} cy={y(tip.position)} r={5} />}
          </svg>
        )}
        {tip && (
          // Beside the highlighted dot, below it in the top half so it never covers the line.
          <div className="tooltip" style={{
            left: Math.min(Math.max(x(hover!), 70), width - 70),
            top: y(tip.position) < height / 2 ? y(tip.position) + 14 : y(tip.position) - 58,
          }}>
            <strong>Rodada {tip.matchday}</strong>
            <span>{tip.position}º · {tip.points} pts</span>
          </div>
        )}
      </div>
      <label className="pick">
        Destacar
        <select value={focus} onChange={(e) => setSelected(e.target.value)}>
          {members.map((m) => (
            <option key={m.user_id} value={m.user_id}>{m.user_id === userId ? `${m.nickname} (você)` : m.nickname}</option>
          ))}
        </select>
      </label>
      <p className="hint">Posição depois de cada rodada, somando os pontos dos jogos até ali. Os bônus entram só no ranking geral.</p>
    </section>
  )
}

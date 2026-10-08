// Ranking as an image to share in group chats: the top of the ranking, plus
// the person sharing it when they are further down. Drawn on a canvas in the
// club's dark look (black, crest green) whatever the app theme is.

export type ImageRow = { user_id: string; nickname: string; points: number; position: number }

export type ImageEntry = (ImageRow & { me: boolean }) | 'gap'

// The rows to draw: the first `top`, then a gap and the user when they are
// below that.
export function imageEntries(rows: ImageRow[], userId: string, top = 5): ImageEntry[] {
  const entries: ImageEntry[] = rows.slice(0, top).map((r) => ({ ...r, me: r.user_id === userId }))
  const mine = rows.findIndex((r) => r.user_id === userId)
  if (mine >= top) {
    if (mine > top) entries.push('gap')
    entries.push({ ...rows[mine], me: true })
  }
  return entries
}

const W = 1080
const PAD = 72
const COLORS = { bg: '#0b0e0c', card: '#141815', line: '#26302a', text: '#e9eee9', muted: '#9aa59d', neon: '#00ff00', accent: '#3fcf6a' }
const DISPLAY = 'Saira, system-ui, sans-serif'
const BODY = 'system-ui, sans-serif'

function fit(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text
  let s = text
  while (s.length > 1 && ctx.measureText(`${s}…`).width > max) s = s.slice(0, -1)
  return `${s.trimEnd()}…`
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

export async function rankingImage(poolName: string, period: string, rows: ImageRow[], userId: string): Promise<Blob> {
  await Promise.all([document.fonts.load(`700 40px ${DISPLAY}`), document.fonts.load(`600 40px ${DISPLAY}`)]).catch(() => {})
  const crest = await loadImage('/crest.png')

  const entries = imageEntries(rows, userId)
  const rowH = 118
  // Tall enough for the rows; at least square, which chat apps preview well.
  const listH = entries.reduce((h, e) => h + (e === 'gap' ? 64 : rowH), 0)
  const H = Math.max(W, PAD + 380 + listH + 120)

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = COLORS.bg
  ctx.fillRect(0, 0, W, H)

  // Header: crest, wordmark, then the pool and the period.
  if (crest) ctx.drawImage(crest, PAD, PAD, 120, 120)
  ctx.textBaseline = 'middle'
  ctx.fillStyle = COLORS.neon
  ctx.font = `700 44px ${DISPLAY}`
  ctx.fillText('BOLÃO CAPIVARA', PAD + 148, PAD + 60)
  ctx.fillStyle = COLORS.accent
  ctx.fillRect(PAD, PAD + 156, W - 2 * PAD, 4)

  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = COLORS.text
  ctx.font = `700 64px ${DISPLAY}`
  ctx.fillText(fit(ctx, poolName, W - 2 * PAD), PAD, PAD + 260)
  ctx.fillStyle = COLORS.muted
  ctx.font = `600 40px ${DISPLAY}`
  ctx.fillText(period, PAD, PAD + 318)

  // Rows.
  let y = PAD + 380
  for (const e of entries) {
    if (e === 'gap') {
      ctx.fillStyle = COLORS.muted
      ctx.font = `700 40px ${BODY}`
      ctx.textAlign = 'center'
      ctx.fillText('···', W / 2, y + 40)
      ctx.textAlign = 'left'
      y += 64
      continue
    }
    ctx.fillStyle = e.me ? '#1d2a21' : COLORS.card
    ctx.beginPath()
    ctx.roundRect(PAD, y, W - 2 * PAD, rowH - 16, 20)
    ctx.fill()
    if (e.me) {
      ctx.strokeStyle = COLORS.accent
      ctx.lineWidth = 3
      ctx.stroke()
    }
    const mid = y + (rowH - 16) / 2
    ctx.textBaseline = 'middle'
    ctx.fillStyle = e.position === 1 ? COLORS.neon : COLORS.text
    ctx.font = `700 48px ${DISPLAY}`
    ctx.fillText(`${e.position}º`, PAD + 32, mid)
    ctx.textAlign = 'right'
    ctx.fillStyle = COLORS.accent
    ctx.font = `700 48px ${DISPLAY}`
    const pts = `${e.points} pts`
    ctx.fillText(pts, W - PAD - 32, mid)
    const ptsW = ctx.measureText(pts).width
    ctx.textAlign = 'left'
    ctx.fillStyle = COLORS.text
    ctx.font = `${e.me ? 700 : 500} 42px ${BODY}`
    ctx.fillText(fit(ctx, e.nickname, W - 2 * PAD - 180 - ptsW - 56), PAD + 168, mid)
    ctx.textBaseline = 'alphabetic'
    y += rowH
  }

  ctx.fillStyle = COLORS.muted
  ctx.font = `500 32px ${BODY}`
  ctx.textAlign = 'center'
  ctx.fillText('bolao.capivaraec.com', W / 2, H - PAD + 8)

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob'))), 'image/png'))
}

// Opens the share sheet with the image, or downloads it where files cannot be
// shared (desktop browsers).
export async function shareImage(blob: Blob, title: string): Promise<void> {
  const file = new File([blob], 'ranking.png', { type: 'image/png' })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title })
      return
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return
    }
  }
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'ranking.png'
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000)
}

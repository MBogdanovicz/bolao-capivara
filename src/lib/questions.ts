// Bonus questions (pool_questions). Team questions store team ids as strings;
// text questions store what people typed (or the player picked from a list).

export type QuestionKind = 'champion' | 'relegated' | 'top_n' | 'top_scorer' | 'free'

export type QuestionDraft = {
  kind: QuestionKind
  prompt: string
  answerCount: number
  points: number
}

export type QuestionTemplate = QuestionDraft & { label: string }

export const QUESTION_TEMPLATES: QuestionTemplate[] = [
  { kind: 'champion', label: 'Campeão', prompt: 'Quem será o campeão?', answerCount: 1, points: 15 },
  { kind: 'relegated', label: 'Rebaixados', prompt: 'Quem serão os rebaixados?', answerCount: 4, points: 5 },
  { kind: 'top_n', label: 'G4', prompt: 'Quem vai terminar no G4?', answerCount: 4, points: 5 },
  { kind: 'top_scorer', label: 'Artilheiro', prompt: 'Quem será o artilheiro?', answerCount: 1, points: 10 },
  { kind: 'free', label: 'Pergunta livre', prompt: '', answerCount: 1, points: 5 },
]

export function isTeamQuestion(kind: QuestionKind): boolean {
  return kind === 'champion' || kind === 'relegated' || kind === 'top_n'
}

// Champion, relegated, top N and top scorer are answered automatically from
// the API when the season ends; free questions are answered by the owner.
export function isAutomatic(kind: QuestionKind): boolean {
  return kind !== 'free'
}

// A pool has at most one question of each kind, except free questions.
export function canAddKind(kind: QuestionKind, existing: QuestionKind[]): boolean {
  return kind === 'free' || !existing.includes(kind)
}

// The database compares text answers ignoring case and outer spaces; collapse
// inner spaces too before saving.
export function cleanTextAnswer(text: string): string {
  return text.trim().replace(/\s+/g, ' ')
}

// Answer list ready to save: no blanks, no repeats, at most answerCount items.
export function normalizeAnswer(values: string[], answerCount: number): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const v of values.map(cleanTextAnswer)) {
    if (v && !seen.has(v)) {
      seen.add(v)
      out.push(v)
    }
  }
  return out.slice(0, answerCount)
}

export function validateDraft(q: QuestionDraft): string | null {
  if (!cleanTextAnswer(q.prompt)) return 'Escreva a pergunta.'
  if (!Number.isInteger(q.answerCount) || q.answerCount < 1 || q.answerCount > 20) return 'Quantidade de respostas entre 1 e 20.'
  if (!Number.isInteger(q.points) || q.points < 0) return 'Pontos inválidos.'
  return null
}

// <input type="datetime-local"> works in local time without a time zone.
export function toLocalInput(iso: string): string {
  const d = new Date(iso)
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

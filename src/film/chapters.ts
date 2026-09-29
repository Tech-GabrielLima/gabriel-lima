// The film's edit decision list: every chapter, in order, with its running time
// in seconds (watch mode). Everything else — the player, the scene host, the
// transitions — is derived from this table.

export type ChapterId = 'countdown' | 'booth' | 'studio' | 'alley' | 'crossing' | 'moon' | 'credits'

export interface Chapter {
  id: ChapterId
  /** Two-digit scene number as printed on the slate. */
  n: string
  start: number
  dur: number
  /** Accent colour for this chapter (see ROTEIRO §1). */
  accent: string
}

const EDIT: [ChapterId, number, string][] = [
  ['countdown', 9, '#ffb36b'],
  ['booth', 20, '#ffb36b'],
  ['studio', 30, '#8fb8ff'],
  ['alley', 90, '#3ef0e6'],
  ['crossing', 48, '#7fd6c2'],
  ['moon', 36, '#e9eef5'],
  ['credits', 25, '#ff5a4f'],
]

export const CHAPTERS: Chapter[] = []
let t = 0
for (const [id, dur, accent] of EDIT) {
  CHAPTERS.push({ id, n: String(CHAPTERS.length).padStart(2, '0'), start: t, dur, accent })
  t += dur
}
export const TOTAL = t

export function chapterAt(time: number): Chapter {
  for (let i = CHAPTERS.length - 1; i >= 0; i--) if (time >= CHAPTERS[i].start) return CHAPTERS[i]
  return CHAPTERS[0]
}

export const chapterById = (id: ChapterId) => CHAPTERS.find((c) => c.id === id)!

/** Film timecode HH:MM:SS:FF at 24 fps. */
export function timecode(time: number): string {
  const f = Math.floor(time * 24)
  const pad = (v: number) => String(v).padStart(2, '0')
  return `${pad(Math.floor(f / 86400))}:${pad(Math.floor(f / 1440) % 60)}:${pad(Math.floor(f / 24) % 60)}:${pad(f % 24)}`
}

import type { Gl1 } from './machine'

// The size of the terminal a machine is drawn on, for full-screen cards (vi).
// Terminal.tsx reports it per machine; until it does, the last screen that
// was sized (vt.ts notes it) stands in, then 80x24.

export interface TermSize {
  cols: number
  rows: number
}

const sizes = new WeakMap<Gl1, TermSize>()
let last: TermSize = { cols: 80, rows: 24 }

export function setTermSize(m: Gl1, cols: number, rows: number) {
  sizes.set(m, { cols, rows })
}

/** Called by vt.ts whenever a Screen is created or resized. */
export function noteScreen(cols: number, rows: number) {
  last = { cols, rows }
}

export function termSize(m: Gl1): TermSize {
  return sizes.get(m) ?? last
}

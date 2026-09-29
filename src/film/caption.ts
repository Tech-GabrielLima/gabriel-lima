import { create } from 'zustand'

/** A lower-third title card, set by scenes (e.g. the door the visitor is lighting). */
export interface Caption {
  kicker: string
  title: string
  /** The one-liner anyone understands. */
  hook?: string
  /** Neon number / key metric. */
  line?: string
  /** Plain-language explanation. */
  body?: string
  /** Technical detail, collapsed under "How it works". */
  details?: string
  stack?: string
  url?: string
  accent?: string
  /** A primary call to action, e.g. answering the phone. */
  action?: { label: string; run(): void }
  /** Full card with a close button (an opened door), vs a passing title. */
  open?: boolean
}

export const useCaption = create<{ caption: Caption | null; close: (() => void) | null }>(() => ({
  caption: null,
  close: null,
}))

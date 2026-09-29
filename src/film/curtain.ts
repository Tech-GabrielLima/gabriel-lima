import { create } from 'zustand'
import type { ChapterId } from './chapters'

// The house curtain between scenes. Loading, decoding and compiling a scene
// stalls the GPU and the main thread; rather than hold a white flash over it,
// a velvet curtain comes down (drawn in the DOM, animated on the compositor,
// so it stays smooth while WebGL is busy) and only rises once the next scene
// has been fetched, compiled and drawn behind it. See ui/Curtain.tsx.

export type CurtainPhase = 'open' | 'closing' | 'closed' | 'opening'

interface Curtain {
  phase: CurtainPhase
  /** The chapter the curtain announces: the one being set up behind it. */
  chapter: ChapterId | null
  /** The film clock waits while this is true (see FilmClock). */
  hold: boolean
  /** The scene behind is loaded, compiled and drawn: the curtain may rise. */
  ready: boolean
}

export const useCurtain = create<Curtain>(() => ({ phase: 'open', chapter: null, hold: false, ready: false }))

if (new URLSearchParams(location.search).has('debug')) (window as unknown as { __curtain: typeof useCurtain }).__curtain = useCurtain

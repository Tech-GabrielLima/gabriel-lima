import { create } from 'zustand'
import { useFilm } from '../film/store'

// X-RAY (ROTEIRO §0.2): "from pixel to silicon", literally. The frame peels
// down through the site's own stack, live, layer by layer: the pixels on
// screen, the geometry that made them, the shader that coloured them, the
// packets that fed it, the server that sent them, the chip that drew it. The
// peel itself is a scene of the film: it spreads from wherever the visitor's
// light is (xray/XrayEffect.ts).
//
// Hold R to go down (a layer every DESCENT_S), let go to stay and look, tap R
// or Escape to come back up. Once per visitor the film shows it by itself: a
// projection fault in the alley tears the frame open for a moment.

export const LAYERS = ['pixel', 'geometry', 'shader', 'network', 'server', 'silicon'] as const
export type Layer = (typeof LAYERS)[number]
export const DEEPEST = LAYERS.length - 1
/** Seconds per layer while R is held. */
export const DESCENT_S = 1.3

interface Xray {
  on: boolean
  /** The layer asked for (0 = pixel … 5 = silicon). */
  depth: number
  /** Where the peel actually is, eased towards `depth` (fractions are mid-transition). */
  shown: number
  /** R (or the player's button) is held down: keep descending (once it's clearly a hold, not a tap). */
  holding: boolean
  /** When the hold began (performance.now()). */
  holdSince: number
  /** The film was playing before the X-ray opened: it resumes when it closes. */
  resume: boolean
  /** 0..1 while the one-off projection fault is tearing the frame. */
  glitch: number
  /** Show the player's hint ("hold R to see the rest") after the fault. */
  hint: boolean
}

export const useXray = create<Xray>(() => ({ on: false, depth: 0, shown: 0, holding: false, holdSince: 0, resume: false, glitch: 0, hint: false }))

export function openXray() {
  if (useXray.getState().on) return
  const playing = useFilm.getState().playing
  if (playing) useFilm.setState({ playing: false })
  useXray.setState({ on: true, depth: 0, shown: 0, resume: playing, hint: false })
  remember('used')
}

export function closeXray() {
  const { on, resume } = useXray.getState()
  if (!on) return
  useXray.setState({ on: false, depth: 0, holding: false, resume: false })
  if (resume) useFilm.setState({ playing: true })
}

export function descend(step: number) {
  const { on, depth } = useXray.getState()
  if (!on) return
  useXray.setState({ depth: Math.max(0, Math.min(DEEPEST, depth + step)) })
}

export const setDepth = (d: number) => useXray.getState().on && useXray.setState({ depth: Math.max(0, Math.min(DEEPEST, d)) })

/* ---------------------------------------------------------------- hold / tap */

let pressedAt = 0
let wasOn = false

/** R (or the button) went down: open if closed, and start descending. */
export function press() {
  pressedAt = performance.now()
  wasOn = useXray.getState().on
  if (!wasOn) openXray()
  useXray.setState({ holding: true, holdSince: pressedAt })
}

/** A press shorter than this is a tap (open, or close); longer, a hold (go down). */
export const TAP_MS = 280

/** …and came up: a short tap on an open X-ray closes it; a hold just stops where it is. */
export function release() {
  if (!useXray.getState().holding) return
  useXray.setState({ holding: false })
  if (wasOn && performance.now() - pressedAt < TAP_MS) closeXray()
}

/* ---------------------------------------------------------------- once per visitor */

const KEY = 'sn.xray'
function remember(what: 'glitch' | 'used') {
  try {
    localStorage.setItem(`${KEY}.${what}`, '1')
  } catch {
    /* private mode */
  }
}
export function remembered(what: 'glitch' | 'used') {
  try {
    return localStorage.getItem(`${KEY}.${what}`) === '1'
  } catch {
    return false
  }
}
export const markGlitchSeen = () => remember('glitch')

if (new URLSearchParams(location.search).has('debug')) (window as unknown as { __xray: typeof useXray }).__xray = useXray

import { create } from 'zustand'

// Rendering tier (ROTEIRO §8, v2 mobile). 'low' is for phones and weak GPUs:
// lower pixel ratio, smaller shadow maps, fewer particles, and no planar
// reflection on the wet floor. Picked from the device, then lowered at runtime
// if the frame rate can't keep up (see <FrameGuard/> in App.tsx).
// ?quality=low|high forces a tier.

export type Tier = 'low' | 'high'

const params = new URLSearchParams(location.search)
const nav = navigator as Navigator & { deviceMemory?: number }

export const IS_TOUCH = matchMedia('(pointer: coarse)').matches

function detect(): Tier {
  const forced = params.get('quality')
  if (forced === 'low' || forced === 'high') return forced
  const small = Math.min(screen.width, screen.height) < 700
  const weak = (nav.hardwareConcurrency ?? 8) <= 4 || (nav.deviceMemory ?? 8) <= 4
  return IS_TOUCH || small || weak ? 'low' : 'high'
}

export const useQuality = create<{ tier: Tier; dpr: number; setDpr(d: number): void; lower(): void }>((set, get) => ({
  tier: detect(),
  // Phones start sharp (up to 1.75× on a 3× screen) and only ever soften to 1×: below that it's a smear.
  dpr: Math.min(devicePixelRatio, 1.75),
  setDpr: (dpr) => set({ dpr }),
  lower: () => {
    const { tier, dpr } = get()
    if (dpr > 1.01) set({ dpr: Math.max(1, dpr - 0.25) })
    else if (tier === 'high') set({ tier: 'low' })
  },
}))

/** Picks a value per tier. */
export const q = <T,>(high: T, low: T): T => (useQuality.getState().tier === 'low' ? low : high)

/** Reactive variant for components that should re-render when the tier drops. */
export const useQ = <T,>(high: T, low: T): T => (useQuality((s) => s.tier) === 'low' ? low : high)

/**
 * Model URL for the current tier: phones load the 512 px-texture variants
 * (scripts/lowres.mjs), a quarter of the video memory — mobile browsers drop
 * the whole WebGL context when they run out.
 */
export const asset = (url: string) => (useQuality.getState().tier === 'low' && url.startsWith('/models/') ? url.replace('/models/', '/models/low/') : url)

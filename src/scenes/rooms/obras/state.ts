import { create } from 'zustand'

// The EM OBRAS room's bus between the scene and its controls: how many floors
// are up, how many takes were called, and whether the crane is mid-take.

export const REPOS = [
  { id: 'front', label: 'FRONT-END', color: '#6bd6ff', what: { en: 'interfaces, rendering and the browser, researched from first principles', pt: 'interfaces, renderização e o navegador, pesquisados desde os fundamentos' } },
  { id: 'node', label: 'NODE', color: '#7dffa8', what: { en: 'the runtime and its event loop, taken apart', pt: 'o runtime e o seu event loop, desmontados' } },
  { id: 'android', label: 'ANDROID', color: '#ffb36b', what: { en: 'the platform, from the app down', pt: 'a plataforma, do app para baixo' } },
] as const

export const PER_REPO = 3
export const FLOORS = REPOS.length * PER_REPO
/** Floors already up when the visitor walks in. */
export const START = 4

/** `cut`: "Corta!" called mid-take (frame 30, the blooper); `oops`: when the last one happened. */
export const useObrasRoom = create<{ built: number; takes: number; busy: boolean; cut: number; oops: number }>(() => ({ built: START, takes: 0, busy: false, cut: 0, oops: 0 }))

if (new URLSearchParams(location.search).has('debug')) (window as unknown as { __obrasRoom: typeof useObrasRoom }).__obrasRoom = useObrasRoom

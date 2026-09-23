import { create } from 'zustand'
import { TOTAL } from './chapters'

export type Mode = 'watch' | 'explore'
export type Lang = 'en' | 'pt'

interface FilmState {
  /** The projector has been switched on (first user gesture; unlocks audio). */
  started: boolean
  playing: boolean
  mode: Mode
  /** Current film time in seconds. Advanced by <FilmClock/> every frame. */
  time: number
  /** Explore mode eases `time` towards this value. */
  target: number
  lang: Lang
  sound: boolean
  captions: boolean

  start(): void
  togglePlay(): void
  toggleMode(): void
  seek(t: number): void
  /** Explore-mode scrub by a relative amount of seconds. */
  nudge(dt: number): void
  setLang(l: Lang): void
  toggleSound(): void
  toggleCaptions(): void
}

// Per-viewer conveniences only; the page must work when storage is unavailable.
const read = (k: string) => {
  try {
    return localStorage.getItem(`sn.${k}`)
  } catch {
    return null
  }
}
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(`sn.${k}`, v)
  } catch {
    /* private mode */
  }
}

const params = new URLSearchParams(location.search)
const clamp = (t: number) => Math.min(TOTAL, Math.max(0, t))
const startAt = clamp(Number(params.get('t') ?? (params.has('door') ? 57 : 0)))

const initialLang = (params.get('lang') ?? read('lang') ?? (navigator.language.startsWith('pt') ? 'pt' : 'en')) as Lang

export const useFilm = create<FilmState>((set, get) => ({
  started: params.has('start'),
  playing: params.has('start') && params.get('mode') !== 'explore',
  mode: params.get('mode') === 'explore' ? 'explore' : 'watch',
  time: startAt,
  target: startAt,
  lang: initialLang,
  sound: read('sound') !== '0',
  captions: read('cc') === '1',

  start: () => set({ started: true, playing: get().mode === 'watch' }),
  togglePlay: () => {
    const { playing, time, mode } = get()
    // Replaying from the end restarts the film.
    if (!playing && time >= TOTAL) set({ time: 0, target: 0 })
    set({ playing: !playing, mode: playing ? mode : 'watch' })
  },
  toggleMode: () => {
    const { mode, time } = get()
    set(mode === 'watch' ? { mode: 'explore', playing: false, target: time } : { mode: 'watch', playing: true })
  },
  seek: (t) => set({ time: clamp(t), target: clamp(t) }),
  nudge: (dt) => set({ target: clamp(get().target + dt) }),
  setLang: (lang) => {
    write('lang', lang)
    document.documentElement.lang = lang === 'pt' ? 'pt-BR' : 'en'
    set({ lang })
  },
  toggleSound: () => {
    const sound = !get().sound
    write('sound', sound ? '1' : '0')
    set({ sound })
  },
  toggleCaptions: () => {
    const captions = !get().captions
    write('cc', captions ? '1' : '0')
    set({ captions })
  },
}))

export { clamp as clampTime }

// ?debug exposes the film's state to test scripts (scripts/cuts.mjs).
if (params.has('debug')) (window as unknown as { __film: typeof useFilm }).__film = useFilm

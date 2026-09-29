import { useProgress } from '../cinema/progress'
import { useUsher } from '../cinema/usher'
import { chapterAt } from '../film/chapters'
import { useRoom } from '../film/room'
import { useFilm } from '../film/store'
import { usePreload } from '../lobby/preload'
import { FRAME_NAME } from '../cinema/frames'

// The black box of the visit (ROTEIRO §0.4.8): what the Cabin 0 replays as
// "your session, as an 8mm film". Like flight, and like the ledger, it's a
// log: samples of where the visitor was (the act, the film's time, the light)
// and the events of the night (frames found, the usher's lines). Kept in this
// browser only, never sent anywhere.

export interface Sample {
  /** ms since the visit began */
  t: number
  act: 1 | 2 | 3
  /** film time (s) */
  ft: number
  x: number
  y: number
  room: string | null
}
export interface Note {
  t: number
  kind: 'frame' | 'usher'
  text: string
}
export interface Recording {
  start: number
  samples: Sample[]
  notes: Note[]
}

const KEY = 'sn.rec'
const MAX = 6000

function load(): Recording {
  try {
    const r = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Recording | null
    if (r && Array.isArray(r.samples)) return r
  } catch {
    /* private mode */
  }
  return { start: Date.now(), samples: [], notes: [] }
}

const rec = load()
export const recording = () => rec

function save() {
  // Too long a night: keep every other sample of the older half.
  if (rec.samples.length > MAX) rec.samples = [...rec.samples.slice(0, MAX / 2).filter((_, i) => i % 2 === 0), ...rec.samples.slice(MAX / 2)]
  try {
    localStorage.setItem(KEY, JSON.stringify(rec))
  } catch {
    /* the night isn't remembered: fine */
  }
}

let started = false
const pointer = { x: 0, y: 0 }

/** Starts recording (once, from Root). */
export function startRecording() {
  if (started) return
  started = true
  addEventListener('pointermove', (e) => {
    pointer.x = (e.clientX / innerWidth) * 2 - 1
    pointer.y = 1 - (e.clientY / innerHeight) * 2
  })
  const at = () => Date.now() - rec.start
  setInterval(() => {
    if (document.hidden) return
    const act = usePreload.getState().act
    rec.samples.push({ t: at(), act: act === 'lobby' ? 1 : act === 'film' ? 2 : 3, ft: Math.round(useFilm.getState().time * 10) / 10, x: Math.round(pointer.x * 100) / 100, y: Math.round(pointer.y * 100) / 100, room: useRoom.getState().room })
  }, 500)
  let lastFrame = useProgress.getState().latest?.at ?? 0
  useProgress.subscribe((s) => {
    if (!s.latest || s.latest.at === lastFrame) return
    lastFrame = s.latest.at
    const name = FRAME_NAME[s.latest.id]
    rec.notes.push({ t: at(), kind: 'frame', text: `${s.found.length} · ${name?.[useFilm.getState().lang] ?? s.latest.id}` })
  })
  let lastLine = 0
  useUsher.subscribe((s) => {
    if (!s.line || s.line.at === lastLine) return
    lastLine = s.line.at
    rec.notes.push({ t: at(), kind: 'usher', text: s.line.text })
  })
  setInterval(save, 10_000)
  addEventListener('pagehide', save)
}

/** How long in each act (ms), from the samples. */
export function timePerAct(r: Recording) {
  const out = { 1: 0, 2: 0, 3: 0 }
  for (let i = 1; i < r.samples.length; i++) {
    const dt = Math.min(5000, r.samples[i].t - r.samples[i - 1].t)
    out[r.samples[i - 1].act] += dt
  }
  return out
}

/** The film chapter a sample was in (for its picture). */
export const chapterOf = (s: Sample) => chapterAt(s.ft).id

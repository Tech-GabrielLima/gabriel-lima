import { create } from 'zustand'
import { useFilm } from '../film/store'
import { readShared } from './machine'
import { getPyodide, withOutput } from './py'

// The Projector Workshop (ROTEIRO §0.4.5, frame 17). Once the visitor has sat
// at the booth's computer, the film's projector is driven by a Python script
// on its disk, /home/visitante/controle.py: for every frame it projects, it
// calls estado(quadro) and uses what comes back (the speed, the colour of the
// light, the grain). The script has a bug a person would write; when the film
// reaches it, the projector jams for real, with Python's own traceback.
// Nobody loads CPython for this unless they went to that computer.

export const SCRIPT = '/home/visitante/controle.py'

interface Projector {
  armed: boolean
  fps: number
  tint: [number, number, number]
  grain: number
  jammed: boolean
  /** The frame it jammed at, and Python's traceback. */
  at: number | null
  error: string | null
  /** It jammed once and the visitor fixed it. */
  fixed: boolean
}

export const useProjector = create<Projector>(() => ({ armed: false, fps: 24, tint: [1, 1, 1], grain: 0.035, jammed: false, at: null, error: null, fixed: false }))

/** The last film frame (at 24 fps, the reel's own count) that went through estado(). */
let last = -1
let src = ''

const PROJECT = `
import traceback
__ok = True
__err = ''
__state = None
__at = -1
try:
    __ns = {'__name__': 'controle'}
    exec(compile(__src, '${SCRIPT}', 'exec'), __ns)
    for __q in range(__from, __to + 1):
        __state = __ns['estado'](__q)
        __at = __q
except BaseException:
    __ok = False
    __err = traceback.format_exc()
    __at = __q if '__q' in dir() else __at
(__ok, __err, __at, None if __state is None else (float(__state.get('fps', 24)), tuple(float(c) for c in __state.get('cor', (1, 1, 1))), float(__state.get('grao', 0.035))))
`

type PyResult = { toJs(o?: { create_proxies?: boolean }): [boolean, string, number, [number, [number, number, number], number] | null] }

/** Runs the script over frames [from, to] → null if it projected them, or the frame and traceback where it jammed. */
export async function project(source: string, from: number, to: number): Promise<{ at: number; error: string } | null> {
  const py = await getPyodide()
  py.globals.set('__src', source)
  py.globals.set('__from', from)
  py.globals.set('__to', to)
  const r = (await withOutput(py, () => {}, () => {}, async () => py.runPython(PROJECT))) as PyResult
  const [ok, err, at, st] = r.toJs()
  if (st) useProjector.setState({ fps: Math.max(1, Math.min(96, st[0])), tint: st[1], grain: Math.max(0, Math.min(0.3, st[2])) })
  return ok ? null : { at, error: err }
}

function jam(at: number, error: string) {
  useProjector.setState({ jammed: true, at, error })
  useFilm.setState({ playing: false })
}

/** From now on the projector obeys controle.py (called when the visitor sits at the booth computer). */
export function armProjector() {
  if (useProjector.getState().armed) return
  useProjector.setState({ armed: true })
  last = Math.floor(useFilm.getState().time * 24)
  void getPyodide()
  let busy = false
  setInterval(async () => {
    const p = useProjector.getState()
    if (busy || p.jammed) return
    const q = Math.floor(useFilm.getState().time * 24)
    if (q < last) last = q
    if (q === last) return
    busy = true
    try {
      src = (await readShared(SCRIPT)) ?? src
      if (!src) return
      const r = await project(src, last + 1, q)
      last = q
      if (r) jam(r.at, r.error)
    } finally {
      busy = false
    }
  }, 400)
}

/** The visitor ran the projector again after editing the script: did it get past where it jammed? */
export async function rerun(source: string): Promise<{ ok: boolean; error?: string; at?: number }> {
  src = source
  const p = useProjector.getState()
  const from = Math.max(0, (p.at ?? Math.floor(useFilm.getState().time * 24)) - 48)
  const r = await project(source, from, from + 240)
  if (r) {
    useProjector.setState({ at: r.at, error: r.error })
    return { ok: false, error: r.error, at: r.at }
  }
  const was = p.jammed
  useProjector.setState({ jammed: false, error: null, fixed: p.fixed || was })
  last = from + 240
  return { ok: true }
}

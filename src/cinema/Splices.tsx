import { useEffect, useRef } from 'react'
import { TOTAL } from '../film/chapters'
import { useFilm } from '../film/store'
import { CUT_AT, FRAMES } from './frames'
import { useProgress } from './progress'

// Where the reel is missing a frame, the projection drops one: a single black
// frame with the splice line across it, the kind of thing you're not sure you
// saw (ROTEIRO §0.4.3). Once the frame is found, that cut plays clean.

const FRAME_MS = 1000 / 24
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches

export function Splices() {
  const el = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (REDUCED) return
    let last = useFilm.getState().time
    let timer = 0
    return useFilm.subscribe((s) => {
      const from = last
      last = s.time
      // Only while the film runs forward at its own pace: scrubbing isn't projecting.
      if (!s.playing || s.time <= from || s.time - from > 0.5) return
      const found = useProgress.getState().found
      const hit = FRAMES.findIndex((f, i) => !found.includes(f.id) && CUT_AT[i] * TOTAL > from && CUT_AT[i] * TOTAL <= s.time)
      if (hit < 0 || !el.current) return
      el.current.style.setProperty('--y', `${20 + ((hit * 37) % 60)}%`)
      el.current.classList.add('on')
      clearTimeout(timer)
      timer = window.setTimeout(() => el.current?.classList.remove('on'), FRAME_MS)
    })
  }, [])
  return <div ref={el} className="splice" aria-hidden />
}

import { useEffect } from 'react'
import { useFilm } from '../film/store'
import { useXray } from '../xray/xray'

/** Seconds of film per pixel of scroll/drag in explore mode. */
const SCRUB = 0.025

/** Wheel, touch-drag and keyboard controls for the film. */
export function useExploreInput() {
  useEffect(() => {
    const film = useFilm.getState

    const onWheel = (e: WheelEvent) => {
      // The X-ray owns the wheel while it's open (it moves between layers).
      if (film().mode !== 'explore' || useXray.getState().on) return
      e.preventDefault()
      const px = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY
      film().nudge(px * SCRUB)
    }

    // On touch screens a finger on the picture is the light (film/cursor.ts);
    // the film is scrubbed from the player's chapter strip instead.

    const onKey = (e: KeyboardEvent) => {
      if (!film().started || useXray.getState().on || (e.target as HTMLElement).closest('input, textarea')) return
      const s = film()
      if (e.code === 'Space' && (e.target as HTMLElement).tagName !== 'BUTTON') {
        e.preventDefault()
        s.togglePlay()
      } else if (e.code === 'ArrowRight') s.seek(s.time + 5)
      else if (e.code === 'ArrowLeft') s.seek(s.time - 5)
      else if (e.key === 'e' || e.key === 'E') s.toggleMode()
    }

    addEventListener('wheel', onWheel, { passive: false })
    addEventListener('keydown', onKey)
    return () => {
      removeEventListener('wheel', onWheel)
      removeEventListener('keydown', onKey)
    }
  }, [])
}

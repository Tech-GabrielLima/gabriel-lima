import { useFrame } from '@react-three/fiber'
import { TOTAL } from './chapters'
import { updateCursor } from './cursor'
import { useFilm } from './store'
import { useCurtain } from './curtain'
import { useWarm } from './warm'

/** Advances film time: linearly while playing, eased towards the scrub target in explore mode. */
export function FilmClock() {
  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.1)
    updateCursor(dt, state.clock.elapsedTime)

    const s = useFilm.getState()
    if (!s.started) return
    // A new scene is loading or compiling, or the curtain is still down over it: hold the frame.
    if (useWarm.getState().warming || useCurtain.getState().hold) return
    let t = s.time
    if (s.mode === 'watch') {
      if (s.playing) t = Math.min(TOTAL, t + dt)
    } else {
      t += (s.target - t) * (1 - Math.exp(-dt * 5))
      if (Math.abs(s.target - t) < 1e-3) t = s.target
    }
    if (t !== s.time) useFilm.setState({ time: t })
    ;(window as unknown as { __filmTime?: number }).__filmTime = t
    if (s.playing && t >= TOTAL) useFilm.setState({ playing: false })
  })
  return null
}

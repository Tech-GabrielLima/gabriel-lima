import { useFrame } from '@react-three/fiber'
import { TOTAL } from './chapters'
import { updateCursor } from './cursor'
import { useFilm } from './store'
import { useCurtain } from './curtain'
import { useRoom } from './room'
import { useWarm } from './warm'
import { useProjector } from '../gl1/projector'

/** The film's time before it's cut into the projector's frames (see below). */
let raw = 0

/** Advances film time: linearly while playing, eased towards the scrub target in explore mode. */
export function FilmClock() {
  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.1)
    updateCursor(dt, state.clock.elapsedTime)

    const s = useFilm.getState()
    if (!s.started) return
    // A new scene is loading or compiling, or the curtain is still down over it: hold the frame.
    // …and inside a room behind an alley door, the film waits for the visitor to walk back out.
    if (useWarm.getState().warming || useCurtain.getState().hold || useRoom.getState().room) return
    // Once controle.py drives the projector (gl1/projector.ts): a jam holds the frame, and the
    // projection rate changes the film: 12 fps is half speed, and each frame shows for 1/12 s.
    const pr = useProjector.getState()
    if (pr.jammed) return
    const fps = pr.armed ? pr.fps : 24
    // A seek (the player, a chapter) moved the film: start counting from there.
    if (Math.abs(raw - s.time) > 1.5 / 24) raw = s.time
    let t = s.time
    if (s.mode === 'watch') {
      if (s.playing) {
        raw = Math.min(TOTAL, raw + dt * (fps / 24))
        t = fps === 24 ? raw : Math.floor(raw * 24) / 24
      }
    } else {
      t += (s.target - t) * (1 - Math.exp(-dt * 5))
      if (Math.abs(s.target - t) < 1e-3) t = s.target
      raw = t
    }
    if (t !== s.time) useFilm.setState({ time: t })
    ;(window as unknown as { __filmTime?: number }).__filmTime = t
    if (s.playing && t >= TOTAL) useFilm.setState({ playing: false })
  })
  return null
}

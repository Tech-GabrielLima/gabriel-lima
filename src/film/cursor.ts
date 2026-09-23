import { Vector2 } from 'three'

// The cursor is the film's light source (ROTEIRO §3). Scenes never read the raw
// pointer: they read `pos`, a critically-damped follower, so nothing ever
// tracks the mouse rigidly, and `speed`, which dust, rain and water react to.

export const cursor = {
  /** Raw pointer in NDC (-1..1, y up). */
  target: new Vector2(0, 0),
  /** Smoothed position in NDC. */
  pos: new Vector2(0, 0),
  /** Smoothed speed in NDC units per second. */
  speed: 0,
  /** Whether someone is holding the light (else scenes auto-wander). */
  active: false,
  /** A finger is on the picture right now. */
  touching: false,
}

const prev = new Vector2()
/** On touch screens, how long the light stays where the finger left it before wandering again. */
const TOUCH_HOLD = 3.5
let lastTouch = -Infinity

export function bindCursor() {
  const set = (e: PointerEvent) => cursor.target.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1)
  const onMove = (e: PointerEvent) => {
    // A finger only steers the light while it's on the picture (not on the player or a card).
    if (e.pointerType !== 'mouse' && !cursor.touching) return
    set(e)
    cursor.active = true
  }
  const onDown = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' || (e.target as HTMLElement).tagName !== 'CANVAS') return
    cursor.touching = true
    set(e)
    // Jump straight there: a tap should light what was tapped, not glide towards it.
    cursor.pos.copy(cursor.target)
    cursor.active = true
  }
  const onUp = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') return
    cursor.touching = false
    lastTouch = performance.now() / 1000
  }
  addEventListener('pointermove', onMove, { passive: true })
  addEventListener('pointerdown', onDown, { passive: true })
  addEventListener('pointerup', onUp, { passive: true })
  addEventListener('pointercancel', onUp, { passive: true })
  return () => {
    removeEventListener('pointermove', onMove)
    removeEventListener('pointerdown', onDown)
    removeEventListener('pointerup', onUp)
    removeEventListener('pointercancel', onUp)
  }
}

export function updateCursor(dt: number, elapsed: number) {
  // After a touch, the light rests where it was left, then goes back to searching on its own.
  if (cursor.active && !cursor.touching && lastTouch > 0 && performance.now() / 1000 - lastTouch > TOUCH_HOLD) {
    cursor.active = false
    lastTouch = -Infinity
  }
  if (!cursor.active) {
    // Nobody is holding the light yet: let it drift like a searching beam.
    cursor.target.set(Math.sin(elapsed * 0.37) * 0.45, Math.sin(elapsed * 0.23 + 1) * 0.25)
  }
  prev.copy(cursor.pos)
  // The auto-wander glides slowly; a hand is followed quickly.
  cursor.pos.lerp(cursor.target, 1 - Math.exp(-dt * (cursor.active ? 7 : 1.5)))
  const v = prev.distanceTo(cursor.pos) / Math.max(dt, 1e-4)
  cursor.speed += (v - cursor.speed) * (1 - Math.exp(-dt * 5))
}

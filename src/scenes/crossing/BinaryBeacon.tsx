import { useFrame, useThree } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { Vector3, type Mesh, type MeshStandardMaterial } from 'three'
import { findFrame, useProgress } from '../../cinema/progress'
import { useCaption } from '../../film/caption'
import { cursor } from '../../film/cursor'
import { useFilm } from '../../film/store'

// Frame 32: a fourth lighthouse, out of step with the three in consensus. It
// blinks the visitor's ticket number in binary: a long flash to start, then
// each bit, long for 1 and short for 0. Hold your light on it and it reads out.

const START = 1.4
const ONE = 0.62
const ZERO = 0.16
const GAP = 0.34
const PAUSE = 2.2
const DEBUG = new URLSearchParams(location.search).has('debug')

/** The blink pattern as [on, off] seconds, for a number. */
function pattern(n: number): [number, number][] {
  const bits = n.toString(2)
  return [[START, 0.6] as [number, number], ...[...bits].map((b) => [b === '1' ? ONE : ZERO, GAP] as [number, number]), [0, PAUSE]]
}

export function BinaryBeacon({ position }: { position: Vector3 }) {
  const camera = useThree((s) => s.camera)
  const lamp = useRef<Mesh>(null!)
  const held = useRef(0)
  const done = useRef(false)
  const ticket = useProgress((s) => s.ticket?.n ?? null)
  // Offline there's no number: the arrival time (hhmm) stands in for it.
  const n = useMemo(() => ticket ?? Number(new Date().toTimeString().slice(0, 5).replace(':', '')), [ticket])
  const seq = useMemo(() => pattern(n), [n])
  const total = useMemo(() => seq.reduce((a, [on, off]) => a + on + off, 0), [seq])
  const p = useMemo(() => new Vector3(), [])
  useFrame((state, delta) => {
    let t = state.clock.elapsedTime % total
    let on = false
    for (const [a, b] of seq) {
      if (t < a) {
        on = true
        break
      }
      t -= a
      if (t < b) break
      t -= b
    }
    ;(lamp.current.material as MeshStandardMaterial).emissiveIntensity = on ? 16 : 0.25
    if (done.current) return
    // Is the visitor's light on it? The cursor, against the lighthouse on screen.
    p.copy(position).project(camera)
    if (DEBUG) (window as unknown as { __beacon?: number[] }).__beacon = [p.x, p.y, p.z]
    const near = p.z < 1 && Math.hypot(p.x - cursor.pos.x, p.y - cursor.pos.y) < 0.09
    held.current = near ? held.current + delta : 0
    if (held.current > 3) {
      done.current = true
      const pt = useFilm.getState().lang === 'pt'
      const bits = n.toString(2)
      useCaption.setState({
        caption: {
          kicker: pt ? 'O farol fora do ritmo' : 'The lighthouse out of step',
          title: bits.replace(/(.{4})(?=.)/g, '$1 '),
          hook: ticket ? `#${n} · ${pt ? 'é você' : "that's you"}` : pt ? `${n} · a hora em que você chegou` : `${n} · the time you arrived`,
          body: pt ? 'Um lampejo longo para começar; depois cada bit: longo é 1, curto é 0.' : 'A long flash to start; then each bit: long is 1, short is 0.',
          accent: '#fff2d0',
        },
        close: null,
      })
      findFrame('beacon')
    }
  })
  return (
    <group position={position}>
      <mesh ref={lamp}>
        <sphereGeometry args={[0.8, 12, 12]} />
        <meshStandardMaterial color="#000" emissive="#ffd9a0" emissiveIntensity={0.25} toneMapped={false} fog={false} />
      </mesh>
      <mesh position={[0, -3.6, 0]}>
        <cylinderGeometry args={[0.5, 1, 7, 10]} />
        <meshStandardMaterial color="#0c1018" />
      </mesh>
    </group>
  )
}

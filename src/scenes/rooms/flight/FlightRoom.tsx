import { Billboard, Environment, Line, Text } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { CatmullRomCurve3, Color, InstancedMesh, MathUtils, Mesh, MeshBasicMaterial, Object3D, PointLight, TubeGeometry } from 'three'
import { sfx } from '../../../film/audio'
import { useFilm } from '../../../film/store'
import { FONT_MONO, FONT_SERIF } from '../../shared'
import { RoomCamera, preloadPbr, since, useEntry, usePbr, v3, type Shot } from '../shared'
import { EVENTS, FIX, FRAMES, WHY, useFlightRoom } from './state'

// SALA · FLIGHT (ROTEIRO §0.3). Through the FLIGHT door: an investigation
// hangar at night. On the table under the lamp, the black box flight left on
// a program that died. Over it turns its ring of events, the last moments by
// logical time. The visitor replays the crash (the README's own example: a
// ZeroDivisionError in compute_average); the frames it recorded stand up over
// the box, crash first, with the object graph behind them, where `numbers`
// and `data` turn out to be the same empty list. Ask `why` and the chain of
// where that value came from lights up, link by link, down to its root. Apply
// the fix and flight replays the recording against it until it can say
// FIX VERIFIED.

preloadPbr('concrete_floor_worn_001', 'rusty_painted_metal')

const ORANGE = new Color('#ff8a3d')
const RED = new Color('#ff3a2a')
const GREEN = new Color('#7dffa8')
const RING_N = 48
const RING_R = 4.6
const RING_Y = 5.9
const RING_Z = -7
/** The ring stands behind the table like a clock face; the recorded events run up to the crash, just short of twelve. */
const SLOT = (i: number) => (RING_N - EVENTS.length + i) % RING_N
const ringAngle = (k: number) => (k / RING_N) * Math.PI * 2
const slotPos = (k: number, r = RING_R) => {
  const a = ringAngle(k)
  return v3(Math.sin(a) * r, RING_Y + Math.cos(a) * r, RING_Z)
}

const SHOTS: Shot[] = [
  [v3(0, 5.6, 18), v3(0, 5.4, -2)],
  [v3(-5, 4.2, 7.5), v3(-2.8, 4.2, 0)],
  [v3(0, 22, 4), v3(0, 0, -1)],
  [v3(8, 5, 8), v3(3.6, 4.6, -1.8)],
]

/** The object graph behind the frames: the three names, the empty list they share, the dict it came from. */
const NODES = {
  numbers: v3(1.4, 5.6, -1.6),
  data: v3(1.4, 3.9, -1.6),
  list: v3(3.8, 4.7, -2.2),
  evening: v3(6.2, 5.6, -1.6),
  datasets: v3(6.2, 3.9, -1.6),
}
type Node = keyof typeof NODES
/** The `why` chain, as edges lit one after another. */
const CHAIN: [Node, Node][] = [
  ['numbers', 'list'],
  ['data', 'list'],
  ['evening', 'list'],
  ['datasets', 'evening'],
]

export default function FlightRoom() {
  const lang = useFilm((s) => s.lang)
  const pt = lang === 'pt'
  const step = useFlightRoom((s) => s.step)
  const why = useFlightRoom((s) => s.why)
  const entry = useEntry()
  const floor = usePbr('concrete_floor_worn_001', 12)
  const metal = usePbr('rusty_painted_metal', 1)

  const ring = useRef<InstancedMesh>(null!)
  const cursor = useRef<Mesh>(null!)
  const alarm = useRef<PointLight>(null!)
  const lamp = useRef<PointLight>(null!)
  const boxGlow = useRef<MeshBasicMaterial>(null!)
  const o = useMemo(() => new Object3D(), [])
  const c = useMemo(() => new Color(), [])
  const st = useRef({ last: 'idle', reached: -1, whyShown: -1, fixShown: -1 })

  // The hangar's roof: arched trusses along its length.
  const trusses = useMemo(() => {
    const out: TubeGeometry[] = []
    for (let k = 0; k < 7; k++) {
      const z = -18 + k * 6
      const pts = Array.from({ length: 13 }, (_, i) => {
        const a = Math.PI * (i / 12)
        return v3(-Math.cos(a) * 16, 2 + Math.sin(a) * 12, z)
      })
      out.push(new TubeGeometry(new CatmullRomCurve3(pts), 48, 0.18, 6))
    }
    return out
  }, [])

  useFrame(() => {
    const now = performance.now() / 1000
    const s = st.current
    const room = useFlightRoom.getState()
    const t = since(entry)
    const el = now - room.at

    // The replay: the cursor runs through the recorded events one every 0.45 s; the last one is the crash.
    let reached = EVENTS.length - 1
    if (room.step === 'replay' || room.step === 'fix') reached = Math.min(EVENTS.length - 1, Math.floor(el / 0.45))
    if (room.step === 'idle') reached = EVENTS.length - 1
    if (reached !== s.reached && (room.step === 'replay' || room.step === 'fix')) {
      s.reached = reached
      const e = EVENTS[reached]
      const crash = e.kind === 'RAISE'
      if (crash && room.step === 'replay') {
        sfx('zap', undefined, 0.9)
        useFlightRoom.setState({ step: 'crashed', at: now })
      } else if (crash && room.step === 'fix') {
        sfx('bell', undefined, 0.8)
        useFlightRoom.setState({ step: 'verified', at: now })
      } else sfx('click', undefined, 0.25)
    }
    const fixed = room.step === 'fix' || room.step === 'verified'
    for (let k = 0; k < RING_N; k++) {
      const ei = EVENTS.findIndex((_, i) => SLOT(i) === k)
      const p = slotPos(k)
      const a = ringAngle(k)
      o.position.copy(p)
      o.rotation.set(0, 0, -a)
      const recorded = ei >= 0 && (room.step === 'idle' || room.step === 'crashed' || room.step === 'why' || room.step === 'verified' || ei <= reached)
      o.scale.set(0.55, ei >= 0 ? 0.9 : 0.35, 0.18)
      o.updateMatrix()
      ring.current.setMatrixAt(k, o.matrix)
      const raise = ei >= 0 && EVENTS[ei].kind === 'RAISE'
      if (ei < 0) c.set('#2a2622')
      else if (!recorded) c.set('#3a2a1c')
      else if (raise) c.copy(fixed ? GREEN : RED).multiplyScalar(2 + Math.sin(now * 8) * 0.6)
      else c.copy(fixed ? GREEN : ORANGE).multiplyScalar(1.4)
      ring.current.setColorAt(k, c)
    }
    ring.current.instanceMatrix.needsUpdate = true
    ring.current.instanceColor!.needsUpdate = true
    const cur = slotPos(SLOT(Math.max(0, reached)), RING_R - 0.9)
    cursor.current.position.copy(cur)
    cursor.current.rotation.set(0, 0, Math.PI - ringAngle(SLOT(Math.max(0, reached))))

    // The alarm after the crash; the lamp over the table; the black box's own status light.
    const crashed = room.step === 'crashed' || room.step === 'why'
    alarm.current.intensity = crashed ? (Math.sin(now * 6) > 0 ? 70 : 8) * Math.max(0.3, 1 - el / 6) : 0
    lamp.current.intensity = 160 * MathUtils.smoothstep(t, 0.2, 1.6)
    boxGlow.current.color.copy(fixed ? GREEN : crashed ? RED : ORANGE).multiplyScalar(Math.sin(now * 3) > 0 ? 3 : 0.4)

    // `why`: one line every 1.1 s.
    if (room.step === 'why') {
      const w = Math.min(WHY.length - 1, Math.floor(el / 1.1))
      if (w !== room.why) {
        useFlightRoom.setState({ why: w })
        sfx('click', undefined, 0.4)
      }
    }
  })

  const show = step !== 'idle' && step !== 'replay'
  const showFix = step === 'verified'
  const litEdge = (i: number) => step === 'why' && why >= i + 1
  const nodeLabel: Record<Node, string> = { numbers: 'numbers', data: 'data', list: 'list[0]  []', evening: "datasets['evening']", datasets: 'datasets = dict[3]' }

  return (
    <>
      <Environment files="/hdri/kloppenheim_02_puresky.hdr" environmentIntensity={0.06} />
      <color attach="background" args={['#050608']} />
      <fog attach="fog" args={['#050608', 18, 60]} />
      <hemisphereLight args={['#6c7894', '#0d0b09', 0.14]} />
      <pointLight ref={lamp} position={[0, 9, 0]} intensity={0} distance={26} decay={1.5} color="#ffe4c0" />
      <pointLight ref={alarm} position={[0, 12, -8]} intensity={0} distance={40} decay={1.2} color="#ff3a2a" />

      <RoomCamera shots={SHOTS} fov={46} minDistance={3} maxDistance={40} />

      {/* The hangar: concrete floor, arched trusses, the doors ajar at the back onto the night. */}
      <mesh rotation-x={-Math.PI / 2}>
        <planeGeometry args={[40, 44]} />
        <meshStandardMaterial {...floor} color="#6f6c66" roughness={0.85} />
      </mesh>
      {trusses.map((g, i) => (
        <mesh key={i} geometry={g}>
          <meshStandardMaterial {...metal} color="#4a4c50" metalness={0.7} roughness={0.5} />
        </mesh>
      ))}
      {[-1, 1].map((sx) => (
        <mesh key={sx} position={[sx * 9, 7, -20]}>
          <boxGeometry args={[14, 14, 0.3]} />
          <meshStandardMaterial {...metal} color="#2b2d31" metalness={0.6} roughness={0.6} />
        </mesh>
      ))}
      {/* Evidence tape round the table. */}
      {Array.from({ length: 4 }, (_, i) => {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4
        return (
          <mesh key={i} position={[Math.cos(a) * 4, 0.55, Math.sin(a) * 4]}>
            <cylinderGeometry args={[0.05, 0.08, 1.1, 8]} />
            <meshStandardMaterial color="#ffcf3a" />
          </mesh>
        )
      })}
      {Array.from({ length: 4 }, (_, i) => {
        const a1 = (i / 4) * Math.PI * 2 + Math.PI / 4
        const a2 = ((i + 1) / 4) * Math.PI * 2 + Math.PI / 4
        return <Line key={i} points={[[Math.cos(a1) * 4, 0.95, Math.sin(a1) * 4], [Math.cos(a2) * 4, 0.95, Math.sin(a2) * 4]]} color="#ffcf3a" lineWidth={4} />
      })}

      {/* The table, and the black box on it. */}
      <mesh position={[0, 0.9, 0]}>
        <boxGeometry args={[3.2, 0.12, 1.8]} />
        <meshStandardMaterial color="#26272b" metalness={0.6} roughness={0.4} />
      </mesh>
      {[-1.4, 1.4].map((x) =>
        [-0.75, 0.75].map((z) => (
          <mesh key={`${x}${z}`} position={[x, 0.42, z]}>
            <cylinderGeometry args={[0.05, 0.05, 0.85, 6]} />
            <meshStandardMaterial color="#333" metalness={0.8} />
          </mesh>
        )),
      )}
      <group position={[0, 1.34, 0]} rotation-y={-0.3}>
        <mesh>
          <boxGeometry args={[1.3, 0.75, 0.8]} />
          <meshStandardMaterial color="#ff6a14" roughness={0.55} metalness={0.2} />
        </mesh>
        {[-0.25, 0.25].map((y) => (
          <mesh key={y} position={[0, y, 0.401]}>
            <planeGeometry args={[1.3, 0.06]} />
            <meshStandardMaterial color="#f2efe8" />
          </mesh>
        ))}
        <Text font={FONT_MONO} fontSize={0.075} letterSpacing={0.15} position={[0, 0.04, 0.405]} anchorX="center" color="#161616">
          {'FLIGHT RECORDER · DO NOT OPEN'}
        </Text>
        <mesh position={[0.52, 0.28, 0.405]}>
          <circleGeometry args={[0.035, 12]} />
          <meshBasicMaterial ref={boxGlow} toneMapped={false} />
        </mesh>
        <mesh position={[-0.8, -0.3, 0]} rotation-z={Math.PI / 2}>
          <cylinderGeometry args={[0.03, 0.03, 0.5, 6]} />
          <meshStandardMaterial color="#111" />
        </mesh>
      </group>

      {/* The ring of events, turning over the box; the cursor is the logical clock. */}
      <instancedMesh ref={ring} args={[undefined, undefined, RING_N]} frustumCulled={false}>
        <boxGeometry />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <mesh ref={cursor}>
        <coneGeometry args={[0.18, 0.45, 12]} />
        <meshBasicMaterial color={new Color('#ffffff').multiplyScalar(2)} toneMapped={false} />
      </mesh>
      {EVENTS.map((e, i) => {
        const p = slotPos(SLOT(i), RING_R + (i % 2 ? 1.5 : 0.95))
        return (
          <Billboard key={i} position={p}>
            <Text font={FONT_MONO} fontSize={0.2} anchorX="center" anchorY="middle" textAlign="center">
              {/* With the fix, the crash's RAISE never happens: compute_average returns. */}
              {e.kind === 'RAISE' && (showFix || step === 'fix') ? 'RETURN\ncompute_average' : `${e.kind}${e.label ? `\n${e.label}` : ''}`}
              <meshBasicMaterial color={e.kind === 'RAISE' ? (showFix || step === 'fix' ? '#7dffa8' : '#ff6a5a') : '#e8c8a8'} toneMapped={false} />
            </Text>
          </Billboard>
        )
      })}
      <Billboard position={[0, RING_Y, RING_Z]}>
        <Text font={FONT_MONO} fontSize={0.26} letterSpacing={0.18} anchorX="center" color="#8a8276">
          {pt ? 'ANEL DE EVENTOS · TEMPO LÓGICO · ~65 ns POR EVENTO' : 'EVENT RING · LOGICAL TIME · ~65 ns PER EVENT'}
        </Text>
      </Billboard>

      {/* The frames flight recorded, crash first, standing up over the box. */}
      {FRAMES.map((f, i) => (
        <group key={f.n} position={[-2.8, 2.6 + i * 1.3, 0.4 - i * 0.4]} visible={show}>
          <mesh>
            <planeGeometry args={[4.6, 1.05]} />
            <meshBasicMaterial color={i === 0 ? '#2a0e0a' : '#141418'} transparent opacity={0.82} />
          </mesh>
          <Text font={FONT_MONO} fontSize={0.17} position={[-2.15, 0.28, 0.01]} anchorX="left" anchorY="middle">
            {`${f.n} ${f.fn}${f.at ? `  (${f.at})` : ''}`}
            <meshBasicMaterial color={i === 0 ? '#ff8a6a' : '#efe6d8'} toneMapped={false} />
          </Text>
          <Text font={FONT_MONO} fontSize={0.17} position={[-1.9, -0.12, 0.01]} anchorX="left" anchorY="middle">
            {f.local}
            <meshBasicMaterial color="#ffd36b" toneMapped={false} />
          </Text>
          <Text font={FONT_MONO} fontSize={0.13} position={[2.15, -0.34, 0.01]} anchorX="right" anchorY="middle">
            {`# ${f.note[lang]}`}
            <meshBasicMaterial color="#8a8276" toneMapped={false} />
          </Text>
        </group>
      ))}
      {show && (
        <Billboard position={[-2.8, 6.8, 0]}>
          <Text font={FONT_MONO} fontSize={0.26} anchorX="center">
            {showFix ? (pt ? 'reexecutado com a correção' : 'replayed with the fix') : 'ZeroDivisionError: division by zero'}
            <meshBasicMaterial color={showFix ? '#7dffa8' : '#ff6a5a'} toneMapped={false} />
          </Text>
        </Billboard>
      )}

      {/* The object graph behind them: two names, one list (↔), and where it came from. */}
      <group visible={show}>
        {(Object.keys(NODES) as Node[]).map((k) => (
          <group key={k} position={NODES[k]}>
            <mesh>
              <sphereGeometry args={[k === 'list' ? 0.34 : 0.2, 20, 14]} />
              <meshBasicMaterial color={new Color(k === 'list' ? '#ff6a5a' : '#ffd36b').multiplyScalar(1.6)} toneMapped={false} />
            </mesh>
            <Billboard position={[0, k === 'list' ? 0.6 : 0.42, 0]}>
              <Text font={FONT_MONO} fontSize={0.2} anchorX="center">
                {nodeLabel[k]}
                <meshBasicMaterial color="#efe6d8" toneMapped={false} />
              </Text>
            </Billboard>
          </group>
        ))}
        {CHAIN.map(([a, b], i) => (
          <Line key={i} points={[NODES[a], NODES[b]]} color={litEdge(i) ? '#ffffff' : i < 2 ? '#ff8a6a' : '#8a7a6a'} lineWidth={litEdge(i) ? 4 : 2} dashed={i >= 2 && !litEdge(i)} dashSize={0.15} gapSize={0.1} />
        ))}
      </group>

      {/* What the black box prints: the `why` chain, then the fix's verdict. */}
      {(step === 'why' || showFix) && (
        <Billboard position={[3.9, 8.9, -1.4]}>
          {(step === 'why' ? WHY.slice(0, why + 1) : FIX).map((l, i) => (
            <Text key={i} font={FONT_MONO} fontSize={0.19} position={[0, -i * 0.34, 0]} anchorX="center">
              {l}
              <meshBasicMaterial color={step === 'why' ? (i === 0 ? '#ffd36b' : l.startsWith('⇒') ? '#ffffff' : '#e8c8a8') : l.startsWith('⇒') ? new Color('#7dffa8').multiplyScalar(2) : '#b8f0c8'} toneMapped={false} />
            </Text>
          ))}
        </Billboard>
      )}
      {step === 'idle' && (
        <Billboard position={[0, 4.2, 0]}>
          <Text font={FONT_SERIF} fontSize={0.5} anchorX="center">
            crash.flight
            <meshBasicMaterial color="#efe6d8" toneMapped={false} />
          </Text>
        </Billboard>
      )}
    </>
  )
}

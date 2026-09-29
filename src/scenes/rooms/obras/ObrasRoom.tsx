import { Billboard, Environment, Text } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { AdditiveBlending, Color, DoubleSide, Group, InstancedMesh, MathUtils, Matrix4, Mesh, MeshBasicMaterial, Object3D, Quaternion, Vector3, type MeshStandardMaterialParameters } from 'three'
import { panFor, sfx } from '../../../film/audio'
import { useFilm } from '../../../film/store'
import { FONT_MARKER, FONT_MONO, FONT_SERIF } from '../../shared'
import { RoomCamera, preloadPbr, since, useClickGuard, useEntry, usePbr, v3, type Shot } from '../shared'
import { FLOORS, PER_REPO, REPOS, useObrasRoom } from './state'
import { findFrame } from '../../../cinema/progress'

// SALA · EM OBRAS (ROTEIRO §0.3). The last door: the next session, being
// filmed. A building site at night that is also a film set: a tower crane
// over a concrete frame going up, three floor groups signed with the research
// repositories in progress (front-end, node, android), scaffolding, work
// lights, a camera on a dolly track and a clapperboard. Each "Ação!" is a
// take: the clapper snaps, the crane lowers its hook to the stack of precast
// slabs, lifts one, slews over the building and sets the next floor on it.

preloadPbr('concrete_floor_worn_001', 'concrete_wall_004', 'rusty_painted_metal')

const MAST = v3(-17, 0, -12)
const H = 36
const JIB = 44
const BLD = v3(6, 0, -8)
const BW = 18
const BD = 12
const FLOOR = 3.6
const STACK = v3(-5, 0, 12)
const PARK_Y = 20
const YELLOW = '#d9a300'

const SHOTS: Shot[] = [
  [v3(50, 26, 74), v3(-5, 21, -6)],
  [v3(-52, 24, 36), v3(-6, 24, -10)],
  [v3(40, 72, 34), v3(0, 10, -6)],
  [v3(0.4, 2.6, 27), v3(5, 13, -8)],
]

/** A strut from a to b, as the matrix of a unit box. */
const up = new Vector3(0, 1, 0)
function strut(a: Vector3, b: Vector3, t: number) {
  const d = new Vector3().subVectors(b, a)
  const q = new Quaternion().setFromUnitVectors(up, d.clone().normalize())
  return new Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new Vector3(t, d.length(), t))
}
/** A square lattice mast along +y. */
function mast(len: number, w: number, step: number, t: number) {
  const out: Matrix4[] = []
  const c = [v3(-w / 2, 0, -w / 2), v3(w / 2, 0, -w / 2), v3(w / 2, 0, w / 2), v3(-w / 2, 0, w / 2)]
  for (const p of c) out.push(strut(p, p.clone().setY(len), t * 1.6))
  for (let y = 0; y < len - 0.01; y += step) {
    for (let i = 0; i < 4; i++) {
      const a = c[i].clone().setY(y)
      const b = c[(i + 1) % 4].clone().setY(y)
      out.push(strut(a, b, t))
      out.push(strut(a, b.clone().setY(y + step), t))
    }
  }
  return out
}
/** A triangular lattice jib along +x (two bottom chords, one top). */
function jib(len: number, w: number, step: number, t: number) {
  const out: Matrix4[] = []
  const bl = (x: number) => v3(x, 0, -w / 2)
  const br = (x: number) => v3(x, 0, w / 2)
  const tp = (x: number) => v3(x, w * 0.85, 0)
  out.push(strut(bl(0), bl(len), t * 1.5), strut(br(0), br(len), t * 1.5), strut(tp(0), tp(len - step), t * 1.5))
  for (let x = 0; x < len - 0.01; x += step) {
    out.push(strut(bl(x), br(x), t), strut(bl(x), tp(x + step / 2), t), strut(br(x), tp(x + step / 2), t))
    if (x + step < len) out.push(strut(tp(x + step / 2), bl(x + step), t), strut(tp(x + step / 2), br(x + step), t))
  }
  return out
}

function Lattice({ mats, material }: { mats: Matrix4[]; material: MeshStandardMaterialParameters }) {
  const ref = useRef<InstancedMesh>(null!)
  useLayoutEffect(() => {
    mats.forEach((m, i) => ref.current.setMatrixAt(i, m))
    ref.current.instanceMatrix.needsUpdate = true
    ref.current.computeBoundingSphere()
  }, [mats])
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, mats.length]} castShadow>
      <boxGeometry />
      <meshStandardMaterial {...material} />
    </instancedMesh>
  )
}

/** Slew angle (about +y, so the jib's +x points at p) and trolley radius, from the mast. */
const aim = (p: Vector3) => ({ a: Math.atan2(-(p.z - MAST.z), p.x - MAST.x), r: Math.hypot(p.x - MAST.x, p.z - MAST.z) })
const AT_STACK = aim(STACK)
const AT_BLD = aim(BLD)
const shortest = (a: number, b: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a))

/** The take's phases and how long each lasts (seconds). */
const PHASES = [
  ['down', 2],
  ['hook', 0.5],
  ['lift', 2.4],
  ['slew', 3.4],
  ['lower', 2],
  ['set', 0.7],
  ['back', 3.2],
] as const

export default function ObrasRoom() {
  const camera = useThree((s) => s.camera)
  const lang = useFilm((s) => s.lang)
  const pt = lang === 'pt'
  const entry = useEntry()
  const guard = useClickGuard()
  const built = useObrasRoom((s) => s.built)
  const takes = useObrasRoom((s) => s.takes)

  const ground = usePbr('concrete_floor_worn_001', 24)
  const concrete = usePbr('concrete_wall_004', 3, 2)
  const metal = usePbr('rusty_painted_metal', 1)
  const crane = useMemo(() => ({ normalMap: metal.normalMap, roughnessMap: metal.roughnessMap, color: YELLOW, metalness: 0.35, roughness: 0.6 }), [metal])

  const mastMats = useMemo(() => mast(H, 2.2, 2.2, 0.12), [])
  const jibMats = useMemo(() => jib(JIB, 1.8, 2.2, 0.1), [])
  const counterMats = useMemo(() => jib(14, 1.8, 2.2, 0.1).map((m) => new Matrix4().makeRotationY(Math.PI).multiply(m)), [])

  const slew = useRef<Group>(null!)
  const trolley = useRef<Group>(null!)
  const cable = useRef<Mesh>(null!)
  const hook = useRef<Group>(null!)
  const load = useRef<Mesh>(null!)
  const clapArm = useRef<Group>(null!)
  const dolly = useRef<Group>(null!)
  const newCols = useRef<Group>(null!)
  const flash = useRef<Mesh>(null!)
  const hazards = useRef<(MeshBasicMaterial | null)[]>([])
  const sparks = useRef<InstancedMesh>(null!)
  const sparkData = useMemo(() => Array.from({ length: 80 }, () => ({ p: new Vector3(0, -99, 0), v: new Vector3(), life: 0 })), [])

  const st = useRef({ cut: 0, drop: -99, take: 0, phase: -1, at: 0, a: AT_STACK.a, r: AT_STACK.r, y: PARK_Y, from: { a: 0, r: 0, y: 0 }, clap: -99, flash: 0, nextWeld: 3 })
  const o = useMemo(() => new Object3D(), [])
  // Where the two film lights point: an object in the scene, so the spots follow it.
  const spotTargets = useMemo(() => [v3(BLD.x + 4, 9, BLD.z), v3(BLD.x - 4, 9, BLD.z)].map((p) => {
    const t = new Object3D()
    t.position.copy(p)
    return t
  }), [])
  const hot = useMemo(() => new Color('#ffcf7a').multiplyScalar(3), [])
  const done = built >= FLOORS

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05)
    const now = performance.now() / 1000
    const s = st.current
    const t = since(entry)
    const top = useObrasRoom.getState().built * FLOOR

    // A new take asked for: the clapper snaps, and the crane starts its cycle.
    const want = useObrasRoom.getState().takes
    if (want > s.take && s.phase < 0 && useObrasRoom.getState().built < FLOORS) {
      s.take = want
      s.phase = 0
      s.at = now
      s.from = { a: s.a, r: s.r, y: s.y }
      s.clap = now
      sfx('click', panFor(v3(3, 1.6, 20), camera), 1)
      useObrasRoom.setState({ busy: true })
    }
    // "Corta!" mid-take (frame 30): the hook drops with the slab, and the take is scrapped.
    const cut = useObrasRoom.getState().cut
    if (cut > s.cut) {
      s.cut = cut
      if (s.phase >= 0 && s.phase < PHASES.length - 1) {
        s.drop = now
        s.flash = 1
        s.phase = PHASES.length - 1
        s.at = now + 0.9
        s.from = { a: s.a, r: s.r, y: 0.9 }
        sfx('thunder', panFor(BLD, camera), 0.6)
        useObrasRoom.setState({ oops: Date.now() })
        findFrame('slate')
      }
    }
    if (now - s.drop < 0.9) {
      // the drop, then a bounce on the ground
      const k = (now - s.drop) / 0.9
      s.y = MathUtils.lerp(s.y, 0.9, Math.min(1, k * 3))
      hook.current.position.set(Math.sin(now * 40) * 0.3 * (1 - k), s.y - H, 0)
    } else if (s.phase >= 0 && now >= s.at) {
      const [name, dur] = PHASES[s.phase]
      const u = MathUtils.smootherstep(Math.min(1, (now - s.at) / dur), 0, 1)
      const f = s.from
      if (name === 'down') s.y = MathUtils.lerp(f.y, 1.6, u)
      if (name === 'lift') s.y = MathUtils.lerp(f.y, top + 7, u)
      if (name === 'slew') {
        s.a = MathUtils.lerp(f.a, shortest(f.a, AT_BLD.a), u)
        s.r = MathUtils.lerp(f.r, AT_BLD.r, u)
      }
      if (name === 'lower') s.y = MathUtils.lerp(f.y, top + FLOOR + 0.6, u)
      if (name === 'back') {
        s.y = MathUtils.lerp(f.y, PARK_Y, u)
        s.a = MathUtils.lerp(f.a, shortest(f.a, AT_STACK.a), u)
        s.r = MathUtils.lerp(f.r, AT_STACK.r, u)
      }
      if (now - s.at >= dur) {
        if (name === 'set') {
          // The floor is on: a flash of the work lights, sparks, the clank of steel.
          const n = useObrasRoom.getState().built + 1
          useObrasRoom.setState({ built: n })
          s.flash = 1
          sfx('shutterDown', panFor(BLD, camera), 0.9)
          for (let k = 0; k < 40; k++) {
            const q = sparkData.find((x) => x.life <= 0)
            if (!q) break
            q.p.set(BLD.x + (Math.random() - 0.5) * BW, n * FLOOR + 0.3, BLD.z + BD / 2)
            q.v.set((Math.random() - 0.5) * 3, Math.random() * 3, 1 + Math.random() * 3)
            q.life = 0.8 + Math.random() * 0.8
          }
        }
        s.phase++
        s.at = now
        s.from = { a: s.a, r: s.r, y: s.y }
        if (s.phase >= PHASES.length) {
          s.phase = -1
          useObrasRoom.setState({ busy: false })
        }
      }
    }
    // Left alone, the hook sways a little; the slab rides on it between 'hook' and 'set'.
    const carrying = (s.phase >= 1 && s.phase <= 5) || now - s.drop < 0.9
    slew.current.rotation.y = s.a
    trolley.current.position.x = s.r
    const sway = Math.sin(now * 0.9) * 0.08
    if (now - s.drop >= 0.9) hook.current.position.set(sway, s.y - H, 0)
    cable.current.scale.y = H - s.y
    cable.current.position.y = -(H - s.y) / 2
    load.current.visible = carrying
    // The new floor's columns rise while the slab is on its way.
    const colsK = s.phase === 3 ? MathUtils.smoothstep((now - s.at) / PHASES[3][1], 0, 1) : s.phase === 4 || s.phase === 5 ? 1 : 0
    newCols.current.visible = colsK > 0
    newCols.current.position.y = top
    newCols.current.scale.y = Math.max(0.001, colsK)

    // The clapper: open, then snapped shut on each take.
    const k = now - s.clap
    clapArm.current.rotation.z = k < 0.6 ? MathUtils.lerp(0.5, 0, MathUtils.smoothstep(k, 0.35, 0.45)) : k < 3 ? 0 : 0.5
    // The camera creeps along its dolly track, like a slow push-in.
    dolly.current.position.x = Math.sin(now * 0.08) * 5

    s.flash = Math.max(0, s.flash - dt * 1.8)
    ;(flash.current.material as MeshBasicMaterial).opacity = s.flash * 0.35
    // Aircraft-warning lamps on the crane blink; the building site's work lamps come on after the curtain.
    const blink = Math.sin(now * 3.2) > 0.2 ? 1 : 0.08
    hazards.current.forEach((m) => m && m.color.set('#ff2a1a').multiplyScalar(blink * 3 * Math.min(1, t)))

    // A welder at work on the top floor now and then.
    if (t > s.nextWeld) {
      s.nextWeld = t + 2 + Math.random() * 4
      const at = v3(BLD.x + (Math.random() - 0.5) * BW * 0.8, top + 0.4, BLD.z + BD / 2)
      for (let k2 = 0; k2 < 18; k2++) {
        const q = sparkData.find((x) => x.life <= 0)
        if (!q) break
        q.p.copy(at)
        q.v.set((Math.random() - 0.5) * 2, Math.random() * 2.5, Math.random() * 2)
        q.life = 0.4 + Math.random() * 0.6
      }
    }
    sparkData.forEach((q, i) => {
      if (q.life > 0) {
        q.life -= dt
        q.v.y -= 9.8 * dt
        q.p.addScaledVector(q.v, dt)
      }
      o.position.copy(q.p)
      o.scale.setScalar(q.life > 0 ? 0.06 : 0)
      o.updateMatrix()
      sparks.current.setMatrixAt(i, o.matrix)
    })
    sparks.current.instanceMatrix.needsUpdate = true
  })

  const act = (e: { stopPropagation(): void; clientX: number; clientY: number }) => {
    e.stopPropagation()
    if (guard.isClick(e)) useObrasRoom.setState((q) => ({ takes: q.takes + 1 }))
  }

  // The frame: a slab per floor built, columns under each, the scaffold up the front.
  const cols = useMemo(() => {
    const out: [number, number][] = []
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) out.push([BLD.x - BW / 2 + 1 + (i * (BW - 2)) / 3, BLD.z - BD / 2 + 1 + (j * (BD - 2)) / 2])
    return out
  }, [])

  return (
    <>
      <Environment files="/hdri/rooftop_night.hdr" background backgroundIntensity={0.06} backgroundBlurriness={0.05} environmentIntensity={0.5} />
      <fog attach="fog" args={['#06070b', 50, 170]} />
      <hemisphereLight args={['#5d6c90', '#120c06', 0.35]} />
      {/* A work lamp on a post by the building, for the frame's own light. */}
      <pointLight position={[BLD.x + BW / 2 + 3, 9, BLD.z + BD / 2 + 4]} intensity={260} distance={40} decay={1.6} color="#ffd9a0" />
      <directionalLight position={[-30, 50, 30]} intensity={0.25} color="#a8b8e0" />
      {/* The film's lights, from the set onto the building. */}
      {spotTargets.map((tg) => (
        <primitive key={tg.uuid} object={tg} />
      ))}
      {[-1, 1].map((sd, si) => (
        <group key={sd} position={[sd * 13, 0, 17]}>
          <spotLight position={[0, 7, 0]} target={spotTargets[si]} angle={0.5} penumbra={0.5} intensity={1100} distance={80} decay={1.5} color={sd < 0 ? '#ffe2b0' : '#bcd4ff'} />
          <mesh position={[0, 3.5, 0]}>
            <cylinderGeometry args={[0.05, 0.05, 7, 6]} />
            <meshStandardMaterial color="#222" metalness={0.6} roughness={0.4} />
          </mesh>
          {[0, 2.1, 4.2].map((a) => (
            <mesh key={a} position={[Math.cos(a) * 0.8, 0.5, Math.sin(a) * 0.8]} rotation={[Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5]}>
              <cylinderGeometry args={[0.03, 0.03, 1.4, 5]} />
              <meshStandardMaterial color="#222" />
            </mesh>
          ))}
          <mesh position={[0, 7, 0]} rotation={[0.35, sd * -0.45, 0]}>
            <boxGeometry args={[1.4, 1.1, 0.6]} />
            <meshStandardMaterial color="#1a1a1c" metalness={0.5} roughness={0.5} />
          </mesh>
          <mesh position={[0, 7, -0.32]} rotation={[0.35, sd * -0.45, 0]}>
            <planeGeometry args={[1.2, 0.9]} />
            <meshBasicMaterial color={new Color(sd < 0 ? '#ffe2b0' : '#bcd4ff').multiplyScalar(1.6)} toneMapped={false} side={DoubleSide} />
          </mesh>
        </group>
      ))}

      <RoomCamera shots={SHOTS} fov={44} minDistance={4} maxDistance={110} />

      {/* The site: worn concrete, and the fence round it. */}
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[200, 200]} />
        <meshStandardMaterial {...ground} color="#8a8680" roughness={1} />
      </mesh>
      {Array.from({ length: 16 }, (_, i) => {
        const a = (i / 16) * Math.PI * 2
        return (
          <mesh key={i} position={[Math.cos(a) * 46, 1.1, Math.sin(a) * 46 - 4]} rotation-y={-a + Math.PI / 2}>
            <boxGeometry args={[17, 2.2, 0.08]} />
            <meshStandardMaterial color={i % 2 ? '#1f4a36' : '#233f33'} roughness={0.9} />
          </mesh>
        )
      })}

      {/* The building going up. Clicking it calls the next take too. */}
      <group onPointerDown={guard.onPointerDown} onClick={act} onPointerOver={() => (document.body.style.cursor = 'pointer')} onPointerOut={() => (document.body.style.cursor = '')}>
        {Array.from({ length: built + 1 }, (_, i) => (
          <mesh key={i} position={[BLD.x, i * FLOOR + 0.2, BLD.z]} castShadow receiveShadow>
            <boxGeometry args={[BW, 0.4, BD]} />
            <meshStandardMaterial {...concrete} color="#b8b2a8" />
          </mesh>
        ))}
        {Array.from({ length: built }, (_, i) =>
          cols.map(([x, z], j) => (
            <mesh key={`${i}-${j}`} position={[x, i * FLOOR + FLOOR / 2 + 0.2, z]} castShadow>
              <boxGeometry args={[0.55, FLOOR - 0.4, 0.55]} />
              <meshStandardMaterial {...concrete} color="#a8a298" />
            </mesh>
          )),
        )}
        {/* Rebar waiting on the top floor for the next columns. */}
        {built < FLOORS &&
          cols.map(([x, z], j) => (
            <mesh key={j} position={[x, built * FLOOR + 1.1, z]}>
              <boxGeometry args={[0.06, 1.8, 0.06]} />
              <meshStandardMaterial color="#6b3d22" metalness={0.6} roughness={0.5} />
            </mesh>
          ))}
        <group ref={newCols}>
          {cols.map(([x, z], j) => (
            <mesh key={j} position={[x, FLOOR / 2 + 0.2, z]}>
              <boxGeometry args={[0.55, FLOOR - 0.4, 0.55]} />
              <meshStandardMaterial {...concrete} color="#a8a298" />
            </mesh>
          ))}
        </group>
      </group>
      <Scaffold floors={built + 1} metal={metal} />
      <mesh ref={flash} position={[BLD.x, built * FLOOR + 2, BLD.z + BD / 2 + 0.1]}>
        <planeGeometry args={[BW + 6, 8]} />
        <meshBasicMaterial color="#fff0c8" transparent opacity={0} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>

      {/* One sign per research repository, on the floors it will take. */}
      {REPOS.map((r, g) => {
        const first = g * PER_REPO
        const have = Math.max(0, Math.min(PER_REPO, built - first))
        const ready = have === PER_REPO
        return (
          <group key={r.id} position={[BLD.x + BW / 2 + 0.3, first * FLOOR + FLOOR * 1.5, BLD.z]} rotation-y={Math.PI / 2} visible={built > first}>
            <mesh>
              <planeGeometry args={[BD - 1, FLOOR * 2.4]} />
              <meshStandardMaterial color={ready ? '#0d0f14' : '#16120a'} roughness={0.7} />
            </mesh>
            <Text font={FONT_MONO} fontSize={1.3} letterSpacing={0.12} position={[0, 1.2, 0.02]} anchorX="center">
              {r.label}
              <meshBasicMaterial color={new Color(ready ? r.color : '#ffcf3a').multiplyScalar(ready ? 2.2 : 1.2)} toneMapped={false} />
            </Text>
            <Text font={FONT_MONO} fontSize={0.55} letterSpacing={0.2} position={[0, -0.3, 0.02]} anchorX="center">
              {ready ? (pt ? 'ESTRUTURA PRONTA · EM PESQUISA' : 'FRAME UP · IN RESEARCH') : `${pt ? 'EM OBRAS' : 'UNDER CONSTRUCTION'} · ${have}/${PER_REPO}`}
              <meshBasicMaterial color="#c9bfae" toneMapped={false} />
            </Text>
            <Text font={FONT_MONO} fontSize={0.42} position={[0, -1.3, 0.02]} anchorX="center" maxWidth={BD - 2} textAlign="center">
              {r.what[lang]}
              <meshBasicMaterial color="#8d8576" toneMapped={false} />
            </Text>
          </group>
        )
      })}

      {/* The tower crane: the mast, and on top the slewing part (jib, counter-jib, cab, trolley, hook). */}
      <group position={MAST}>
        <Lattice mats={mastMats} material={crane} />
        <mesh position={[0, 0.4, 0]}>
          <boxGeometry args={[4.2, 0.8, 4.2]} />
          <meshStandardMaterial {...concrete} color="#777" />
        </mesh>
        <group ref={slew} position={[0, H, 0]}>
          <Lattice mats={jibMats} material={crane} />
          <Lattice mats={counterMats} material={crane} />
          <Lattice mats={useMemo(() => mast(6, 1.4, 1.5, 0.1), [])} material={crane} />
          {/* Ties from the cat-head to the jib and counter-jib. */}
          <Lattice mats={useMemo(() => [strut(v3(0, 6, 0), v3(JIB * 0.7, 1.5, 0), 0.06), strut(v3(0, 6, 0), v3(-13, 1.5, 0), 0.06)], [])} material={{ color: '#333', metalness: 0.8, roughness: 0.3 }} />
          <mesh position={[-12, -0.6, 0]} castShadow>
            <boxGeometry args={[3, 2.4, 2.2]} />
            <meshStandardMaterial {...concrete} color="#8a857c" />
          </mesh>
          <mesh position={[1.8, -1.2, 1.6]}>
            <boxGeometry args={[2, 2, 1.8]} />
            <meshStandardMaterial color={YELLOW} metalness={0.3} roughness={0.5} />
          </mesh>
          <mesh position={[2.81, -1.1, 1.6]}>
            <planeGeometry args={[0.1, 1.2]} />
            <meshBasicMaterial color="#ffd89a" toneMapped={false} />
          </mesh>
          {[v3(0, 6.3, 0), v3(JIB, 0.4, 0), v3(-14, 0.4, 0)].map((p, i) => (
            <mesh key={i} position={p}>
              <sphereGeometry args={[0.28, 10, 8]} />
              <meshBasicMaterial ref={(m) => void (hazards.current[i] = m)} toneMapped={false} />
            </mesh>
          ))}
          <group ref={trolley} position={[AT_STACK.r, -0.3, 0]}>
            <mesh>
              <boxGeometry args={[1.4, 0.5, 1.6]} />
              <meshStandardMaterial color="#2a2a2a" metalness={0.6} roughness={0.4} />
            </mesh>
            <mesh ref={cable}>
              <cylinderGeometry args={[0.03, 0.03, 1, 4]} />
              <meshStandardMaterial color="#111" />
            </mesh>
            <group ref={hook}>
              <mesh position={[0, 0.6, 0]}>
                <boxGeometry args={[0.8, 1, 0.4]} />
                <meshStandardMaterial color="#e8b400" metalness={0.4} roughness={0.5} />
              </mesh>
              <mesh position={[0, -0.1, 0]} rotation-x={Math.PI / 2}>
                <torusGeometry args={[0.3, 0.07, 6, 16, Math.PI * 1.5]} />
                <meshStandardMaterial color="#555" metalness={0.8} roughness={0.3} />
              </mesh>
              {/* The slab on its slings. */}
              <mesh ref={load} position={[0, -1.4, 0]} castShadow>
                <boxGeometry args={[BW * 0.9, 0.4, BD * 0.9]} />
                <meshStandardMaterial {...concrete} color="#bcb6aa" />
              </mesh>
            </group>
          </group>
        </group>
      </group>

      {/* The stack of precast slabs waiting by the crane. */}
      {Array.from({ length: Math.max(1, FLOORS - built) }, (_, i) => (
        <mesh key={i} position={[STACK.x, 0.25 + i * 0.45, STACK.z]} castShadow receiveShadow>
          <boxGeometry args={[BW * 0.9, 0.4, BD * 0.9]} />
          <meshStandardMaterial {...concrete} color="#bcb6aa" />
        </mesh>
      ))}

      {/* The film set in front of it: the dolly track, the camera, the clapperboard. */}
      {[-0.7, 0.7].map((z) => (
        <mesh key={z} position={[0, 0.08, 23 + z]}>
          <boxGeometry args={[16, 0.1, 0.12]} />
          <meshStandardMaterial color="#555" metalness={0.8} roughness={0.35} />
        </mesh>
      ))}
      <group ref={dolly} position={[0, 0, 23]}>
        <mesh position={[0, 0.35, 0]}>
          <boxGeometry args={[1.8, 0.4, 1.8]} />
          <meshStandardMaterial color="#1c1c1e" metalness={0.5} roughness={0.5} />
        </mesh>
        <mesh position={[0, 1.2, 0]}>
          <cylinderGeometry args={[0.08, 0.1, 1.4, 8]} />
          <meshStandardMaterial color="#222" metalness={0.6} />
        </mesh>
        <group position={[0, 2.1, 0]} rotation-y={0.2}>
          <mesh>
            <boxGeometry args={[0.6, 0.6, 1.1]} />
            <meshStandardMaterial color="#111" metalness={0.4} roughness={0.5} />
          </mesh>
          <mesh position={[0, 0, -0.8]} rotation-x={Math.PI / 2}>
            <cylinderGeometry args={[0.2, 0.25, 0.6, 16]} />
            <meshStandardMaterial color="#0a0a0a" metalness={0.7} roughness={0.3} />
          </mesh>
          <mesh position={[0, 0.6, 0.1]} rotation-z={Math.PI / 2}>
            <cylinderGeometry args={[0.35, 0.35, 0.15, 20]} />
            <meshStandardMaterial color="#151515" />
          </mesh>
          <mesh position={[0.16, 0.2, 0.56]}>
            <sphereGeometry args={[0.03, 6, 6]} />
            <meshBasicMaterial color="#ff2020" toneMapped={false} />
          </mesh>
        </group>
      </group>
      <group position={[3.2, 1.9, 19.5]} rotation={[0, -0.4, 0]}>
        <mesh>
          <boxGeometry args={[1.3, 1, 0.05]} />
          <meshStandardMaterial color="#141414" roughness={0.6} />
        </mesh>
        <group ref={clapArm} position={[-0.65, 0.56, 0]}>
          <mesh position={[0.65, 0.06, 0]}>
            <boxGeometry args={[1.3, 0.14, 0.05]} />
            <meshStandardMaterial color="#eeeeee" roughness={0.6} />
          </mesh>
        </group>
        <Text font={FONT_MARKER} fontSize={0.11} position={[0, 0.25, 0.03]} anchorX="center" color="#f2efe8">
          {pt ? 'PRÓXIMA SESSÃO' : 'NEXT SESSION'}
        </Text>
        <Text font={FONT_MARKER} fontSize={0.09} position={[0, 0.02, 0.03]} anchorX="center" color="#f2efe8">
          {`${pt ? 'CENA' : 'SCENE'} 09 · TAKE ${takes + 1}`}
        </Text>
        <Text font={FONT_MARKER} fontSize={0.07} position={[0, -0.22, 0.03]} anchorX="center" color="#cfcac0">
          {'DIR. GABRIEL LIMA'}
        </Text>
      </group>

      <instancedMesh ref={sparks} args={[undefined, undefined, 80]} frustumCulled={false}>
        <sphereGeometry args={[1, 5, 4]} />
        <meshBasicMaterial color={hot} toneMapped={false} />
      </instancedMesh>

      {done && (
        <Billboard position={[BLD.x, FLOORS * FLOOR + 5, BLD.z]}>
          <Text font={FONT_SERIF} fontSize={2.6} anchorX="center">
            {pt ? 'a próxima sessão está sendo filmada' : 'the next session is being filmed'}
            <meshBasicMaterial color={new Color('#ffe14d').multiplyScalar(1.6)} toneMapped={false} />
          </Text>
        </Billboard>
      )}
    </>
  )
}

/** Scaffolding up the front of the building, one lift per floor, with its safety net. */
function Scaffold({ floors, metal }: { floors: number; metal: { normalMap: unknown; roughnessMap: unknown } }) {
  const mats = useMemo(() => {
    const out: Matrix4[] = []
    const z0 = BLD.z + BD / 2 + 1.2
    const hgt = floors * FLOOR
    for (let x = -BW / 2; x <= BW / 2 + 0.01; x += 3) {
      for (const dz of [0, 1.2]) out.push(strut(v3(BLD.x + x, 0, z0 + dz), v3(BLD.x + x, hgt, z0 + dz), 0.07))
    }
    for (let y = 1.8; y <= hgt + 0.01; y += 1.8) {
      for (const dz of [0, 1.2]) out.push(strut(v3(BLD.x - BW / 2, y, z0 + dz), v3(BLD.x + BW / 2, y, z0 + dz), 0.06))
      for (let x = -BW / 2; x < BW / 2 - 0.01; x += 3) out.push(strut(v3(BLD.x + x, y - 1.8, z0 + 1.2), v3(BLD.x + x + 3, y, z0 + 1.2), 0.05))
    }
    return out
  }, [floors])
  void metal
  return (
    <>
      <Lattice key={floors} mats={mats} material={{ color: '#7d8084', metalness: 0.5, roughness: 0.55 }} />
      <mesh position={[BLD.x, (floors * FLOOR) / 2, BLD.z + BD / 2 + 2.5]}>
        <planeGeometry args={[BW + 0.4, floors * FLOOR]} />
        <meshStandardMaterial color="#1f5a3a" transparent opacity={0.12} side={DoubleSide} depthWrite={false} roughness={1} />
      </mesh>
    </>
  )
}

import { Billboard, Text } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { AdditiveBlending, CanvasTexture, Color, DoubleSide, InstancedMesh, MathUtils, Object3D, RepeatWrapping, SRGBColorSpace, Vector3 } from 'three'
import { sfx } from '../../../film/audio'
import { useFilm } from '../../../film/store'
import { FONT_MONO, FONT_SERIF } from '../../shared'
import { RoomCamera, since, useEntry, v3, type Shot } from '../shared'
import { VERSIONS, useCudaRoom } from './state'

// SALA · CUDA (ROTEIRO §0.3). Through the CUDA door: inside a GPU die. Eighty
// streaming multiprocessors in rows on a substrate of gold traces, four HBM
// stacks at the edges, and over the chip the multiplication itself, C = A × B:
// A standing on the left, B at the back, C floating over the SMs, filling in
// tile by tile. The visitor picks one of the repository's five GEMM versions
// and the chip works the way that version does: v1's scattered, uncoalesced
// reads from memory; v2's wide coalesced beams; v3's tiles staged once in each
// SM's shared memory; v4's 8×8 register micro-tiles; v5's Tensor Cores. C
// fills at the speed of the typical share of cuBLAS the README quotes.

const COLS = 10
const ROWS = 8
const PITCH = 3
const N = 24
const CW = 16
const CY = 6.5
const TILE = CW / N
const PACKETS = 320
const HBM = [v3(-19, 0, -6), v3(-19, 0, 6), v3(19, 0, -6), v3(19, 0, 6)]
const SM = Array.from({ length: COLS * ROWS }, (_, i) => v3((i % COLS - (COLS - 1) / 2) * PITCH, 0, (Math.floor(i / COLS) - (ROWS - 1) / 2) * PITCH))
const LIME = new Color('#76ff3e')
const CYAN = new Color('#3ef0e6')
const MAGENTA = new Color('#ff4fd8')

const SHOTS: Shot[] = [
  [v3(0, 24, 46), v3(0, 10, -2)],
  [v3(-9, 3, 9), v3(-3, 1.5, 0)],
  [v3(0, 44, 2), v3(0, 0, 0)],
  [v3(20, 14, 20), v3(0, CY + 3, -2)],
]

/** The substrate: gold traces on dark green, drawn once on a canvas. */
function substrate() {
  const c = document.createElement('canvas')
  c.width = c.height = 1024
  const g = c.getContext('2d')!
  g.fillStyle = '#06110b'
  g.fillRect(0, 0, 1024, 1024)
  g.strokeStyle = 'rgba(214,170,70,0.55)'
  g.lineCap = 'square'
  for (let k = 0; k < 520; k++) {
    g.lineWidth = Math.random() < 0.15 ? 3 : 1
    let x = Math.floor(Math.random() * 64) * 16
    let y = Math.floor(Math.random() * 64) * 16
    g.beginPath()
    g.moveTo(x, y)
    for (let s = 0; s < 4; s++) {
      if (Math.random() < 0.5) x += (Math.random() < 0.5 ? -1 : 1) * 16 * (1 + Math.floor(Math.random() * 6))
      else y += (Math.random() < 0.5 ? -1 : 1) * 16 * (1 + Math.floor(Math.random() * 6))
      g.lineTo(x, y)
    }
    g.stroke()
    g.fillStyle = 'rgba(230,190,90,0.7)'
    g.fillRect(x - 2, y - 2, 4, 4)
  }
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.wrapS = t.wrapT = RepeatWrapping
  t.repeat.set(3, 2)
  t.anisotropy = 8
  return t
}

export default function CudaRoom() {
  const lang = useFilm((s) => s.lang)
  const pt = lang === 'pt'
  const version = useCudaRoom((s) => s.version)
  const entry = useEntry()
  const traces = useMemo(substrate, [])

  const smTops = useRef<InstancedMesh>(null!)
  const shared = useRef<InstancedMesh>(null!)
  const cTiles = useRef<InstancedMesh>(null!)
  const aRows = useRef<InstancedMesh>(null!)
  const bCols = useRef<InstancedMesh>(null!)
  const packets = useRef<InstancedMesh>(null!)
  const o = useMemo(() => new Object3D(), [])
  const c = useMemo(() => new Color(), [])

  const st = useRef({
    run: -1,
    version: -1,
    order: [] as number[],
    done: 0,
    acc: 0,
    doneAt: new Float32Array(N * N).fill(-99),
    smHeat: new Float32Array(COLS * ROWS),
    last: [] as number[],
    pk: Array.from({ length: PACKETS }, () => ({ from: new Vector3(), to: new Vector3(), t: 1, speed: 1, w: 0.05 })),
    spawn: 0,
    finished: false,
  })

  useLayoutEffect(() => {
    // The SMs' own bodies never move.
    for (let i = 0; i < SM.length; i++) {
      o.position.set(SM[i].x, 0.62, SM[i].z)
      o.rotation.set(-Math.PI / 2, 0, 0)
      o.scale.set(1.9, 1.9, 1)
      o.updateMatrix()
      smTops.current.setMatrixAt(i, o.matrix)
    }
    smTops.current.instanceMatrix.needsUpdate = true
  }, [o])

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05)
    const now = performance.now() / 1000
    const s = st.current
    const t = since(entry)
    const { version: vi, run } = useCudaRoom.getState()
    const v = VERSIONS[vi]

    // A new run: C is cleared, and this version's order of work is laid out.
    if (run !== s.run || vi !== s.version || (s.run < 0 && t > 1)) {
      s.run = run
      s.version = vi
      s.done = 0
      s.acc = 0
      s.finished = false
      s.doneAt.fill(-99)
      const idx = Array.from({ length: N * N }, (_, i) => i)
      if (vi === 0) {
        // Naive: tiles come out in no order at all.
        for (let i = idx.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1))
          ;[idx[i], idx[j]] = [idx[j], idx[i]]
        }
      } else {
        // Every other version: blocks of C, each block to one SM, in waves.
        const B = vi >= 3 ? 4 : 2
        idx.sort((a, b) => {
          const ba = Math.floor((a % N) / B) + Math.floor(Math.floor(a / N) / B) * 100
          const bb = Math.floor((b % N) / B) + Math.floor(Math.floor(b / N) / B) * 100
          return ba - bb || a - b
        })
      }
      s.order = idx
      useCudaRoom.setState({ done: 0, tiles: N * N })
      sfx('click', undefined, 0.5)
    }

    // Tiles of C per second, from the version's typical share of cuBLAS.
    const rate = 4 + v.pct * 3
    if (t > 1 && s.done < s.order.length) {
      s.acc += dt * rate
      while (s.acc >= 1 && s.done < s.order.length) {
        s.acc -= 1
        const tile = s.order[s.done++]
        s.doneAt[tile] = now
        s.last.unshift(tile)
        s.smHeat[(tile * 7) % SM.length] = 1
      }
      if (s.last.length > 6) s.last.length = 6
      if (s.done % 24 === 0) useCudaRoom.setState({ done: s.done })
    } else if (s.done >= s.order.length && !s.finished && s.order.length) {
      s.finished = true
      useCudaRoom.setState({ done: s.done })
      sfx('bell', undefined, 0.5)
    }

    // Memory traffic: packets from the HBM stacks to the SMs. Naive: many thin scattered ones, slow;
    // coalesced: fewer, wide; tiled versions: fewer still (each byte fetched once per block).
    const busy = s.done < s.order.length && t > 1
    const perSec = busy ? [260, 70, 30, 18, 14][vi] : 0
    const width = [0.05, 0.26, 0.3, 0.32, 0.34][vi]
    s.spawn += dt * perSec
    while (s.spawn >= 1) {
      s.spawn -= 1
      const p = s.pk.find((q) => q.t >= 1)
      if (!p) break
      const h = HBM[Math.floor(Math.random() * HBM.length)]
      const target = SM[Math.floor(Math.random() * SM.length)]
      p.from.set(h.x, 2 + Math.random() * 2, h.z + (Math.random() - 0.5) * 2)
      p.to.set(target.x + (vi === 0 ? (Math.random() - 0.5) * 2 : 0), 0.9, target.z + (vi === 0 ? (Math.random() - 0.5) * 2 : 0))
      p.t = 0
      p.speed = vi === 0 ? 0.35 + Math.random() * 0.3 : 0.9
      p.w = width
      s.smHeat[SM.indexOf(target)] = Math.max(s.smHeat[SM.indexOf(target)], 0.6)
    }
    s.pk.forEach((p, i) => {
      if (p.t < 1) p.t = Math.min(1, p.t + dt * p.speed)
      const on = p.t < 1
      const u = p.t
      o.position.lerpVectors(p.from, p.to, u)
      o.position.y += Math.sin(u * Math.PI) * 1.5
      const dir = new Vector3().subVectors(p.to, p.from)
      o.rotation.set(0, Math.atan2(dir.x, dir.z), 0)
      o.scale.set(on ? p.w : 0, on ? p.w * 0.6 : 0, on ? 1.4 + p.w * 3 : 0)
      o.updateMatrix()
      packets.current.setMatrixAt(i, o.matrix)
    })
    packets.current.instanceMatrix.needsUpdate = true

    // The SMs' tops glow with work; shared memory (v3+) hovers over them as a cyan slab.
    const tone = vi === 4 ? MAGENTA : vi >= 2 ? CYAN : LIME
    for (let i = 0; i < SM.length; i++) {
      s.smHeat[i] = Math.max(busy ? 0.12 + Math.sin(now * 9 + i) * 0.05 : 0.02, s.smHeat[i] - dt * 2.2)
      smTops.current.setColorAt(i, c.copy(tone).multiplyScalar(0.06 + s.smHeat[i] * (0.9 + v.pct / 60)))
      const on = vi >= 2 && busy
      o.position.set(SM[i].x, 1.35 + Math.sin(now * 3 + i) * 0.03, SM[i].z)
      o.rotation.set(0, 0, 0)
      const k = vi === 4 ? 0.9 + Math.sin(now * 14 + i) * 0.25 : 1
      o.scale.set(on ? 1.5 * k : 0, on ? (vi === 4 ? 1.5 * k : 0.28) : 0, on ? 1.5 * k : 0)
      o.updateMatrix()
      shared.current.setMatrixAt(i, o.matrix)
      shared.current.setColorAt(i, c.copy(tone).multiplyScalar(0.3 + s.smHeat[i] * 1.4))
    }
    smTops.current.instanceColor!.needsUpdate = true
    shared.current.instanceMatrix.needsUpdate = true
    if (shared.current.instanceColor) shared.current.instanceColor.needsUpdate = true

    // C's tiles: dark until computed, a flash, then settled.
    for (let i = 0; i < N * N; i++) {
      const k = now - s.doneAt[i]
      const done = s.doneAt[i] > 0
      o.position.set(-CW / 2 + ((i % N) + 0.5) * TILE, CY, -CW / 2 + (Math.floor(i / N) + 0.5) * TILE)
      o.rotation.set(-Math.PI / 2, 0, 0)
      o.scale.set(TILE * 0.9, TILE * 0.9, 1)
      o.updateMatrix()
      cTiles.current.setMatrixAt(i, o.matrix)
      if (!done) c.set('#0c1a12')
      else c.copy(tone).multiplyScalar(0.35 + Math.max(0, 1 - k * 2) * 2.4)
      cTiles.current.setColorAt(i, c)
    }
    cTiles.current.instanceMatrix.needsUpdate = true
    cTiles.current.instanceColor!.needsUpdate = true

    // A's rows and B's columns that fed the latest tiles light up.
    for (let r = 0; r < N; r++) {
      const hot = s.last.some((tile) => Math.floor(tile / N) === r) && busy
      // A's row i (C's row i, along z), standing up the left side of C.
      o.position.set(-CW / 2 - 1.2, CY + CW / 2, -CW / 2 + (r + 0.5) * TILE)
      o.rotation.set(0, Math.PI / 2, 0)
      o.scale.set(TILE * 0.8, CW, 1)
      o.updateMatrix()
      aRows.current.setMatrixAt(r, o.matrix)
      aRows.current.setColorAt(r, c.set(hot ? '#ffb36b' : '#3a2c1c').multiplyScalar(hot ? 1.8 : 1))
      const hotB = s.last.some((tile) => tile % N === r) && busy
      // B's column j (C's column j, along x), standing up behind C.
      o.position.set(-CW / 2 + (r + 0.5) * TILE, CY + CW / 2, -CW / 2 - 1.2)
      o.rotation.set(0, 0, 0)
      o.scale.set(TILE * 0.8, CW, 1)
      o.updateMatrix()
      bCols.current.setMatrixAt(r, o.matrix)
      bCols.current.setColorAt(r, c.set(hotB ? '#ffb36b' : '#3a2c1c').multiplyScalar(hotB ? 1.8 : 1))
    }
    for (const m of [aRows.current, bCols.current]) {
      m.instanceMatrix.needsUpdate = true
      m.instanceColor!.needsUpdate = true
    }
  })

  const v = VERSIONS[version]
  const tone = version === 4 ? '#ff4fd8' : version >= 2 ? '#3ef0e6' : '#76ff3e'

  return (
    <>
      <color attach="background" args={['#020403']} />
      <fog attach="fog" args={['#020403', 40, 120]} />
      <ambientLight intensity={0.25} color="#9fc8b0" />
      <pointLight position={[0, 18, 0]} intensity={500} distance={60} decay={1.5} color="#e8ffe0" />

      <RoomCamera shots={SHOTS} fov={44} minDistance={4} maxDistance={70} />

      {/* The die: substrate and traces, the SMs in rows, the L2 band through the middle. */}
      <mesh rotation-x={-Math.PI / 2}>
        <planeGeometry args={[48, 34]} />
        <meshStandardMaterial map={traces} metalness={0.5} roughness={0.45} emissiveMap={traces} emissive="#3a2a08" emissiveIntensity={0.6} />
      </mesh>
      <mesh position={[0, -0.6, 0]}>
        <boxGeometry args={[49, 1.1, 35]} />
        <meshStandardMaterial color="#0a0f0c" metalness={0.4} roughness={0.6} />
      </mesh>
      {SM.map((p, i) => (
        <mesh key={i} position={[p.x, 0.3, p.z]}>
          <boxGeometry args={[2.5, 0.6, 2.5]} />
          <meshStandardMaterial color="#141a17" metalness={0.8} roughness={0.3} />
        </mesh>
      ))}
      <instancedMesh ref={smTops} args={[undefined, undefined, SM.length]}>
        <planeGeometry />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={shared} args={[undefined, undefined, SM.length]}>
        <boxGeometry />
        <meshBasicMaterial toneMapped={false} transparent opacity={0.35} blending={AdditiveBlending} depthWrite={false} />
      </instancedMesh>
      <mesh position={[0, 0.2, 0]}>
        <boxGeometry args={[COLS * PITCH, 0.35, 0.6]} />
        <meshBasicMaterial color={new Color('#d6aa46').multiplyScalar(0.8)} toneMapped={false} />
      </mesh>
      <Text font={FONT_MONO} fontSize={0.4} letterSpacing={0.3} rotation-x={-Math.PI / 2} position={[0, 0.4, 0.9]} anchorX="center" color="#d6aa46">
        L2
      </Text>

      {/* The HBM stacks, and their names. */}
      {HBM.map((h, i) => (
        <group key={i} position={h}>
          {Array.from({ length: 8 }, (_, k) => (
            <mesh key={k} position={[0, 0.3 + k * 0.52, 0]}>
              <boxGeometry args={[3.2, 0.44, 4.2]} />
              <meshStandardMaterial color={k % 2 ? '#1c1f24' : '#23272d'} metalness={0.8} roughness={0.3} />
            </mesh>
          ))}
          <Billboard position={[0, 5.4, 0]}>
            <Text font={FONT_MONO} fontSize={0.45} letterSpacing={0.2} anchorX="center" color="#8ea598">
              HBM
            </Text>
          </Billboard>
        </group>
      ))}

      <instancedMesh ref={packets} args={[undefined, undefined, PACKETS]} frustumCulled={false}>
        <boxGeometry />
        <meshBasicMaterial color={new Color('#fff2c0').multiplyScalar(2.2)} toneMapped={false} transparent opacity={0.85} blending={AdditiveBlending} depthWrite={false} />
      </instancedMesh>

      {/* C = A × B over the chip: A on the left, B at the back, C filling in. */}
      <mesh position={[0, CY - 0.05, 0]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[CW + 0.6, CW + 0.6]} />
        <meshBasicMaterial color="#9fffd0" transparent opacity={0.05} side={DoubleSide} depthWrite={false} />
      </mesh>
      <instancedMesh ref={cTiles} args={[undefined, undefined, N * N]} frustumCulled={false}>
        <planeGeometry />
        <meshBasicMaterial toneMapped={false} side={DoubleSide} />
      </instancedMesh>
      <instancedMesh ref={aRows} args={[undefined, undefined, N]} frustumCulled={false}>
        <planeGeometry />
        <meshBasicMaterial toneMapped={false} side={DoubleSide} transparent blending={AdditiveBlending} depthWrite={false} />
      </instancedMesh>
      <instancedMesh ref={bCols} args={[undefined, undefined, N]} frustumCulled={false}>
        <planeGeometry />
        <meshBasicMaterial toneMapped={false} side={DoubleSide} transparent blending={AdditiveBlending} depthWrite={false} />
      </instancedMesh>
      {[
        ['A', v3(-CW / 2 - 1.2, CY + CW / 2 + 0.6, -CW / 2 + 1)],
        ['B', v3(CW / 2 - 1, CY + CW / 2 + 0.6, -CW / 2 - 1.2)],
        ['C', v3(CW / 2 + 1.4, CY + 0.2, CW / 2)],
      ].map(([l, p]) => (
        <Billboard key={l as string} position={p as Vector3}>
          <Text font={FONT_SERIF} fontSize={1.6} anchorX="center" color="#efe6d8">
            {l as string}
          </Text>
        </Billboard>
      ))}

      {/* The version running, over the chip. */}
      <Billboard position={[0, CY + CW + 1.4, -CW / 2 - 1.2]}>
        <Text font={FONT_MONO} fontSize={0.7} letterSpacing={0.2} anchorX="center" anchorY="bottom">
          {`GEMM ${v.id} · ${v.name[lang].toUpperCase()}`}
          <meshBasicMaterial color={new Color(tone).multiplyScalar(1.6)} toneMapped={false} />
        </Text>
        <Text font={FONT_MONO} fontSize={0.36} anchorX="center" anchorY="top" position={[0, -0.2, 0]} maxWidth={26} textAlign="center">
          {`${v.what[lang]}\n${v.range} ${pt ? 'do cuBLAS (faixa típica citada no README, não medida aqui)' : 'of cuBLAS (typical range quoted in the README, not measured here)'}`}
          <meshBasicMaterial color="#b8c8bc" toneMapped={false} />
        </Text>
      </Billboard>
      <PctBar pct={v.pct} tone={tone} />
    </>
  )
}

/** A tall gauge beside C: the version's typical share of cuBLAS. */
function PctBar({ pct, tone }: { pct: number; tone: string }) {
  const bar = useRef<InstancedMesh>(null!)
  const k = useRef(0)
  const o = useMemo(() => new Object3D(), [])
  useFrame((_, dt) => {
    k.current += (pct - k.current) * Math.min(1, dt * 3)
    const h = MathUtils.clamp(k.current / 100, 0.005, 1) * 12
    o.position.set(CW / 2 + 3.2, CY - 4 + h / 2, -2)
    o.scale.set(0.9, h, 0.9)
    o.updateMatrix()
    bar.current.setMatrixAt(0, o.matrix)
    bar.current.instanceMatrix.needsUpdate = true
  })
  return (
    <>
      <instancedMesh ref={bar} args={[undefined, undefined, 1]} frustumCulled={false}>
        <boxGeometry />
        <meshBasicMaterial color={new Color(tone).multiplyScalar(1.5)} toneMapped={false} />
      </instancedMesh>
      <mesh position={[CW / 2 + 3.2, CY + 2, -2]}>
        <boxGeometry args={[1, 12, 1]} />
        <meshBasicMaterial color="#9fffd0" transparent opacity={0.07} depthWrite={false} />
      </mesh>
      <Billboard position={[CW / 2 + 3.2, CY + 8.8, -2]}>
        <Text font={FONT_MONO} fontSize={0.4} anchorX="center" color="#b8c8bc">
          {`${Math.round(pct)}% cuBLAS`}
        </Text>
      </Billboard>
    </>
  )
}

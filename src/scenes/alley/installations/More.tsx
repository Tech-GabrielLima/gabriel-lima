import { Text } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { Color, Group, InstancedMesh, Mesh, MeshBasicMaterial, Object3D, PointLight, Vector3 } from 'three'
import { openPanel } from '../../../live/overlay'
import { FONT_MONO } from '../../shared'
import type { InstallationProps } from './Installations'

// The other doors' installations (ROTEIRO, Cena 03, portas 2, 5, 6, 7 e 10).
// Same local frame as Installations.tsx: back wall at z=0, floor at y=0.

const o = new Object3D()
const c = new Color()

/* HALE — code enters a prism as white light and leaves as the compiler's stages. */
const STAGES = [
  { en: 'lexer', pt: 'lexer', color: '#ff5a8a' },
  { en: 'parser', pt: 'parser', color: '#ffb36b' },
  { en: 'types', pt: 'tipos', color: '#fff06b' },
  { en: 'IR', pt: 'IR', color: '#6bffb0' },
  { en: 'optimizer', pt: 'otimizador', color: '#6bc8ff' },
  { en: 'runtime ∥', pt: 'runtime ∥', color: '#c77dff' },
]

export function HalePrism({ w, lang, awake }: InstallationProps) {
  const pulses = useRef<InstancedMesh>(null!)
  const prism = useRef<Mesh>(null!)
  const P = new Vector3(-0.1, 1.35, 0.9) // prism centre
  const inStart = new Vector3(-w / 2 + 0.05, 1.5, 0.9)
  const outs = useMemo(
    () => STAGES.map((_, i) => new Vector3(w / 2 - 0.08, 0.75 + i * 0.2, 0.9 - 0.25 + i * 0.1)),
    [w],
  )
  const t = useRef(0)

  useFrame((state, delta) => {
    if (awake) t.current += delta
    prism.current.rotation.y = state.clock.elapsedTime * 0.25
    // 8 pulses on the white input beam, 4 per coloured output beam.
    let k = 0
    for (let i = 0; i < 8; i++, k++) {
      const u = (t.current * 0.6 + i / 8) % 1
      o.position.lerpVectors(inStart, P, u)
      o.scale.setScalar(awake ? 1 : 0)
      o.updateMatrix()
      pulses.current.setMatrixAt(k, o.matrix)
      pulses.current.setColorAt(k, c.set('#ffffff').multiplyScalar(3))
    }
    outs.forEach((end, s) => {
      for (let i = 0; i < 4; i++, k++) {
        // The last stage splits into two lanes: independent requests run in parallel.
        const u = (t.current * 0.6 + i / 4 + s * 0.07) % 1
        o.position.lerpVectors(P, end, u)
        if (s === STAGES.length - 1) o.position.y += (i % 2 ? 1 : -1) * 0.05 * u
        o.scale.setScalar(awake ? 1 : 0)
        o.updateMatrix()
        pulses.current.setMatrixAt(k, o.matrix)
        pulses.current.setColorAt(k, c.set(STAGES[s].color).multiplyScalar(3))
      }
    })
    pulses.current.instanceMatrix.needsUpdate = true
    pulses.current.instanceColor!.needsUpdate = true
  })

  // The prism is the way in: it opens hale's real compiler over the film.
  const open = (e: { stopPropagation(): void }) => (e.stopPropagation(), openPanel('hale'))
  return (
    <group>
      <mesh
        ref={prism}
        position={P}
        onClick={open}
        onPointerOver={(e) => (e.stopPropagation(), (document.body.style.cursor = 'pointer'))}
        onPointerOut={() => (document.body.style.cursor = '')}
      >
        <cylinderGeometry args={[0.16, 0.16, 0.42, 3]} />
        <meshStandardMaterial color="#d8d0ff" transparent opacity={0.35} roughness={0.05} metalness={0.1} emissive="#8a6bff" emissiveIntensity={0.4} />
      </mesh>
      {/* Beams, drawn as thin glowing rods. */}
      <Beam from={inStart} to={P} color="#ffffff" />
      {outs.map((end, s) => (
        <group key={s}>
          <Beam from={P} to={end} color={STAGES[s].color} />
          <Text font={FONT_MONO} fontSize={0.045} position={[end.x - 0.05, end.y + 0.05, end.z]} anchorX="right">
            {STAGES[s][lang]}
            <meshBasicMaterial color={STAGES[s].color} toneMapped={false} />
          </Text>
        </group>
      ))}
      <Text font={FONT_MONO} fontSize={0.04} position={[inStart.x + 0.02, inStart.y + 0.08, inStart.z]} anchorX="left">
        {'fetch GitHub /users/{u}'}
        <meshBasicMaterial color="#ffffff" toneMapped={false} />
      </Text>
      <Text font={FONT_MONO} fontSize={0.045} letterSpacing={0.12} position={[P.x, P.y - 0.36, P.z]} anchorX="center" onClick={open}>
        {lang === 'pt' ? '▸ abrir o compilador' : '▸ open the compiler'}
        <meshBasicMaterial color="#c8b8ff" toneMapped={false} />
      </Text>
      <instancedMesh ref={pulses} args={[undefined, undefined, 8 + STAGES.length * 4]} frustumCulled={false}>
        <sphereGeometry args={[0.014, 8, 8]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
    </group>
  )
}

function Beam({ from, to, color }: { from: Vector3; to: Vector3; color: string }) {
  const ref = useRef<Mesh>(null!)
  useLayoutEffect(() => {
    const mid = new Vector3().addVectors(from, to).multiplyScalar(0.5)
    ref.current.position.copy(mid)
    ref.current.lookAt(to)
    ref.current.rotateX(Math.PI / 2)
    ref.current.scale.set(1, from.distanceTo(to), 1)
  }, [from, to])
  return (
    <mesh ref={ref}>
      <cylinderGeometry args={[0.003, 0.003, 1, 6]} />
      <meshBasicMaterial color={color} toneMapped={false} transparent opacity={0.55} />
    </mesh>
  )
}

/* LEDGER — a vault balance: coins fly between two accounts, the sum never moves. */
export function LedgerScale({ lang, awake }: InstallationProps) {
  const beam = useRef<Group>(null!)
  const coins = useRef<InstancedMesh>(null!)
  const N = 24
  const A = new Vector3(-0.42, 1.12, 1.0)
  const B = new Vector3(0.42, 1.12, 1.0)
  const t = useRef(0)
  const count = useRef<Mesh>(null!)

  useFrame((_, delta) => {
    if (awake) t.current += delta
    // The beam trembles as money lands, but double-entry always brings it back level.
    beam.current.rotation.z = Math.sin(t.current * 5.3) * 0.02 * Math.sin(t.current * 0.7)
    for (let i = 0; i < N; i++) {
      const u = (t.current * 0.45 + i / N) % 1
      const dir = i % 2 ? 1 : -1
      const [p, q] = dir > 0 ? [A, B] : [B, A]
      o.position.lerpVectors(p, q, u)
      o.position.y += Math.sin(u * Math.PI) * 0.45
      o.rotation.set(u * 9, 0, Math.PI / 2)
      o.scale.setScalar(awake ? 1 : 0)
      o.updateMatrix()
      coins.current.setMatrixAt(i, o.matrix)
    }
    coins.current.instanceMatrix.needsUpdate = true
    const done = Math.min(1000, Math.floor(t.current * 60))
    const label = count.current as unknown as { text: string }
    const text = `${done}/1000 · Σ = 0`
    if (label.text !== text) label.text = text
  })

  return (
    <group>
      {/* Vault door ring on the back wall. */}
      <mesh position={[0, 1.55, 0.03]}>
        <torusGeometry args={[0.55, 0.05, 12, 48]} />
        <meshStandardMaterial color="#3a3c40" metalness={0.9} roughness={0.35} />
      </mesh>
      <mesh position={[0, 0.45, 1.0]}>
        <cylinderGeometry args={[0.03, 0.05, 0.9, 12]} />
        <meshStandardMaterial color="#b08a3a" metalness={0.9} roughness={0.3} />
      </mesh>
      <group ref={beam} position={[0, 0.92, 1.0]}>
        <mesh>
          <boxGeometry args={[0.95, 0.025, 0.025]} />
          <meshStandardMaterial color="#c9a24a" metalness={0.9} roughness={0.25} />
        </mesh>
        {[-0.42, 0.42].map((x) => (
          <mesh key={x} position={[x, 0.08, 0]}>
            <cylinderGeometry args={[0.16, 0.12, 0.03, 24]} />
            <meshStandardMaterial color="#c9a24a" metalness={0.9} roughness={0.25} />
          </mesh>
        ))}
      </group>
      <instancedMesh ref={coins} args={[undefined, undefined, N]} frustumCulled={false}>
        <cylinderGeometry args={[0.035, 0.035, 0.008, 16]} />
        <meshStandardMaterial color="#ffd36b" metalness={1} roughness={0.2} emissive="#ffb300" emissiveIntensity={0.6} />
      </instancedMesh>
      <Text ref={count} font={FONT_MONO} fontSize={0.07} position={[0, 2.25, 0.03]} anchorX="center">
        {'0/1000 · Σ = 0'}
        <meshBasicMaterial color="#7dffa8" toneMapped={false} />
      </Text>
      <Text font={FONT_MONO} fontSize={0.035} letterSpacing={0.15} position={[0, 0.75, 1.25]} anchorX="center">
        {lang === 'pt' ? 'CONTA A        CONTA B' : 'ACCOUNT A      ACCOUNT B'}
        <meshBasicMaterial color="#c9a24a" toneMapped={false} />
      </Text>
    </group>
  )
}

/* NABLA — a small neural net in neon: forward in pink, the gradient flows back in blue. */
const LAYERS = [4, 6, 6, 3]

export function NablaNet({ w, lang, awake }: InstallationProps) {
  const nodes = useMemo(() => {
    const out: Vector3[][] = []
    LAYERS.forEach((n, l) => {
      const x = -w * 0.36 + (l / (LAYERS.length - 1)) * w * 0.72
      out.push(Array.from({ length: n }, (_, i) => new Vector3(x, 0.8 + ((i + 0.5) / n) * 1.2, 0.6)))
    })
    return out
  }, [w])
  const edges = useMemo(() => {
    const e: [Vector3, Vector3, number][] = []
    for (let l = 0; l < LAYERS.length - 1; l++) for (const a of nodes[l]) for (const b of nodes[l + 1]) e.push([a, b, l])
    return e
  }, [nodes])
  const dots = useRef<InstancedMesh>(null!)
  const glow = useRef<MeshBasicMaterial[]>([])
  const t = useRef(0)

  useFrame((_, delta) => {
    if (awake) t.current += delta
    // One cycle: forward pass (0..1), backward pass (1..2).
    const phase = (t.current * 0.5) % 2
    const back = phase >= 1
    const front = back ? (LAYERS.length - 1) * (2 - phase) : (LAYERS.length - 1) * phase
    edges.forEach(([a, b, l], i) => {
      const u = Math.min(1, Math.max(0, front - l))
      const on = back ? front < l + 1 && front > l : front > l && front < l + 1
      o.position.lerpVectors(a, b, back ? 1 - (l + 1 - front) : u)
      o.scale.setScalar(awake && on ? 1 : 0)
      o.updateMatrix()
      dots.current.setMatrixAt(i, o.matrix)
      dots.current.setColorAt(i, c.set(back ? '#5aa8ff' : '#ff4f9a').multiplyScalar(back ? 2 : 3.5))
    })
    dots.current.instanceMatrix.needsUpdate = true
    dots.current.instanceColor!.needsUpdate = true
    let k = 0
    nodes.forEach((layer, l) =>
      layer.forEach(() => {
        const m = glow.current[k++]
        if (m) m.color.set(Math.abs(front - l) < 0.5 && awake ? (back ? '#9fd0ff' : '#ffc2dc') : '#4a2a3a')
      }),
    )
  })

  let k = 0
  return (
    <group>
      {edges.map(([a, b], i) => (
        <Beam key={i} from={a} to={b} color="#3a1a2c" />
      ))}
      {nodes.flat().map((p, i) => (
        <mesh key={i} position={p}>
          <sphereGeometry args={[0.035, 12, 12]} />
          <meshBasicMaterial ref={(m) => void (glow.current[k++] = m!)} color="#4a2a3a" toneMapped={false} />
        </mesh>
      ))}
      <instancedMesh ref={dots} args={[undefined, undefined, edges.length]} frustumCulled={false}>
        <sphereGeometry args={[0.012, 6, 6]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <Text font={FONT_MONO} fontSize={0.045} position={[0, 2.3, 0.03]} anchorX="center" maxWidth={w * 0.9} textAlign="center">
        {lang === 'pt' ? 'forward  →      ←  gradiente' : 'forward  →      ←  gradient'}
        <meshBasicMaterial color="#ff8ac0" toneMapped={false} />
      </Text>
    </group>
  )
}

/* CUDA — a wall of LEDs (threads) lighting in tiles, faster with every kernel version. */
const COLS = 28
const ROWS = 16
const VERSIONS = ['naive', 'coalesced', 'shared-mem tiling', 'register blocking', 'tensor cores']

export function CudaWall({ w, awake }: InstallationProps) {
  const leds = useRef<InstancedMesh>(null!)
  const label = useRef<Mesh>(null!)
  const t = useRef(0)
  const size = (w * 0.86) / COLS

  useLayoutEffect(() => {
    for (let i = 0; i < COLS * ROWS; i++) {
      o.position.set(-w * 0.43 + size * ((i % COLS) + 0.5), 0.9 + size * (Math.floor(i / COLS) + 0.5), 0.03)
      o.scale.setScalar(1)
      o.rotation.set(0, 0, 0)
      o.updateMatrix()
      leds.current.setMatrixAt(i, o.matrix)
    }
    leds.current.instanceMatrix.needsUpdate = true
  }, [w, size])

  useFrame((_, delta) => {
    if (awake) t.current += delta
    const v = Math.floor(t.current / 2.4) % VERSIONS.length
    // Each version sweeps the output tiles faster: that's the whole point of the repo.
    const speed = [1, 2, 4.5, 8, 16][v]
    const sweep = ((t.current % 2.4) / 2.4) * speed
    const tiles = (COLS / 4) * (ROWS / 4)
    for (let i = 0; i < COLS * ROWS; i++) {
      const cx = Math.floor((i % COLS) / 4)
      const cy = Math.floor(Math.floor(i / COLS) / 4)
      const tile = cy * (COLS / 4) + cx
      const done = (tile / tiles) * 1 < sweep % 1.0001 || sweep >= 1
      const hot = Math.abs(tile / tiles - (sweep % 1)) < 0.04
      leds.current.setColorAt(i, c.set(hot ? '#e8ffd0' : done ? '#76ff3e' : '#0d1a0a').multiplyScalar(hot ? 3 : done ? 1.4 : 1))
    }
    leds.current.instanceColor!.needsUpdate = true
    const l = label.current as unknown as { text: string }
    const text = `GEMM v${v + 1} · ${VERSIONS[v]}`
    if (l.text !== text) l.text = text
  })

  return (
    <group>
      <instancedMesh ref={leds} args={[undefined, undefined, COLS * ROWS]} frustumCulled={false}>
        <planeGeometry args={[size * 0.7, size * 0.7]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <Text ref={label} font={FONT_MONO} fontSize={0.055} position={[0, 0.72, 0.03]} anchorX="center">
        GEMM v1 · naive
        <meshBasicMaterial color="#76ff3e" toneMapped={false} />
      </Text>
    </group>
  )
}

/* EM OBRAS — hazard tape, a welder's flashes, the next sessions announced. */
export function UnderConstruction({ w, lang, awake }: InstallationProps) {
  const flash = useRef<PointLight>(null!)
  const sparks = useRef<InstancedMesh>(null!)
  const seeds = useMemo(() => Array.from({ length: 30 }, () => [Math.random(), Math.random(), Math.random()]), [])
  const t = useRef(0)

  useFrame((_, delta) => {
    if (awake) t.current += delta
    const on = awake && Math.sin(t.current * 23) * Math.sin(t.current * 5.7) > 0.3
    flash.current.intensity = on ? 3 + Math.random() * 3 : 0
    seeds.forEach(([a, b, s], i) => {
      const u = (t.current * (1.5 + s) + a) % 1
      o.position.set(0.25 + (a - 0.5) * 0.9 * u, 1.05 + (b * 0.6 - 0.3 - 1.2 * u) * u, 0.9 + (s - 0.5) * 0.6 * u)
      o.scale.setScalar(on ? 1 - u : 0)
      o.updateMatrix()
      sparks.current.setMatrixAt(i, o.matrix)
    })
    sparks.current.instanceMatrix.needsUpdate = true
  })

  return (
    <group>
      <pointLight ref={flash} position={[0.25, 1.1, 1]} color="#bfe3ff" distance={3} decay={2} />
      <instancedMesh ref={sparks} args={[undefined, undefined, 30]} frustumCulled={false}>
        <sphereGeometry args={[0.01, 6, 6]} />
        <meshBasicMaterial color="#fff2c4" toneMapped={false} />
      </instancedMesh>
      {/* Hazard tape across the opening. */}
      {[-0.35, 0.3].map((r, i) => (
        <mesh key={i} position={[0, 1.2 + i * 0.5, 2.55]} rotation-z={r}>
          <planeGeometry args={[w * 1.2, 0.08]} />
          <meshStandardMaterial color="#ffd21f" emissive="#3a2e00" roughness={0.6} />
        </mesh>
      ))}
      <Text font={FONT_MONO} fontSize={0.06} position={[0, 1.7, 0.03]} anchorX="center" maxWidth={w * 0.9} textAlign="center" lineHeight={1.4}>
        {lang === 'pt' ? 'PRÓXIMAS SESSÕES\nfront · node · android' : 'NEXT SESSIONS\nfront · node · android'}
        <meshBasicMaterial color="#ffe14d" toneMapped={false} />
      </Text>
    </group>
  )
}

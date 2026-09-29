import { Text } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  InstancedMesh,
  LineSegments,
  Matrix4,
  Plane,
  Raycaster,
  Vector3,
} from 'three'
import { MONOLITH } from '../../content/projects'
import { cursor } from '../../film/cursor'
import type { Lang } from '../../film/store'
import { FONT_MONO } from '../shared'
import { q } from '../../film/quality'
import { TOWER_Z } from './layout'

// The BEL·900 tower closing the alley (ROTEIRO, porta 8): a modern block behind
// the old brick, with one window per class of the monolith. Lighting a window
// wakes its dependencies, and the light spreads through the graph.

const COLS = 30
const ROWS = 31 // 930 windows ≥ 900 classes
const WIDTH = 16
const HEIGHT = 40
const DEPTH = 10
const BASE = 4.2 // lobby height before the first row
const WIN = { w: 0.3, h: 0.62 }
const N = COLS * ROWS

const WARM = new Color('#ffcf8a')
const COOL = new Color('#9fd8ff')

/** Deterministic PRNG so the building looks the same on every visit. */
function rng(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)
}

export function Tower({ lang }: { lang: Lang }) {
  const camera = useThree((s) => s.camera)
  const windows = useRef<InstancedMesh>(null!)
  const wires = useRef<LineSegments>(null!)

  const graph = useMemo(() => {
    const r = rng(900)
    const pos = new Float32Array(N * 3)
    const base = new Float32Array(N)
    const tint = new Uint8Array(N)
    const deps = new Int32Array(N * 2)
    const dx = WIDTH / COLS
    const dy = (HEIGHT - BASE - 1) / ROWS
    for (let i = 0; i < N; i++) {
      const c = i % COLS
      const row = Math.floor(i / COLS)
      pos[i * 3] = -WIDTH / 2 + dx * (c + 0.5)
      pos[i * 3 + 1] = BASE + dy * (row + 0.5)
      pos[i * 3 + 2] = TOWER_Z + 0.02
      // Late at night: a third of the offices still have someone in them.
      base[i] = r() < 0.33 ? 0.12 + r() * 0.25 : 0.012
      tint[i] = r() < 0.22 ? 1 : 0
      // Two dependencies nearby — classes mostly import their neighbours.
      for (let k = 0; k < 2; k++) {
        const nc = Math.min(COLS - 1, Math.max(0, c + Math.round((r() - 0.5) * 8)))
        const nr = Math.min(ROWS - 1, Math.max(0, row + Math.round((r() - 0.5) * 8)))
        deps[i * 2 + k] = nr * COLS + nc
      }
    }
    return { pos, base, tint, deps, energy: new Float32Array(base), next: new Float32Array(N) }
  }, [])

  useLayoutEffect(() => {
    const m = new Matrix4()
    for (let i = 0; i < N; i++) {
      m.makeTranslation(graph.pos[i * 3], graph.pos[i * 3 + 1], graph.pos[i * 3 + 2])
      windows.current.setMatrixAt(i, m)
      windows.current.setColorAt(i, WARM)
    }
    windows.current.instanceMatrix.needsUpdate = true
  }, [graph])

  // One wire per dependency edge; colours are written each frame.
  const wireGeo = useMemo(() => {
    const g = new BufferGeometry()
    const p = new Float32Array(N * 2 * 2 * 3)
    for (let i = 0; i < N; i++)
      for (let k = 0; k < 2; k++) {
        const j = graph.deps[i * 2 + k]
        const o = (i * 2 + k) * 6
        p.set([graph.pos[i * 3], graph.pos[i * 3 + 1], TOWER_Z + 0.05], o)
        p.set([graph.pos[j * 3], graph.pos[j * 3 + 1], TOWER_Z + 0.05], o + 3)
      }
    g.setAttribute('position', new BufferAttribute(p, 3))
    g.setAttribute('color', new BufferAttribute(new Float32Array(p.length), 3))
    return g
  }, [graph])

  const tmp = useMemo(() => ({ ray: new Raycaster(), plane: new Plane(new Vector3(0, 0, 1), -TOWER_Z), hit: new Vector3(), c: new Color() }), [])

  const skip = useRef(0)
  useFrame((state, delta) => {
    // Phones: the 930-window graph updates every other frame (it's CPU work), at twice the step.
    const every = q(1, 2)
    if (++skip.current % every) return
    delta *= every
    const { energy, next, base, deps, pos, tint } = graph
    tmp.ray.setFromCamera(cursor.pos, camera)
    const onTower = tmp.ray.ray.intersectPlane(tmp.plane, tmp.hit) !== null && Math.abs(tmp.hit.x) < WIDTH / 2
    const e = state.clock.elapsedTime

    // 1. Base occupancy + the flashlight's footprint.
    for (let i = 0; i < N; i++) {
      let v = base[i]
      if (onTower) {
        const d2 = (pos[i * 3] - tmp.hit.x) ** 2 + (pos[i * 3 + 1] - tmp.hit.y) ** 2
        if (d2 < 6) v = Math.max(v, 1.4 * (1 - d2 / 6))
      }
      next[i] = v
    }
    // 2. Lit classes wake their dependencies (one hop per frame, so it visibly spreads).
    for (let i = 0; i < N; i++) {
      const s = energy[i] * 0.82
      if (s < 0.3) continue
      for (let k = 0; k < 2; k++) {
        const j = deps[i * 2 + k]
        if (next[j] < s) next[j] = s
      }
    }
    // 3. Ease, write colours and wires.
    const k = 1 - Math.exp(-delta * 7)
    const col = wireGeo.getAttribute('color') as BufferAttribute
    for (let i = 0; i < N; i++) {
      energy[i] += (next[i] - energy[i]) * k
      const flick = base[i] > 0.1 && Math.sin(e * 0.7 + i) > 0.995 ? 0.5 : 1
      tmp.c.copy(tint[i] ? COOL : WARM).multiplyScalar(energy[i] * flick * 2.2)
      windows.current.setColorAt(i, tmp.c)
      for (let d = 0; d < 2; d++) {
        const j = deps[i * 2 + d]
        const w = Math.max(0, Math.min(energy[i], energy[j]) - 0.35) * 1.2
        const o = (i * 2 + d) * 6
        col.array[o] = col.array[o + 3] = w * 0.25
        col.array[o + 1] = col.array[o + 4] = w * 0.9
        col.array[o + 2] = col.array[o + 5] = w
      }
    }
    windows.current.instanceColor!.needsUpdate = true
    col.needsUpdate = true
  })

  return (
    <group>
      {/* The block: dark curtain-wall concrete. */}
      <mesh position={[0, HEIGHT / 2, TOWER_Z - DEPTH / 2]} receiveShadow>
        <boxGeometry args={[WIDTH, HEIGHT, DEPTH]} />
        <meshStandardMaterial color="#101217" roughness={0.6} metalness={0.3} />
      </mesh>
      <instancedMesh ref={windows} args={[undefined, undefined, N]} frustumCulled={false}>
        <planeGeometry args={[WIN.w, WIN.h]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <lineSegments ref={wires} geometry={wireGeo} frustumCulled={false}>
        <lineBasicMaterial vertexColors transparent blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
      </lineSegments>

      {/* Lobby sign. */}
      <Text font={FONT_MONO} fontSize={0.36} letterSpacing={0.3} position={[0, 3.1, TOWER_Z + 0.05]} anchorX="center">
        BEL · 900
        <meshStandardMaterial color="#000" emissive="#9fd8ff" emissiveIntensity={3} toneMapped={false} />
      </Text>
      <Text font={FONT_MONO} fontSize={0.13} letterSpacing={0.16} position={[0, 2.55, TOWER_Z + 0.05]} anchorX="center">
        {MONOLITH.line[lang].toUpperCase()}
        <meshStandardMaterial color="#000" emissive="#ffcf8a" emissiveIntensity={1.6} toneMapped={false} />
      </Text>
      {/* Glass lobby doors glowing faintly. */}
      <mesh position={[0, 1.1, TOWER_Z + 0.03]}>
        <planeGeometry args={[3.2, 2.2]} />
        <meshBasicMaterial color="#1c2a36" toneMapped={false} />
      </mesh>
    </group>
  )
}

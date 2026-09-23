import { Text } from '@react-three/drei'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { BufferGeometry, Color, InstancedMesh, Mesh, MeshBasicMaterial, Object3D, Vector3 } from 'three'
import { SUPERVISED } from '../../content/projects'
import { panFor, sfx } from '../../film/audio'
import type { Lang } from '../../film/store'
import { FONT_MONO } from '../shared'
import { HALF } from './layout'

// LET IT CRASH (ROTEIRO, porta 9): an Erlang/OTP supervision tree strung across
// the alley as festoon bulbs. Break a worker and its supervisor restarts it.

const Z = -19.5
const ROOT = new Vector3(0, 5.4, Z)
const SUPS = [-1.7, 0, 1.7].map((x) => new Vector3(x, 4.85, Z))
const WORKERS = SUPS.flatMap((s) => [-0.55, 0, 0.55].map((dz, i) => new Vector3(s.x + (i - 1) * 0.35, 4.2 - Math.abs(dz) * 0.3, Z + dz)))
const RESTART = 0.35 // seconds a supervisor takes to bring a worker back

interface Props {
  lang: Lang
  /** Watch mode is stopped here: crash bulbs on the visitor's behalf. */
  auto: boolean
  onHover(on: boolean): void
}

const o = new Object3D()
const WARM = new Color('#ffcf8a')
const BLUE = new Color('#8fc8ff')
const tmp = new Color()

export function SupervisorTree({ lang, auto, onHover }: Props) {
  const bulbs = useRef<InstancedMesh>(null!)
  const sparks = useRef<InstancedMesh>(null!)
  const sups = useRef<MeshBasicMaterial[]>([])
  const counter = useRef<Mesh>(null!)
  const camera = useThree((st) => st.camera)
  const state = useMemo(
    () => ({
      down: WORKERS.map(() => -1), // time left until restart, -1 = alive
      flash: SUPS.map(() => 0),
      sparks: Array.from({ length: 60 }, () => ({ p: new Vector3(), v: new Vector3(), life: 0 })),
      restarts: 0,
      next: 1,
      shown: '',
    }),
    [],
  )

  const crash = (i: number) => {
    if (state.down[i] >= 0) return
    state.down[i] = RESTART
    state.restarts++
    const pan = panFor(WORKERS[i], camera)
    sfx('pop', pan)
    setTimeout(() => sfx('zap', pan, 0.8), RESTART * 1000)
    for (let k = 0; k < 10; k++) {
      const s = state.sparks.find((x) => x.life <= 0)
      if (!s) break
      s.p.copy(WORKERS[i])
      s.v.set((Math.random() - 0.5) * 2.4, Math.random() * 1.5, (Math.random() - 0.5) * 2.4)
      s.life = 0.35 + Math.random() * 0.35
    }
  }

  const wires = useMemo(() => {
    const pts: Vector3[] = [new Vector3(-HALF, 5.6, Z), ROOT, ROOT, new Vector3(HALF, 5.6, Z)]
    SUPS.forEach((s, j) => {
      pts.push(ROOT, s)
      WORKERS.slice(j * 3, j * 3 + 3).forEach((w) => pts.push(s, w))
    })
    return new BufferGeometry().setFromPoints(pts)
  }, [])

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05)
    if (auto) {
      state.next -= dt
      if (state.next <= 0) {
        crash(Math.floor(Math.random() * WORKERS.length))
        state.next = 0.5 + Math.random() * 0.7
      }
    }
    WORKERS.forEach((p, i) => {
      if (state.down[i] >= 0) {
        state.down[i] -= dt
        state.flash[Math.floor(i / 3)] = 1
        if (state.down[i] < 0) state.down[i] = -1
      }
      const alive = state.down[i] < 0
      o.position.copy(p)
      o.scale.setScalar(alive ? 1 : 0.001)
      o.updateMatrix()
      bulbs.current.setMatrixAt(i, o.matrix)
      bulbs.current.setColorAt(i, tmp.copy(WARM).multiplyScalar(alive ? 3 : 0))
    })
    bulbs.current.instanceMatrix.needsUpdate = true
    bulbs.current.instanceColor!.needsUpdate = true
    state.flash.forEach((f, j) => {
      state.flash[j] = Math.max(0, f - dt * 3)
      sups.current[j]?.color.copy(WARM).lerp(BLUE, state.flash[j]).multiplyScalar(2 + state.flash[j] * 4)
    })
    state.sparks.forEach((s, i) => {
      if (s.life > 0) {
        s.life -= dt
        s.v.y -= 6 * dt
        s.p.addScaledVector(s.v, dt)
      }
      o.position.copy(s.p)
      o.scale.setScalar(s.life > 0 ? 1 : 0)
      o.updateMatrix()
      sparks.current.setMatrixAt(i, o.matrix)
    })
    sparks.current.instanceMatrix.needsUpdate = true
    const text = `${lang === 'pt' ? 'reinícios' : 'restarts'}: ${state.restarts} · ${lang === 'pt' ? 'quedas' : 'outages'}: 0`
    if (text !== state.shown) {
      state.shown = text
      ;(counter.current as unknown as { text: string }).text = text
    }
  })

  const hover = (on: boolean) => (e: ThreeEvent<PointerEvent>) => {
    // Only when you're under the tree, not while pointing at it from the far end of the alley.
    if (on && camera.position.distanceTo(ROOT) > 9) return
    e.stopPropagation()
    document.body.style.cursor = on ? 'pointer' : ''
    onHover(on)
  }

  return (
    <group>
      <lineSegments geometry={wires}>
        <lineBasicMaterial color="#6a5a48" />
      </lineSegments>
      {/* Supervisors: bigger bulbs that flash blue when they restart a child. */}
      {[ROOT, ...SUPS].map((p, i) => (
        <mesh key={i} position={p}>
          <sphereGeometry args={[i === 0 ? 0.1 : 0.075, 16, 16]} />
          <meshBasicMaterial ref={(m) => void (i > 0 && (sups.current[i - 1] = m!))} color="#ffcf8a" toneMapped={false} />
        </mesh>
      ))}
      <instancedMesh ref={bulbs} args={[undefined, undefined, WORKERS.length]} frustumCulled={false}>
        <sphereGeometry args={[0.055, 12, 12]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      {/* Generous invisible hit targets: bulbs are small from the street. */}
      {WORKERS.map((p, i) => (
        <mesh
          key={i}
          position={p}
          onPointerOver={hover(true)}
          onPointerOut={hover(false)}
          onClick={(e) => {
            e.stopPropagation()
            crash(i)
          }}
        >
          <sphereGeometry args={[0.22, 8, 8]} />
          <meshBasicMaterial visible={false} />
        </mesh>
      ))}
      <instancedMesh ref={sparks} args={[undefined, undefined, 60]} frustumCulled={false}>
        <sphereGeometry args={[0.012, 6, 6]} />
        <meshBasicMaterial color="#fff0c0" toneMapped={false} />
      </instancedMesh>
      {/* The sign is painted in neon on the right-hand wall, behind the bulbs. */}
      <group position={[HALF - 0.12, 5.1, Z]} rotation-y={-Math.PI / 2}>
        {/* A dark enamel board, so the neon reads against it and not against a window. */}
        <mesh position={[0, 0.05, -0.02]}>
          <boxGeometry args={[3.4, 1.25, 0.06]} />
          <meshStandardMaterial color="#0d0e12" roughness={0.6} metalness={0.4} />
        </mesh>
        {[
          [0, 0.66, 3.35, 0.02],
          [0, -0.56, 3.35, 0.02],
          [-1.67, 0.05, 0.02, 1.2],
          [1.67, 0.05, 0.02, 1.2],
        ].map(([x, y, w, h], i) => (
          <mesh key={i} position={[x, y, 0.02]}>
            <boxGeometry args={[w, h, 0.02]} />
            <meshBasicMaterial color="#ff9a4a" toneMapped={false} />
          </mesh>
        ))}
        <Text font={FONT_MONO} fontSize={0.3} letterSpacing={0.2} position={[0, 0.35, 0.03]} anchorX="center">
          LET IT CRASH
          <meshBasicMaterial color="#ffcf8a" toneMapped={false} />
        </Text>
        <Text font={FONT_MONO} fontSize={0.13} letterSpacing={0.1} position={[0, 0, 0.03]} anchorX="center">
          {SUPERVISED.line[lang]}
          <meshBasicMaterial color="#8fc8ff" toneMapped={false} />
        </Text>
        <Text ref={counter} font={FONT_MONO} fontSize={0.11} letterSpacing={0.1} position={[0, -0.26, 0.03]} anchorX="center">
          {''}
          <meshBasicMaterial color="#8fc8ff" toneMapped={false} />
        </Text>
      </group>
    </group>
  )
}

import { Billboard, Text } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Color, InstancedMesh, Object3D, Vector3, type Object3D as O3 } from 'three'
import { sfx } from '../../../film/audio'
import { useFilm } from '../../../film/store'
import { FONT_MONO, FONT_SERIF } from '../../shared'
import { LANTERN_Y, Lighthouse, useLighthouseMaps } from './Lighthouse'
import { startTabNode, tabId, useTabRaft } from './tabs'

// The visitor's own cluster, in the middle of the archipelago: one small
// lighthouse per open tab of this room, each a real Raft node (./tabraft.ts)
// talking to the others over a BroadcastChannel. Same language as the five
// big ones: the leader's lens sweeps, the followers face it, heartbeats cross
// the water, a node that's down goes dark.

/** At most this many tabs get a lighthouse (the panel lists them all). */
const MAX = 7
const SCALE = 0.4
const R = 7.5
const BASE = 1.6
const PULSES = 24
const o = new Object3D()
const tmp = new Vector3()

const spot = (i: number, n: number) => {
  const a = n === 1 ? Math.PI / 2 : -Math.PI / 2 + (i / n) * Math.PI * 2
  const r = n === 1 ? 0 : R
  return new Vector3(Math.cos(a) * r, BASE, Math.sin(a) * r)
}

export function TabIsland({ rock }: { rock: O3 }) {
  const lang = useFilm((s) => s.lang)
  const pt = lang === 'pt'
  const maps = useLighthouseMaps()
  const snap = useTabRaft((s) => s.snap)
  const island = useMemo(() => rock.clone(true), [rock])

  useEffect(() => startTabNode(), [])

  // The members in a stable order (by id), so a lighthouse keeps its place as tabs come and go.
  const nodes = useMemo(() => (snap ? [...snap.nodes].sort((a, b) => a.id.localeCompare(b.id)).slice(0, MAX) : []), [snap])
  const lamps = useMemo(() => Array.from({ length: MAX }, () => ({ lit: { current: 0 }, leader: { current: false }, heading: { current: 0 } })), [])
  const pulses = useRef<InstancedMesh>(null!)
  const pulseData = useMemo(() => Array.from({ length: PULSES }, () => ({ from: new Vector3(), to: new Vector3(), t: 1 })), [])
  const st = useRef({ beat: 0, leader: '' as string | null })

  useFrame((_, delta) => {
    // Nothing is mounted until the first snapshot arrives (the component renders null till then).
    if (!pulses.current) return
    const dt = Math.min(delta, 0.05)
    const now = performance.now() / 1000
    const s = st.current
    const n = nodes.length
    // Whom this tab follows (its own view is the one that counts here).
    const leader = nodes.findIndex((v) => v.id === snap?.self.leader && v.role === 'leader')
    if (snap && snap.self.leader !== s.leader) {
      if (snap.self.leader) sfx('bell', undefined, 0.35)
      s.leader = snap.self.leader
    }
    lamps.forEach((l, i) => {
      const v = nodes[i]
      const up = !!v && v.role !== 'down'
      l.lit.current += ((up ? 1 : 0) - l.lit.current) * Math.min(1, dt * 4)
      l.leader.current = !!v && i === leader
      const p = spot(i, n)
      const lp = leader >= 0 ? spot(leader, n) : p
      const want = i === leader ? now * 0.9 + i : leader >= 0 && n > 1 ? Math.atan2(-(lp.z - p.z), lp.x - p.x) : Math.sin(now * 0.9 + i * 2) * 2.2
      const d = Math.atan2(Math.sin(want - l.heading.current), Math.cos(want - l.heading.current))
      l.heading.current += d * Math.min(1, dt * (i === leader ? 20 : 2.5))
    })
    // Heartbeats (the real ones go every 150 ms; drawn at a readable pace).
    if (leader >= 0 && n > 1 && now - s.beat > 0.6) {
      s.beat = now
      nodes.forEach((v, i) => {
        if (i === leader || v.role === 'down') return
        const p = pulseData.find((x) => x.t >= 1)
        if (!p) return
        p.from.copy(spot(leader, n)).setY(BASE + LANTERN_Y * SCALE)
        p.to.copy(spot(i, n)).setY(BASE + LANTERN_Y * SCALE)
        p.t = 0
      })
    }
    pulseData.forEach((p, i) => {
      if (p.t < 1) p.t = Math.min(1, p.t + dt * 1.6)
      tmp.lerpVectors(p.from, p.to, p.t)
      tmp.y += Math.sin(p.t * Math.PI) * 2.5
      o.position.copy(tmp)
      o.scale.setScalar(p.t < 1 ? 0.22 : 0)
      o.updateMatrix()
      pulses.current.setMatrixAt(i, o.matrix)
    })
    pulses.current.instanceMatrix.needsUpdate = true
  })

  if (!snap) return null
  const me = tabId()
  const n = nodes.length

  return (
    <group>
      <primitive object={island} position={[0, -0.9, 0]} scale={[2.6, 1.4, 2.6]} />
      {nodes.map((v, i) => {
        const p = spot(i, n)
        const isLeader = v.id === snap.self.leader && v.role === 'leader'
        return (
          <group key={v.id} position={p}>
            <group scale={SCALE}>
              <Lighthouse maps={maps} seed={parseInt(v.id, 16) % 7} {...lamps[i]} />
            </group>
            <Billboard position={[0, LANTERN_Y * SCALE + 2.4, 0]}>
              <Text font={FONT_SERIF} fontSize={v.id === me ? 1.25 : 1} anchorX="center" anchorY="bottom">
                {v.id === me ? (pt ? `esta aba · ${v.id}` : `this tab · ${v.id}`) : `${pt ? 'aba' : 'tab'} ${v.id}`}
                <meshBasicMaterial color={isLeader ? '#ffd9a0' : v.role === 'down' ? '#ff6a5a' : '#e8e0d4'} toneMapped={false} fog={false} />
              </Text>
              <Text font={FONT_MONO} fontSize={0.42} letterSpacing={0.1} anchorX="center" anchorY="top" position={[0, -0.2, 0]}>
                {v.role === 'down'
                  ? pt ? '✕ FORA' : '✕ DOWN'
                  : `${isLeader ? (pt ? 'LÍDER' : 'LEADER') : v.role === 'candidate' ? (pt ? 'CANDIDATO' : 'CANDIDATE') : pt ? 'SEGUIDOR' : 'FOLLOWER'} · ${pt ? 'mandato' : 'term'} ${v.term} · commit ${v.commit}`}
                <meshBasicMaterial color={isLeader ? '#ffb36b' : '#a9a197'} toneMapped={false} fog={false} />
              </Text>
            </Billboard>
          </group>
        )
      })}
      <Billboard position={[0, LANTERN_Y * SCALE + 6.2, 0]}>
        <Text font={FONT_MONO} fontSize={0.55} letterSpacing={0.24} anchorX="center" anchorY="bottom">
          {pt ? `SUAS ABAS · ${n} ${n === 1 ? 'NÓ' : 'NÓS'} · RAFT DE VERDADE` : `YOUR TABS · ${n} ${n === 1 ? 'NODE' : 'NODES'} · REAL RAFT`}
          <meshBasicMaterial color={new Color('#9fd8ff').multiplyScalar(1.3)} toneMapped={false} fog={false} />
        </Text>
      </Billboard>
      <instancedMesh ref={pulses} args={[undefined, undefined, PULSES]} frustumCulled={false} renderOrder={6}>
        <sphereGeometry args={[1, 10, 8]} />
        <meshBasicMaterial color="#bfe6ff" toneMapped={false} fog={false} />
      </instancedMesh>
    </group>
  )
}


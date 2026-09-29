import { RoundedBox, Text } from '@react-three/drei'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useMemo, useRef, useState } from 'react'
import { Color, Group, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, Object3D, Points, Vector3 } from 'three'
import type { Lang } from '../../../film/store'
import { live, px, useLive } from '../../../live/live'
import { openPanel } from '../../../live/overlay'
import { FONT_MONO } from '../../shared'
import { Cluster, type Role } from './raft'

// The three featured installations behind the alley's doors (ROTEIRO, Cena 03).
// Local frame: origin on the room's back wall at floor level, +z towards the
// opening, x across the room. Rooms are `w` wide, 2.81 m tall, 2.6 m deep.

export interface InstallationProps {
  w: number
  lang: Lang
  /** The door is lit or open: run the show. */
  awake: boolean
}

const stop = (e: ThreeEvent<MouseEvent | PointerEvent>) => e.stopPropagation()

/* -------------------------------------------------------------------------- */
/* FLIGHT — a flight recorder; behind it a film strip rewinds to the crash.  */
/* -------------------------------------------------------------------------- */

const CRASH = [
  { code: 'python app.py', note: { en: 'recording…', pt: 'gravando…' } },
  { code: 'orders = load(day)', note: { en: 'orders: list[0]', pt: 'orders: list[0]' } },
  { code: 'total = sum(orders)', note: { en: 'total = 0', pt: 'total = 0' } },
  { code: 'avg = total / len(orders)', note: { en: 'len(orders) = 0', pt: 'len(orders) = 0' } },
  { code: 'ZeroDivisionError', note: { en: 'why? orders ↔ []', pt: 'por quê? orders ↔ []' } },
]
const FRAME_W = 0.62

export function FlightBox({ w, lang, awake }: InstallationProps) {
  const box = useRef<Group>(null!)
  const strip = useRef<Group>(null!)
  const scan = useRef(0)

  useFrame((state, delta) => {
    const e = state.clock.elapsedTime
    box.current.rotation.y = Math.sin(e * 0.4) * 0.35 + 0.35
    // Awake: rewind from the crash frame back to the start, pause, repeat.
    scan.current = awake ? (scan.current + delta * 0.55) % (CRASH.length + 1.5) : 0
    // Frame `f` sits centred; the strip starts on the crash and runs backwards to its cause.
    const f = CRASH.length - 1 - Math.min(CRASH.length - 1, scan.current)
    strip.current.position.x += (-f * FRAME_W - strip.current.position.x) * Math.min(1, delta * 6)
  })

  return (
    <group>
      {/* Film strip across the back wall. */}
      <group position={[0, 1.95, 0.02]}>
        <mesh>
          <planeGeometry args={[w, 0.52]} />
          <meshStandardMaterial color="#120d08" roughness={0.7} />
        </mesh>
        <group ref={strip}>
          {CRASH.map((c, i) => {
            const last = i === CRASH.length - 1
            return (
              <group key={i} position={[i * FRAME_W, 0, 0.005]}>
                <mesh>
                  <planeGeometry args={[FRAME_W - 0.06, 0.34]} />
                  <meshStandardMaterial color="#000" emissive={last ? '#ff5a3d' : '#ffb36b'} emissiveIntensity={last ? 0.45 : 0.16} toneMapped={false} />
                </mesh>
                <Text font={FONT_MONO} fontSize={0.034} position={[0, 0.05, 0.01]} anchorX="center" maxWidth={FRAME_W - 0.1}>
                  {c.code}
                  <meshBasicMaterial color={last ? '#fff1e6' : '#ffe2c2'} toneMapped={false} />
                </Text>
                <Text font={FONT_MONO} fontSize={0.026} position={[0, -0.07, 0.01]} anchorX="center" maxWidth={FRAME_W - 0.1}>
                  {c.note[lang]}
                  <meshBasicMaterial color="#ff9a4a" toneMapped={false} />
                </Text>
                {/* Sprocket holes. */}
                {[-0.22, 0.22].map((y) =>
                  [-0.2, 0, 0.2].map((x) => (
                    <mesh key={`${x}${y}`} position={[x, y, 0]}>
                      <planeGeometry args={[0.05, 0.03]} />
                      <meshBasicMaterial color="#2a2018" />
                    </mesh>
                  )),
                )}
              </group>
            )
          })}
        </group>
      </group>

      {/* The recorder on a plinth, with its warning stencil. */}
      <mesh position={[0, 0.4, 1.0]} castShadow receiveShadow>
        <boxGeometry args={[0.55, 0.8, 0.55]} />
        <meshStandardMaterial color="#17181c" roughness={0.6} />
      </mesh>
      <group ref={box} position={[0, 0.98, 1.0]}>
        <RoundedBox args={[0.42, 0.34, 0.3]} radius={0.03} smoothness={3} castShadow>
          <meshStandardMaterial color="#ff5a14" roughness={0.45} metalness={0.2} emissive="#ff3d00" emissiveIntensity={0.08} />
        </RoundedBox>
        {[-0.1, 0.1].map((y) => (
          <mesh key={y} position={[0, y, 0.152]}>
            <planeGeometry args={[0.4, 0.035]} />
            <meshStandardMaterial color="#8d8a84" roughness={0.8} />
          </mesh>
        ))}
        <Text font={FONT_MONO} fontSize={0.028} letterSpacing={0.08} position={[0, 0, 0.153]} anchorX="center">
          {lang === 'pt' ? 'GRAVADOR DE VOO · NÃO ABRA' : 'FLIGHT RECORDER · DO NOT OPEN'}
          <meshStandardMaterial color="#111" roughness={0.8} />
        </Text>
      </group>
    </group>
  )
}

/* -------------------------------------------------------------------------- */
/* RAFT — five lanterns electing a leader; click one to crash it.            */
/* -------------------------------------------------------------------------- */

const ROLE_COLOR = {
  follower: new Color('#ffb36b'),
  candidate: new Color('#ff5a3d'),
  leader: new Color('#fff4d6'),
  down: new Color('#1a1512'),
}
const MSG_COLOR = { heartbeat: new Color('#ffd9a0'), 'vote?': new Color('#ff6a3d'), 'vote!': new Color('#ffe98a') }

/** What a lantern shows: from the live cluster on the server when connected, else the local simulation. */
type Lamp = { id: number; role: Role; term: number }

const liveLamps = () => {
  const s = useLive.getState()
  if (s.status !== 'live' || !s.state) return null
  return s.state.raft.nodes.map((n): Lamp => ({ id: n.id, role: n.up ? n.role : 'down', term: n.term }))
}

export function RaftTable({ w, lang, awake }: InstallationProps) {
  const cluster = useMemo(() => new Cluster(5), [])
  // Re-render the labels when the live cluster changes (a few times a second at most).
  const liveRaft = useLive((s) => (s.status === 'live' ? s.state?.raft : undefined))
  const [, setVersion] = useState(0)
  const cores = useRef<Mesh[]>([])
  const pulses = useRef<InstancedMesh>(null!)

  // Lanterns in a shallow arc on the table.
  const spots = useMemo(
    () =>
      Array.from({ length: 5 }, (_, i) => {
        const a = ((i - 2) / 2) * 0.9
        return new Vector3(Math.sin(a) * w * 0.38, 1.02, 1.05 - Math.cos(a) * 0.45)
      }),
    [w],
  )
  const tmp = useMemo(() => ({ m: new Matrix4(), v: new Vector3(), c: new Color() }), [])

  useFrame((state, delta) => {
    const lamps = liveLamps()
    if (awake && !lamps) cluster.step(Math.min(delta, 0.05))
    const e = state.clock.elapsedTime
    ;(lamps ?? cluster.nodes).forEach((n, i) => {
      const mat = cores.current[i]?.material as MeshStandardMaterial | undefined
      if (!mat) return
      const flick = n.role === 'candidate' ? 0.6 + 0.4 * Math.sin(e * 30) : 1
      mat.emissive.copy(ROLE_COLOR[n.role])
      mat.emissiveIntensity = n.role === 'down' ? 0 : (n.role === 'leader' ? 5 : 2) * flick
    })
    // Messages as sparks travelling between lanterns. Live, the server streams state, not every RPC:
    // the sparks are the leader's heartbeats to the followers it can reach, at their real cadence.
    const lead = lamps?.find((n) => n.role === 'leader')
    const msgs = lamps
      ? lead
        ? lamps.filter((n) => n.role !== 'down' && n.id !== lead.id).map((n) => ({ from: lead.id, to: n.id, kind: 'heartbeat' as const, t: (e * 1.8) % 1 }))
        : []
      : cluster.msgs
    for (let i = 0; i < 64; i++) {
      const m = msgs[i]
      if (m) {
        tmp.v.lerpVectors(spots[m.from], spots[m.to], m.t)
        tmp.v.y += Math.sin(m.t * Math.PI) * 0.12
        tmp.m.makeTranslation(tmp.v.x, tmp.v.y, tmp.v.z)
        pulses.current.setColorAt(i, tmp.c.copy(MSG_COLOR[m.kind]).multiplyScalar(4))
      } else tmp.m.makeScale(0, 0, 0)
      pulses.current.setMatrixAt(i, tmp.m)
    }
    pulses.current.instanceMatrix.needsUpdate = true
    if (pulses.current.instanceColor) pulses.current.instanceColor.needsUpdate = true
    if (cluster.version !== (pulses.current.userData.v ?? -1)) {
      pulses.current.userData.v = cluster.version
      setVersion(cluster.version)
    }
  })

  const lamps: Lamp[] = liveRaft ? liveRaft.nodes.map((n) => ({ id: n.id, role: n.up ? n.role : 'down', term: n.term })) : cluster.nodes
  const leader = lamps.find((n) => n.role === 'leader')
  return (
    <group>
      {/* Table. */}
      <mesh position={[0, 0.9, 0.95]} castShadow receiveShadow>
        <boxGeometry args={[w * 0.92, 0.05, 0.9]} />
        <meshStandardMaterial color="#2a1d14" roughness={0.7} />
      </mesh>
      {spots.map((p, i) => {
        const n = lamps[i]
        return (
          <group
            key={i}
            position={p}
            onClick={(e) => {
              stop(e)
              if (liveRaft) void live.toggleNode(i)
              else {
                cluster.toggle(i)
                setVersion(cluster.version)
              }
            }}
            onPointerOver={(e) => (stop(e), (document.body.style.cursor = 'pointer'))}
            onPointerOut={() => (document.body.style.cursor = '')}
          >
            {/* Cage and glass. */}
            <mesh position={[0, 0.11, 0]}>
              <cylinderGeometry args={[0.07, 0.08, 0.2, 10, 1, true]} />
              <meshStandardMaterial color="#3a2a1a" metalness={0.7} roughness={0.4} wireframe />
            </mesh>
            <mesh ref={(m) => void (cores.current[i] = m!)} position={[0, 0.11, 0]}>
              <sphereGeometry args={[0.04, 12, 12]} />
              <meshStandardMaterial color="#000" toneMapped={false} />
            </mesh>
            <mesh position={[0, 0.23, 0]}>
              <coneGeometry args={[0.085, 0.06, 10]} />
              <meshStandardMaterial color="#2a1f16" metalness={0.6} roughness={0.5} />
            </mesh>
            <Text font={FONT_MONO} fontSize={0.035} position={[0, -0.03, 0.12]} rotation-x={-0.5} anchorX="center">
              {n.role === 'down' ? '✕' : `${n.role === 'leader' ? '» ' : ''}T${n.term}`}
              <meshBasicMaterial color={n.role === 'leader' ? '#fff4d6' : '#b89a7a'} toneMapped={false} />
            </Text>
          </group>
        )
      })}
      <instancedMesh ref={pulses} args={[undefined, undefined, 64]} frustumCulled={false}>
        <sphereGeometry args={[0.012, 8, 8]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>

      {/* Instructions painted on the back wall. */}
      <Text font={FONT_MONO} fontSize={0.05} letterSpacing={0.1} position={[0, 2.05, 0.02]} anchorX="center" maxWidth={w * 0.9} textAlign="center">
        {lang === 'pt'
          ? `LÍDER: ${leader ? `NÓ ${leader.id + 1} · MANDATO ${leader.term}` : 'ELEIÇÃO EM CURSO…'}\nclique num lampião para derrubar o nó${liveRaft ? '\n● AO VIVO · o cluster real, para todo mundo no site' : ''}`
          : `LEADER: ${leader ? `NODE ${leader.id + 1} · TERM ${leader.term}` : 'ELECTION IN PROGRESS…'}\nclick a lantern to crash that node${liveRaft ? '\n● LIVE · the real cluster, for everyone on the site' : ''}`}
        <meshBasicMaterial color="#ffc46b" toneMapped={false} />
      </Text>
    </group>
  )
}

/* -------------------------------------------------------------------------- */
/* MATCH — an order book of light: bids and asks collide, trades spark.      */
/* -------------------------------------------------------------------------- */

const LEVELS = 12
const BID = new Color('#ffb36b')
const ASK = new Color('#3ef0e6')

export function OrderBook({ w, lang, awake }: InstallationProps) {
  const bars = useRef<InstancedMesh>(null!)
  const sparks = useRef<Points>(null!)
  const book = useMemo(
    () => ({
      bid: Array.from({ length: LEVELS }, () => 0.1 + Math.random() * 0.4),
      ask: Array.from({ length: LEVELS }, () => 0.1 + Math.random() * 0.4),
      sparks: Array.from({ length: 80 }, () => ({ p: new Vector3(0, -99, 0), v: new Vector3(), life: 0 })),
      trades: 0,
    }),
    [],
  )
  const half = w * 0.44
  const tmp = useMemo(() => ({ o: new Object3D(), c: new Color() }), [])

  const liveBook = useLive((s) => (s.status === 'live' ? s.state?.book : undefined))
  const lastTrade = useRef(-1)

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05)
    const lb = useLive.getState().status === 'live' ? useLive.getState().state?.book : undefined
    if (lb) {
      // Live: the real book. Rows are price ticks around the spread, asks above, bids below.
      const mid = lb.bestBid && lb.bestAsk ? Math.round((lb.bestBid + lb.bestAsk) / 2) : (lb.bestBid || lb.bestAsk)
      const top = Math.max(1, ...lb.bids.map((b) => b[1]), ...lb.asks.map((a) => a[1]))
      const at = (side: [number, number][], p: number) => side.find((x) => x[0] === p)?.[1] ?? 0
      for (let i = 0; i < LEVELS; i++) {
        const price = mid - LEVELS / 2 + i
        const tb = at(lb.bids, price) / top
        const ta = at(lb.asks, price) / top
        book.bid[i] += (tb - book.bid[i]) * Math.min(1, dt * 8)
        book.ask[i] += (ta - book.ask[i]) * Math.min(1, dt * 8)
      }
      // A spark burst for every real trade since the last frame, at its price.
      const newest = lb.last[0]?.[0] ?? -1
      if (lastTrade.current >= 0 && newest > lastTrade.current) {
        for (const [id, price] of lb.last) {
          if (id <= lastTrade.current) break
          const row = Math.min(LEVELS - 1, Math.max(0, price - (mid - LEVELS / 2)))
          const y = 0.55 + (row / LEVELS) * 1.4
          for (let k = 0; k < 4; k++) {
            const sp = book.sparks.find((x) => x.life <= 0)
            if (!sp) break
            sp.p.set(0, y, 0.25)
            sp.v.set((Math.random() - 0.5) * 1.6, Math.random() * 1.1, Math.random() * 0.8)
            sp.life = 0.4 + Math.random() * 0.4
          }
        }
      }
      lastTrade.current = newest
    } else if (awake) {
      // Orders arrive on random price levels, resting orders get cancelled, and
      // wherever the two sides overlap at a level the engine matches them.
      for (let k = 0; k < 2; k++) {
        const i = Math.floor(Math.random() * LEVELS)
        if (Math.random() < 0.5) book.bid[i] = Math.min(1, book.bid[i] + Math.random() * 0.22)
        else book.ask[i] = Math.min(1, book.ask[i] + Math.random() * 0.22)
      }
      for (let i = 0; i < LEVELS; i++) {
        book.bid[i] *= 1 - dt * 0.35
        book.ask[i] *= 1 - dt * 0.35
        const over = book.bid[i] + book.ask[i] - 0.98
        if (over <= 0) continue
        book.bid[i] -= over * 0.7
        book.ask[i] -= over * 0.7
        book.trades += 1 + Math.floor(Math.random() * 3)
        const y = 0.55 + (i / LEVELS) * 1.4
        for (let s = 0; s < 5; s++) {
          const sp = book.sparks.find((x) => x.life <= 0)
          if (!sp) break
          sp.p.set(0, y, 0.25)
          sp.v.set((Math.random() - 0.5) * 1.6, Math.random() * 1.1, Math.random() * 0.8)
          sp.life = 0.4 + Math.random() * 0.4
        }
      }
    }
    for (let i = 0; i < LEVELS; i++) {
      const y = 0.55 + (i / LEVELS) * 1.4
      for (const [side, len, col] of [
        [-1, book.bid[i], BID],
        [1, book.ask[i], ASK],
      ] as const) {
        const l = Math.max(0.01, len * half)
        tmp.o.position.set(side * (half - l / 2), y, 0.2)
        tmp.o.scale.set(l, 0.07, 0.04)
        tmp.o.updateMatrix()
        const idx = side < 0 ? i : LEVELS + i
        bars.current.setMatrixAt(idx, tmp.o.matrix)
        bars.current.setColorAt(idx, tmp.c.copy(col).multiplyScalar(0.5 + len * 2.4))
      }
    }
    bars.current.instanceMatrix.needsUpdate = true
    bars.current.instanceColor!.needsUpdate = true

    const pos = sparks.current.geometry.getAttribute('position')
    book.sparks.forEach((s, i) => {
      if (s.life > 0) {
        s.life -= dt
        s.v.y -= 3 * dt
        s.p.addScaledVector(s.v, dt)
      } else s.p.y = -99
      pos.setXYZ(i, s.p.x, s.p.y, s.p.z)
    })
    pos.needsUpdate = true
  })

  const sparkPositions = useMemo(() => new Float32Array(80 * 3).fill(-99), [])
  const loc = lang === 'pt' ? 'pt-BR' : 'en-US'
  // Live: the real counters. Offline: the engine's measured benchmark, stated as such (the bars are a simulation).
  const headline = liveBook
    ? `${liveBook.trades.toLocaleString(loc)} ${lang === 'pt' ? 'negócios' : 'trades'} · ${px(liveBook.last[0]?.[1] ?? 0)}`
    : lang === 'pt'
      ? '3,6M ordens/s no benchmark'
      : '3.6M orders/s benchmarked'
  const trade = (side: 'BUY' | 'SELL') => (e: ThreeEvent<MouseEvent>) => {
    stop(e)
    if (liveBook) void live.order({ side, type: 'MARKET', qty: 5 })
    else openPanel('book')
  }
  const hot = (e: ThreeEvent<PointerEvent>) => (stop(e), (document.body.style.cursor = 'pointer'))
  const cold = () => (document.body.style.cursor = '')

  return (
    <group>
      <instancedMesh ref={bars} args={[undefined, undefined, LEVELS * 2]} frustumCulled={false}>
        <boxGeometry />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      {/* The spread: a thin white line where buyers and sellers meet. */}
      <mesh position={[0, 1.25, 0.2]}>
        <boxGeometry args={[0.006, 1.5, 0.006]} />
        <meshBasicMaterial color="#ffffff" toneMapped={false} />
      </mesh>
      <points ref={sparks}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[sparkPositions, 3]} />
        </bufferGeometry>
        <pointsMaterial color="#fff3c4" size={0.025} toneMapped={false} />
      </points>
      <Text font={FONT_MONO} fontSize={0.11} position={[0, 2.3, 0.02]} anchorX="center">
        {headline}
        <meshBasicMaterial color="#3ef0e6" toneMapped={false} />
      </Text>
      {liveBook && (
        <Text font={FONT_MONO} fontSize={0.035} letterSpacing={0.15} position={[0, 2.16, 0.02]} anchorX="center">
          {lang === 'pt' ? '● AO VIVO · o engine real · clique para negociar' : '● LIVE · the real engine · click to trade'}
          <meshBasicMaterial color="#7dffa0" toneMapped={false} />
        </Text>
      )}
      <Text font={FONT_MONO} fontSize={0.04} letterSpacing={0.2} position={[-half / 2, 0.38, 0.2]} anchorX="center" onClick={trade('BUY')} onPointerOver={hot} onPointerOut={cold}>
        {liveBook ? (lang === 'pt' ? '▲ COMPRAR 5' : '▲ BUY 5') : lang === 'pt' ? 'COMPRA' : 'BID'}
        <meshBasicMaterial color="#ffb36b" toneMapped={false} />
      </Text>
      <Text font={FONT_MONO} fontSize={0.04} letterSpacing={0.2} position={[half / 2, 0.38, 0.2]} anchorX="center" onClick={trade('SELL')} onPointerOver={hot} onPointerOut={cold}>
        {liveBook ? (lang === 'pt' ? '▼ VENDER 5' : '▼ SELL 5') : lang === 'pt' ? 'VENDA' : 'ASK'}
        <meshBasicMaterial color="#3ef0e6" toneMapped={false} />
      </Text>
    </group>
  )
}

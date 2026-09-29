import { Billboard, Environment, MeshReflectorMaterial, OrbitControls, Text, useTexture } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { AdditiveBlending, Color, Group, InstancedMesh, MathUtils, Mesh, MeshBasicMaterial, Object3D, PerspectiveCamera, PointLight, RepeatWrapping, Vector3 } from 'three'
import { Line2 } from 'three/examples/jsm/lines/Line2.js'
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { panFor, sfx } from '../../../film/audio'
import { useCurtain } from '../../../film/curtain'
import { useQ } from '../../../film/quality'
import { useFilm } from '../../../film/store'
import { FONT_MONO, FONT_SERIF } from '../../shared'
import { currentBook, isLive, placeOrder, price, sim } from './orders'
import { useMatchRoom } from './state'

// SALA · MATCH (ROTEIRO §0.3). Through the MATCH door: the order book of
// lowlatency-matching-engine, running on the live server, as a city at night.
// A wet avenue runs to the horizon: it's the spread. Down its left side stand
// the bids, down its right the asks, one tower per price level, best prices
// nearest; each lit floor is one lot resting in the queue. Every trade is a
// bolt across the avenue, and it eats the resting side's tower from the
// bottom (price-time priority: the oldest lots go first) while the rest of the
// stack drops into place. Over it all turns the Disruptor's ring buffer: one
// slot lights for every order in, and a single cursor — the one thread, with
// no locks — follows it round. The visitor trades for real: market orders
// from the buttons, or a click on a tower for a limit order at its price,
// whose white floors are then followed up the queue until they fill.
// Without the server, a local book (./sim.ts) drives the same show.

const ASPHALT = '/textures/asphalt_02'
useTexture.preload([`${ASPHALT}/diff.webp`, `${ASPHALT}/nor.webp`, '/textures/puddles.webp'])

/** The avenue's width (the spread), a tower's footprint, the gap between price levels, a floor's height. */
const AVE = 12
const W = 8
const D = 8
const SP = 11
const FH = 1.1
/** Floors drawn at most per tower, towers per side (the book shows ten levels; a few spare for the ones leaving). */
const MAXF = 36
const SLOTS = 14
const CURB = 0.16
const X = [-(AVE / 2 + W / 2), AVE / 2 + W / 2] as const
/** The face of each side's towers that looks onto the avenue. */
const FACE = [-AVE / 2, AVE / 2] as const
const COLORS = [new Color('#ffb36b'), new Color('#3ef0e6')] as const
const WHITE = new Color('#ffffff')

/** The Disruptor's ring, high over the far end of the avenue. */
const RING_N = 64
const RING_R = 16
const RING_AT = new Vector3(0, 44, -120)

const BOLTS = 10
const BOLT_PTS = 12
const SPARKS = 260

const h = (i: number, p: number) => {
  const x = Math.sin(i * 12.9898 + p * 78.233) * 43758.5453
  return x - Math.floor(x)
}

/** Director's shots: camera position and target. */
const shotAt = (k: number): [Vector3, Vector3] => {
  if (k === 2) return [new Vector3(0, 3.2, 17), new Vector3(0, 5, -6)]
  if (k === 3) return [new Vector3(-96, 74, -30), new Vector3(0, 2, -52)]
  if (k === 4) return [new Vector3(20, 36, -66), RING_AT.clone()]
  return [new Vector3(0, 14, 60), new Vector3(0, 10, -35)]
}
/** A portrait screen is narrow: step back so both sides of the avenue still fit. */
const portraitFit = (aspect: number) => MathUtils.clamp(0.95 / aspect, 1, 1.5)
const SHOT_AT = (k: number, aspect: number): [Vector3, Vector3] => {
  const [p, t] = shotAt(k)
  return [t.clone().lerp(p, portraitFit(aspect)), t]
}

type Slot = { side: 0 | 1; price: number; used: boolean; seen: boolean; rank: number; z: number; qty: number; drop: number; fresh: number; freshAt: number }
type Label = { used: boolean; side: 0 | 1; price: number; qty: number }

export default function MatchRoom() {
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const size = useThree((s) => s.size)
  const lang = useFilm((s) => s.lang)
  const pt = lang === 'pt'
  const lowTier = useQ(false, true)
  const controls = useRef<OrbitControlsImpl>(null)

  const asphalt = useTexture({ map: `${ASPHALT}/diff.webp`, normalMap: `${ASPHALT}/nor.webp` })
  const puddles = useTexture('/textures/puddles.webp')
  useLayoutEffect(() => {
    for (const t of Object.values(asphalt)) {
      t.wrapS = t.wrapT = RepeatWrapping
      t.repeat.set(80 * 0.47, 420 * 0.45)
    }
    puddles.wrapS = puddles.wrapT = RepeatWrapping
    puddles.repeat.set(3, 18)
  }, [asphalt, puddles])

  // The camera is the visitor's here.
  useLayoutEffect(() => {
    const prev = { fov: camera.fov, far: camera.far }
    const [p, t] = SHOT_AT(1, camera.aspect)
    camera.position.copy(p)
    camera.fov = camera.aspect < 1 ? 56 : 46
    camera.far = 900
    camera.lookAt(t)
    camera.updateProjectionMatrix()
    return () => {
      camera.fov = prev.fov
      camera.far = prev.far
      camera.updateProjectionMatrix()
    }
  }, [camera])

  const slots = useMemo<Slot[]>(
    () => Array.from({ length: SLOTS * 2 }, (_, i) => ({ side: (i < SLOTS ? 0 : 1) as 0 | 1, price: -1, used: false, seen: false, rank: 0, z: 0, qty: 0, drop: 0, fresh: 0, freshAt: -99 })),
    [],
  )
  const cores = useRef<InstancedMesh>(null!)
  const bands = useRef<InstancedMesh>(null!)
  const labelGroups = useRef<Group[]>([])
  const [labels, setLabels] = useState<Label[]>(() => slots.map((s) => ({ used: false, side: s.side, price: 0, qty: 0 })))
  const [head, setHead] = useState({ spread: 0, bid: 0, ask: 0, orders: 0 })

  // The ring buffer.
  const ringSlots = useRef<InstancedMesh>(null!)
  const consumer = useRef<Mesh>(null!)
  const producer = useRef<Mesh>(null!)
  const ringLit = useMemo(() => new Float32Array(RING_N), [])

  // Bolts across the avenue, sparks, the flash of each trade, and the visitor's market order running down the avenue.
  const bolts = useMemo(
    () =>
      Array.from({ length: BOLTS }, () => {
        const g = new LineGeometry()
        g.setPositions(new Float32Array(BOLT_PTS * 3))
        const m = new LineMaterial({ color: 0xffffff, linewidth: 4, transparent: true, depthWrite: false, blending: AdditiveBlending, toneMapped: false })
        const line = new Line2(g, m)
        line.frustumCulled = false
        return { line, life: 0 }
      }),
    [],
  )
  useEffect(
    () => () => {
      for (const b of bolts) {
        b.line.geometry.dispose()
        b.line.material.dispose()
      }
    },
    [bolts],
  )
  const sparks = useRef<InstancedMesh>(null!)
  const sparkData = useMemo(() => Array.from({ length: SPARKS }, () => ({ p: new Vector3(0, -99, 0), v: new Vector3(), life: 0, c: 0 as 0 | 1 })), [])
  const flash = useRef<PointLight>(null!)
  const runner = useRef<Mesh>(null!)

  const st = useRef({
    entry: -1,
    lastTrade: -1,
    orders: -1,
    seq: 0,
    cons: 0,
    flash: 0,
    lastZap: 0,
    lastLabels: 0,
    idleSince: 0,
    sent: 0,
    run: { t: 1, side: 'BUY' as 'BUY' | 'SELL', from: new Vector3() },
    shotFrom: null as null | { p: Vector3; t: Vector3; p1: Vector3; t1: Vector3; at: number },
  })
  const o = useMemo(() => new Object3D(), [])
  const c = useMemo(() => new Color(), [])
  const v = useMemo(() => new Vector3(), [])

  const spark = (x: number, y: number, z: number, side: 0 | 1, n: number, dir: number) => {
    for (let k = 0; k < n; k++) {
      const s = sparkData.find((q) => q.life <= 0)
      if (!s) return
      s.p.set(x, y, z + (Math.random() - 0.5) * D * 0.8)
      s.v.set(dir * (1.5 + Math.random() * 4), 1 + Math.random() * 4, (Math.random() - 0.5) * 2)
      s.life = 0.6 + Math.random() * 0.7
      s.c = side
    }
  }
  const bolt = (from: number, to: number, y: number, z: number, col: Color) => {
    const b = bolts.find((q) => q.life <= 0) ?? bolts[0]
    const arr = new Float32Array(BOLT_PTS * 3)
    for (let i = 0; i < BOLT_PTS; i++) {
      const u = i / (BOLT_PTS - 1)
      const j = i === 0 || i === BOLT_PTS - 1 ? 0 : 1
      arr[i * 3] = MathUtils.lerp(from, to, u)
      arr[i * 3 + 1] = y + Math.sin(u * Math.PI) * 1.2 + (Math.random() - 0.5) * 1.4 * j
      arr[i * 3 + 2] = z + (Math.random() - 0.5) * 1.6 * j
    }
    b.line.geometry.setPositions(arr)
    b.line.material.color.copy(col).multiplyScalar(2.2)
    b.life = 1
  }

  useEffect(() => () => void (document.body.style.cursor = ''), [])

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05)
    const now = performance.now() / 1000
    const s = st.current
    const phase = useCurtain.getState().phase
    if (s.entry < 0 && (phase === 'opening' || phase === 'open')) s.entry = now
    // The city switches on behind the curtain: towers rise level by level, the best prices first.
    const rise = s.entry < 0 ? 0 : MathUtils.clamp((now - s.entry - 0.3) / 2.4, 0, 1)

    if (!isLive()) sim.step(dt)
    const book = currentBook()
    const mineBefore = useMatchRoom.getState().mine
    let mine = mineBefore ? { ...mineBefore } : null
    let mineDone: string | null = null

    // Match each price level to its tower (a tower keeps its price, and slides forward as the levels ahead of it go).
    for (const sl of slots) sl.seen = false
    ;([book.bids, book.asks] as const).forEach((levels, side) => {
      levels.forEach(([p, q], rank) => {
        let sl = slots.find((x) => x.used && x.side === side && x.price === p)
        if (!sl) {
          sl = slots.find((x) => !x.used && x.side === side)
          if (!sl) return
          Object.assign(sl, { used: true, price: p, z: -rank * SP, qty: 0, drop: 0, fresh: 0, freshAt: -99 })
        }
        sl.seen = true
        sl.rank = rank
        if (q < sl.qty) {
          // Lots gone from the front of the queue: the bottom floors burst, the stack above falls into place.
          const d = sl.qty - q
          sl.drop += d
          if (rise >= 1) spark(FACE[side], CURB + 0.6, sl.z, side as 0 | 1, Math.min(4 * d, 24), side === 0 ? 1 : -1)
          if (mine && mine.price === p && (mine.side === 'BUY') === (side === 0)) {
            mine.ahead -= d
            if (mine.ahead < 0) {
              mine.qty += mine.ahead
              mine.ahead = 0
            }
          }
        } else if (q > sl.qty) {
          sl.fresh = now - sl.freshAt < 1.2 ? sl.fresh + (q - sl.qty) : q - sl.qty
          sl.freshAt = now
        }
        sl.qty = q
      })
    })
    for (const sl of slots) {
      if (sl.used && !sl.seen) {
        // A level emptied: the whole tower goes.
        if (rise >= 1 && sl.qty) spark(FACE[sl.side], CURB + 1, sl.z, sl.side, 24, sl.side === 0 ? 1 : -1)
        if (mine && mine.price === sl.price && (mine.side === 'BUY') === (sl.side === 0)) mine.qty = 0
        sl.used = false
        sl.qty = 0
      }
      sl.z += (-sl.rank * SP - sl.z) * Math.min(1, dt * 4)
      sl.drop = Math.max(0, sl.drop - dt * (2.5 + sl.drop * 5))
    }
    if (mine && mine.qty <= 0) {
      mineDone = pt ? `sua ordem em ${price(mine.price)} chegou à frente da fila e foi executada inteira` : `your order at ${price(mine.price)} reached the front of the queue and filled completely`
      mine = null
      sfx('ring', undefined, 0.6)
    }
    if (mineBefore && (!mine || mine.ahead !== mineBefore.ahead || mine.qty !== mineBefore.qty)) useMatchRoom.setState(mineDone ? { mine, note: mineDone } : { mine })

    // Draw the towers: a dark glass core, and a lit band round every floor.
    slots.forEach((sl, si) => {
      const n = sl.used ? Math.min(MAXF, Math.round(sl.qty * MathUtils.clamp(rise * 1.7 - sl.rank * 0.07, 0, 1))) : 0
      const base = CURB + sl.drop * FH
      o.rotation.set(0, 0, 0)
      o.position.set(X[sl.side], base + (n * FH) / 2, sl.z)
      o.scale.set(W, Math.max(0.001, n * FH), D)
      o.updateMatrix()
      cores.current.setMatrixAt(si, o.matrix)
      const own = mine && mine.price === sl.price && (mine.side === 'BUY') === (sl.side === 0) ? mine : null
      const k = now - sl.freshAt
      for (let i = 0; i < MAXF; i++) {
        const idx = si * MAXF + i
        if (i >= n) {
          o.scale.setScalar(0)
        } else {
          o.position.set(X[sl.side], base + i * FH + FH * 0.62, sl.z)
          o.scale.set(W + 0.14, 0.24, D + 0.14)
          const hot = own && i >= own.ahead && i < own.ahead + own.qty
          c.copy(COLORS[sl.side]).multiplyScalar(1.1 + h(i, sl.price) * 1.2)
          if (hot) c.copy(WHITE).multiplyScalar(2.6 + Math.sin(now * 5) * 0.4)
          // New lots flare in their side's colour (white is kept for the visitor's own).
          else if (k < 1.2 && i >= n - sl.fresh) c.multiplyScalar(1 + (1 - k / 1.2) * 1.4)
          bands.current.setColorAt(idx, c)
        }
        o.updateMatrix()
        bands.current.setMatrixAt(idx, o.matrix)
      }
      const g = labelGroups.current[si]
      if (g) {
        // Only the front of the book is labelled (further back the signs would pile up), and the visitor's own level.
        g.visible = sl.used && n > 0 && (sl.rank <= 2 || !!own)
        g.position.set(X[sl.side], base + n * FH + 2.4, sl.z)
      }
    })
    cores.current.instanceMatrix.needsUpdate = true
    bands.current.instanceMatrix.needsUpdate = true
    if (bands.current.instanceColor) bands.current.instanceColor.needsUpdate = true

    // Trades since the last frame: a bolt from the taker's side into the resting tower it hit.
    const newest = book.last[0]?.[0] ?? -1
    if (s.lastTrade < 0 || rise < 1) s.lastTrade = newest
    if (newest > s.lastTrade) {
      let shown = 0
      for (const [id, p, , side] of book.last) {
        if (id <= s.lastTrade || shown > 6) break
        shown++
        const rest: 0 | 1 = side === 'BUY' ? 1 : 0
        const sl = slots.find((x) => x.side === rest && x.price === p)
        const z = sl ? sl.z : 0
        bolt(FACE[1 - rest], FACE[rest], CURB + 0.8 + Math.random() * 2.2, z, COLORS[1 - rest])
        s.flash = 1
        flash.current.position.set(0, 3, z)
        flash.current.color.copy(COLORS[1 - rest])
      }
      if (now - s.lastZap > 0.18) {
        s.lastZap = now
        sfx('zap', panFor(flash.current.position, camera), 0.22)
      }
      s.lastTrade = newest
    }
    s.flash = Math.max(0, s.flash - dt * 5)
    flash.current.intensity = s.flash * 90
    for (const b of bolts) {
      b.life = Math.max(0, b.life - dt * 3)
      b.line.visible = b.life > 0
      b.line.material.opacity = b.life * b.life
      b.line.material.resolution.set(size.width, size.height)
    }
    sparkData.forEach((q, i) => {
      if (q.life > 0) {
        q.life -= dt
        q.v.y -= 9 * dt
        q.p.addScaledVector(q.v, dt)
        if (q.p.y < 0.05) {
          q.p.y = 0.05
          q.v.y *= -0.3
          q.v.x *= 0.6
        }
      }
      o.position.copy(q.p)
      o.scale.setScalar(q.life > 0 ? 0.09 * Math.min(1, q.life * 2) : 0)
      o.updateMatrix()
      sparks.current.setMatrixAt(i, o.matrix)
      sparks.current.setColorAt(i, c.copy(COLORS[q.c]).lerp(WHITE, 0.5).multiplyScalar(3))
    })
    sparks.current.instanceMatrix.needsUpdate = true
    if (sparks.current.instanceColor) sparks.current.instanceColor.needsUpdate = true

    // The visitor's market order: a light that runs from the camera down the avenue to the front of the book.
    const sent = useMatchRoom.getState().sent
    if (sent.n !== s.sent) {
      s.sent = sent.n
      s.run = { t: 0, side: sent.side, from: v.set(camera.position.x * 0.3, 1.4, Math.max(8, camera.position.z)).clone() }
    }
    if (s.run.t < 1) s.run.t = Math.min(1, s.run.t + dt * 1.5)
    const ru = MathUtils.smoothstep(s.run.t, 0, 1)
    runner.current.visible = s.run.t < 1
    runner.current.position.lerpVectors(s.run.from, v.set(FACE[s.run.side === 'BUY' ? 1 : 0] * 0.4, 1.4, 0), ru)
    runner.current.scale.set(0.35, 0.35, 0.35 + (1 - ru) * 4)
    ;(runner.current.material as MeshBasicMaterial).color.copy(COLORS[s.run.side === 'BUY' ? 0 : 1]).multiplyScalar(4)

    // The ring buffer: one slot lights for each order in (the publisher); the one consumer thread follows it round.
    if (s.orders < 0) s.orders = book.orders
    const fresh = Math.min(RING_N, Math.max(0, book.orders - s.orders))
    s.orders = book.orders
    for (let k = 0; k < fresh; k++) ringLit[Math.floor(s.seq + k) % RING_N] = 1
    s.seq += fresh
    s.cons += (s.seq - s.cons) * Math.min(1, dt * 7)
    for (let i = 0; i < RING_N; i++) {
      ringLit[i] = Math.max(0, ringLit[i] - dt * 0.9)
      const a = (i / RING_N) * Math.PI * 2
      o.position.set(RING_AT.x + Math.sin(a) * RING_R, RING_AT.y + Math.cos(a) * RING_R, RING_AT.z)
      o.rotation.set(0, 0, -a)
      o.scale.set(1.1, 0.5, 0.5)
      o.updateMatrix()
      ringSlots.current.setMatrixAt(i, o.matrix)
      ringSlots.current.setColorAt(i, c.set('#2a3850').lerp(COLORS[1], ringLit[i]).multiplyScalar(0.9 + ringLit[i] * 2.4))
    }
    ringSlots.current.instanceMatrix.needsUpdate = true
    if (ringSlots.current.instanceColor) ringSlots.current.instanceColor.needsUpdate = true
    for (const [m, at, r] of [
      [consumer.current, s.cons, RING_R - 2.1],
      [producer.current, s.seq, RING_R + 2.1],
    ] as const) {
      const a = ((at % RING_N) / RING_N) * Math.PI * 2
      m.position.set(RING_AT.x + Math.sin(a) * r, RING_AT.y + Math.cos(a) * r, RING_AT.z)
      m.rotation.set(0, 0, -a)
    }

    // Director's shots.
    const shot = useMatchRoom.getState().shot
    const ctl = controls.current
    if (shot && ctl) {
      const [p1, t1] = SHOT_AT(shot, camera.aspect)
      s.shotFrom = { p: camera.position.clone(), t: ctl.target.clone(), p1, t1, at: now }
      useMatchRoom.setState({ shot: 0 })
    }
    if (s.shotFrom && ctl) {
      const u = MathUtils.smootherstep(Math.min(1, (now - s.shotFrom.at) / 2.2), 0, 1)
      camera.position.lerpVectors(s.shotFrom.p, s.shotFrom.p1, u)
      ctl.target.lerpVectors(s.shotFrom.t, s.shotFrom.t1, u)
      if (u >= 1) s.shotFrom = null
    }
    if (ctl) ctl.autoRotate = !s.shotFrom && now - s.idleSince > 10

    if (now - s.lastLabels > 0.25) {
      s.lastLabels = now
      setLabels(slots.map((sl) => ({ used: sl.used, side: sl.side, price: sl.price, qty: sl.qty })))
      setHead({ spread: book.bestAsk && book.bestBid ? book.bestAsk - book.bestBid : 0, bid: book.bestBid, ask: book.bestAsk, orders: book.orders })
    }
  })

  const mine = useMatchRoom((s) => s.mine)
  const down = useRef<{ x: number; y: number } | null>(null)
  const slotOf = (id: number | undefined) => (id === undefined ? null : slots[id]?.used ? slots[id] : null)

  return (
    <>
      <Environment files="/hdri/shanghai_bund.hdr" background backgroundIntensity={0.035} backgroundBlurriness={0.06} environmentIntensity={0.35} />
      <fog attach="fog" args={['#05070c', 60, 300]} />
      <hemisphereLight args={['#6d7fa8', '#0a0806', 0.12]} />
      <pointLight ref={flash} intensity={0} distance={40} decay={1.4} />

      <OrbitControls
        ref={controls}
        makeDefault
        target={[0, 10, -35]}
        enableDamping
        dampingFactor={0.06}
        minDistance={6}
        maxDistance={200}
        maxPolarAngle={1.52}
        autoRotateSpeed={0.3}
        onStart={() => ((st.current.idleSince = Infinity), (st.current.shotFrom = null))}
        onEnd={() => (st.current.idleSince = performance.now() / 1000)}
      />

      {/* The avenue: wet asphalt, reflecting every lit floor. */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, -150]}>
        <planeGeometry args={[80, 420]} />
        {lowTier ? (
          <meshStandardMaterial {...asphalt} roughnessMap={puddles} color="#3e424c" metalness={0.55} roughness={0.9} envMapIntensity={3} />
        ) : (
          <MeshReflectorMaterial
            {...asphalt}
            roughnessMap={puddles}
            color="#3e424c"
            resolution={512}
            blur={[200, 60]}
            mixBlur={0.7}
            mixStrength={6}
            mixContrast={1.15}
            mirror={0.9}
            metalness={0.4}
            roughness={1}
            depthScale={0.5}
            minDepthThreshold={0.2}
            maxDepthThreshold={1.6}
          />
        )}
      </mesh>
      {/* The pavements the towers stand on, and the dashed line down the middle of the spread. */}
      {[-1, 1].map((sd) => (
        <mesh key={sd} position={[sd * (AVE / 2 + 12), CURB / 2, -150]}>
          <boxGeometry args={[24, CURB, 420]} />
          <meshStandardMaterial color="#15171c" roughness={0.8} />
        </mesh>
      ))}
      {Array.from({ length: 40 }, (_, i) => (
        <mesh key={i} rotation-x={-Math.PI / 2} position={[0, 0.02, 20 - i * 8]}>
          <planeGeometry args={[0.18, 3.2]} />
          <meshBasicMaterial color="#d8d2c4" toneMapped={false} transparent opacity={0.55} />
        </mesh>
      ))}
      {/* The spread, written on the street between the best bid and the best ask. */}
      <Text font={FONT_MONO} fontSize={0.9} letterSpacing={0.2} rotation-x={-Math.PI / 2} position={[0, 0.03, 7]} anchorX="center" anchorY="middle">
        {`SPREAD ${head.spread ? price(head.spread) : '—'}`}
        <meshBasicMaterial color="#efe6d8" toneMapped={false} transparent opacity={0.8} />
      </Text>
      <Text font={FONT_MONO} fontSize={0.6} letterSpacing={0.2} rotation-x={-Math.PI / 2} position={[-3, 0.03, 9.4]} anchorX="center" anchorY="middle">
        {`${pt ? 'COMPRA' : 'BID'} ${head.bid ? price(head.bid) : '—'}`}
        <meshBasicMaterial color="#ffb36b" toneMapped={false} transparent opacity={0.85} />
      </Text>
      <Text font={FONT_MONO} fontSize={0.6} letterSpacing={0.2} rotation-x={-Math.PI / 2} position={[3, 0.03, 9.4]} anchorX="center" anchorY="middle">
        {`${pt ? 'VENDA' : 'ASK'} ${head.ask ? price(head.ask) : '—'}`}
        <meshBasicMaterial color="#3ef0e6" toneMapped={false} transparent opacity={0.85} />
      </Text>

      {/* The towers. A click places a limit order at that tower's price, on its side. */}
      <instancedMesh
        ref={cores}
        args={[undefined, undefined, SLOTS * 2]}
        frustumCulled={false}
        onPointerDown={(e) => (down.current = { x: e.clientX, y: e.clientY })}
        onClick={(e) => {
          e.stopPropagation()
          const d = down.current
          if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) return
          const sl = slotOf(e.instanceId)
          if (!sl) return
          sfx('click', panFor(e.point, camera), 0.7)
          void placeOrder(sl.side === 0 ? 'BUY' : 'SELL', 'LIMIT', sl.price, 5)
        }}
        onPointerMove={(e) => (e.stopPropagation(), (document.body.style.cursor = slotOf(e.instanceId) ? 'pointer' : ''))}
        onPointerOut={() => (document.body.style.cursor = '')}
      >
        <boxGeometry />
        <meshStandardMaterial color="#07090d" metalness={0.85} roughness={0.22} envMapIntensity={1.4} />
      </instancedMesh>
      <instancedMesh ref={bands} args={[undefined, undefined, SLOTS * 2 * MAXF]} frustumCulled={false} raycast={() => null}>
        <boxGeometry />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      {slots.map((_, i) => {
        const l = labels[i]
        const own = mine && l.used && mine.price === l.price && (mine.side === 'BUY') === (l.side === 0)
        return (
          <group key={i} ref={(g) => void (labelGroups.current[i] = g!)} visible={false}>
            <Billboard>
              <Text font={FONT_MONO} fontSize={1.25} anchorX="center" anchorY="bottom">
                {l.used ? price(l.price) : ''}
                <meshBasicMaterial color={l.side === 0 ? '#ffd2a0' : '#9ff8f2'} toneMapped={false} fog={false} />
              </Text>
              <Text font={FONT_MONO} fontSize={0.5} letterSpacing={0.15} anchorX="center" anchorY="top" position={[0, -0.25, 0]}>
                {`${l.qty} ${pt ? (l.qty === 1 ? 'lote' : 'lotes') : l.qty === 1 ? 'lot' : 'lots'}`}
                <meshBasicMaterial color="#a9a197" toneMapped={false} fog={false} />
              </Text>
              {own && (
                <Text font={FONT_MONO} fontSize={0.62} letterSpacing={0.12} anchorX="center" anchorY="bottom" position={[0, 1.7, 0]}>
                  {pt ? `▼ SUA ORDEM · ${mine.qty} · ${mine.ahead} à frente` : `▼ YOUR ORDER · ${mine.qty} · ${mine.ahead} ahead`}
                  <meshBasicMaterial color="#ffffff" toneMapped={false} fog={false} />
                </Text>
              )}
            </Billboard>
          </group>
        )
      })}

      {bolts.map((b, i) => (
        <primitive key={i} object={b.line} />
      ))}
      <instancedMesh ref={sparks} args={[undefined, undefined, SPARKS]} frustumCulled={false} raycast={() => null}>
        <sphereGeometry args={[1, 6, 4]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <mesh ref={runner} visible={false}>
        <sphereGeometry args={[1, 16, 12]} />
        <meshBasicMaterial toneMapped={false} />
      </mesh>

      {/* The Disruptor's ring buffer, turning over the far end of the avenue. */}
      <instancedMesh ref={ringSlots} args={[undefined, undefined, RING_N]} frustumCulled={false} raycast={() => null}>
        <boxGeometry />
        <meshBasicMaterial toneMapped={false} fog={false} />
      </instancedMesh>
      <mesh position={RING_AT}>
        <torusGeometry args={[RING_R, 0.08, 6, 128]} />
        <meshBasicMaterial color="#3a4658" toneMapped={false} fog={false} />
      </mesh>
      <mesh ref={consumer}>
        <boxGeometry args={[0.5, 2.6, 0.5]} />
        <meshBasicMaterial color={new Color('#ffffff').multiplyScalar(3)} toneMapped={false} fog={false} />
      </mesh>
      <mesh ref={producer}>
        <boxGeometry args={[0.35, 1.6, 0.35]} />
        <meshBasicMaterial color={new Color('#ffb36b').multiplyScalar(2.5)} toneMapped={false} fog={false} />
      </mesh>
      <Text font={FONT_SERIF} fontSize={3.2} position={[RING_AT.x, RING_AT.y + 1.6, RING_AT.z]} anchorX="center" anchorY="middle">
        {pt ? '1 thread' : '1 thread'}
        <meshBasicMaterial color="#efe6d8" toneMapped={false} fog={false} />
      </Text>
      <Text font={FONT_MONO} fontSize={0.95} letterSpacing={0.18} position={[RING_AT.x, RING_AT.y - 2, RING_AT.z]} anchorX="center" anchorY="middle" textAlign="center">
        {pt ? `0 LOCKS · RING BUFFER DO DISRUPTOR\n${head.orders.toLocaleString('pt-BR')} ORDENS` : `0 LOCKS · DISRUPTOR RING BUFFER\n${head.orders.toLocaleString('en-US')} ORDERS`}
        <meshBasicMaterial color="#8fa0b8" toneMapped={false} fog={false} />
      </Text>
    </>
  )
}

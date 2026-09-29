import { Billboard, Environment, Text } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Color, DoubleSide, InstancedMesh, MathUtils, Mesh, MeshBasicMaterial, Object3D, Vector3 } from 'three'
import { panFor, sfx } from '../../../film/audio'
import { useFilm } from '../../../film/store'
import { FONT_MONO, FONT_SERIF } from '../../shared'
import { RoomCamera, preloadPbr, since, useClickGuard, useEntry, usePbr, v3, type Shot } from '../shared'
import { ACCOUNTS, Ledger, TOTAL, cents, newKey, type Tone } from './sim'
import { useLedgerRoom } from './state'

// SALA · LEDGER (ROTEIRO §0.3). Through the LEDGER door: a bank vault. The
// round armoured door stands open; the walls are safe-deposit boxes. In the
// middle, the ledger of event-sourced-ledger (./sim.ts): eight accounts as
// stacks of gold coins round a pit where SYSTEM's balance goes below the
// floor, so that everything, SYSTEM included, sums to zero, and says so over
// the pit. Every transfer is a coin that leaves one stack (debit, the source
// locked) and lands on another (credit), and every step is written on the
// event wall. The visitor can run the repository's concurrency test (1000
// transfers at once, the total never moves), replay an idempotency key, break
// a transfer halfway and watch the saga give the money back, or pick two
// accounts and move money between them.

preloadPbr('rusty_painted_metal', 'concrete_floor_worn_001')

const RING = 8.5
const COIN = 2500
const COIN_H = 0.13
const MAX_COINS = 150
const WALL_R = 22
const WALL_H = 12
const GOLD = new Color('#d8a946')
const acct = (i: number) => {
  const a = (i / ACCOUNTS) * Math.PI * 2 + Math.PI / ACCOUNTS
  return v3(Math.sin(a) * RING, 0, Math.cos(a) * RING)
}
const ACCTS = Array.from({ length: ACCOUNTS }, (_, i) => acct(i))
const PLINTH = 0.9
/** Where the event wall hangs: on the vault's left, facing the ledger. */
const EW = (-100 * Math.PI) / 180
const onWall = (r: number, y: number) => v3(Math.sin(EW) * r, y, Math.cos(EW) * r)

const SHOTS: Shot[] = [
  [v3(0, 8.5, 18.5), v3(0, 3, 0)],
  [v3(6, 3.2, 12), v3(-2, 3, -2)],
  [v3(0, 11.4, 10), v3(0, 0, -1)],
  [onWall(5, 7.4), onWall(WALL_R - 1, 6.4)],
]

const TONE: Record<Tone, string> = { ok: '#7dffa8', warn: '#ffd36b', bad: '#ff6a5a', dim: '#8e9aa8' }

export default function LedgerRoom() {
  const camera = useThree((s) => s.camera)
  const pt = useFilm((s) => s.lang) === 'pt'
  const entry = useEntry()
  const guard = useClickGuard()
  const ledger = useMemo(() => new Ledger(), [])
  const floor = usePbr('concrete_floor_worn_001', 10)
  const metal = usePbr('rusty_painted_metal', 2)

  const coins = useRef<InstancedMesh>(null!)
  const flying = useRef<InstancedMesh>(null!)
  const debt = useRef<InstancedMesh>(null!)
  const boxes = useRef<InstancedMesh>(null!)
  const locks = useRef<(Mesh | null)[]>([])
  const sumGlow = useRef<MeshBasicMaterial>(null!)
  const door = useRef<Object3D>(null!)
  const o = useMemo(() => new Object3D(), [])
  const tmp = useMemo(() => new Vector3(), [])
  const [view, setView] = useState({ bal: ledger.bal.slice(), events: ledger.events.slice(0, 16), total: TOTAL, system: -TOTAL, inflight: 0 })
  const st = useRef({ cmd: 0, lastView: 0, lastClink: 0, sel: -1 })

  // The safe-deposit boxes round the wall, once.
  const boxCount = 11 * 80
  useLayoutEffect(() => {
    let n = 0
    for (let r = 0; r < 11; r++)
      for (let c = 0; c < 80; c++) {
        const a = (c / 80) * Math.PI * 2
        // Leave the door's opening (behind the camera's first shot, to the right) and the event wall free.
        const deg = ((a * 180) / Math.PI + 360) % 360
        const hidden = (deg > 70 && deg < 110 && r < 9) || (deg > 243 && deg < 277 && r > 1 && r < 10)
        o.position.set(Math.sin(a) * (WALL_R - 0.3), 0.6 + r * 1.05, Math.cos(a) * (WALL_R - 0.3))
        o.rotation.set(0, a, 0)
        o.scale.set(hidden ? 0 : 1.62, hidden ? 0 : 0.96, 0.4)
        o.updateMatrix()
        boxes.current.setMatrixAt(n, o.matrix)
        boxes.current.setColorAt(n, new Color().setHSL(0.1, 0.12, 0.2 + ((r * 7 + c * 13) % 5) * 0.015))
        n++
      }
    boxes.current.instanceMatrix.needsUpdate = true
    if (boxes.current.instanceColor) boxes.current.instanceColor.needsUpdate = true
  }, [o])

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05)
    const now = performance.now() / 1000
    const s = st.current
    const t = since(entry)
    // The door swings open as the curtain lifts.
    door.current.rotation.y = -MathUtils.lerp(0, 1.25, MathUtils.smootherstep(t, 0.2, 3.2))

    const cmd = useLedgerRoom.getState().cmd
    if (cmd.n !== s.cmd) {
      s.cmd = cmd.n
      if (cmd.kind === 'storm') {
        ledger.storm(1000)
        useLedgerRoom.setState({ note: pt ? '1000 transferências disparadas de uma vez, cada uma com a sua chave' : '1000 transfers fired at once, each with its own key' })
      } else if (cmd.kind === 'replay') {
        // The same request twice, with the same Idempotency-Key: the money moves once.
        const key = newKey()
        const src = ledger.bal.indexOf(Math.max(...ledger.bal))
        const dst = (src + 3) % ACCOUNTS
        ledger.transfer(src, dst, 5000, key, { dur: 1.6 })
        setTimeout(() => ledger.transfer(src, dst, 5000, key), 450)
        useLedgerRoom.setState({ note: pt ? `a mesma transferência duas vezes, com a chave ${key}: o dinheiro se move uma vez só` : `the same transfer twice, with key ${key}: the money moves once` })
      } else if (cmd.kind === 'fail') {
        const src = ledger.bal.indexOf(Math.max(...ledger.bal))
        const dst = (src + 4) % ACCOUNTS
        ledger.transfer(src, dst, 8000, newKey(), { fail: true, dur: 1.8 })
        useLedgerRoom.setState({ note: pt ? `A${src + 1} foi debitada, o crédito em A${dst + 1} vai falhar: a saga devolve o dinheiro` : `A${src + 1} was debited, the credit to A${dst + 1} will fail: the saga gives the money back` })
      }
    }

    ledger.step(dt, (f) => {
      if (now - s.lastClink > 0.09) {
        s.lastClink = now
        sfx(f.fail && !f.back ? 'zap' : 'click', panFor(ACCTS[f.back ? f.src : f.dst], camera), f.fail ? 0.7 : 0.18)
      }
    })

    // The stacks: one coin per R$ 25.
    let n = 0
    const lift = MathUtils.smootherstep(t, 0.4, 2.4)
    for (let i = 0; i < ACCOUNTS; i++) {
      const c = Math.min(MAX_COINS, Math.round((ledger.bal[i] / COIN) * lift))
      const p = ACCTS[i]
      for (let k = 0; k < MAX_COINS; k++) {
        const on = k < c
        o.position.set(p.x + Math.sin(k * 2.3) * 0.04, PLINTH + k * COIN_H + COIN_H / 2, p.z + Math.cos(k * 1.7) * 0.04)
        o.rotation.set(0, k * 0.7, 0)
        o.scale.setScalar(on ? 1 : 0)
        o.updateMatrix()
        coins.current.setMatrixAt(n++, o.matrix)
      }
      const lk = locks.current[i]
      if (lk) {
        const k = now - ledger.lockedAt[i]
        lk.visible = k < 0.35
        lk.position.y = PLINTH + c * COIN_H + 1
      }
    }
    coins.current.instanceMatrix.needsUpdate = true

    // Coins in flight: an arc from the top of one stack to the top of the other (or back again).
    ledger.flights.slice(0, 200).forEach((f, i) => {
      const a = ACCTS[f.back ? f.dst : f.src]
      const b = ACCTS[f.back ? f.src : f.dst]
      const ha = PLINTH + Math.min(MAX_COINS, ledger.bal[f.back ? f.dst : f.src] / COIN) * COIN_H + 0.3
      const hb = PLINTH + Math.min(MAX_COINS, ledger.bal[f.back ? f.src : f.dst] / COIN) * COIN_H + 0.3
      const u = Math.min(1, f.t)
      // A failing credit stops short of the destination, at the barrier, then turns back.
      const reach = f.fail && !f.back ? 0.86 : 1
      tmp.lerpVectors(a, b, u * reach)
      o.position.set(tmp.x, MathUtils.lerp(ha, hb, u) + Math.sin(u * Math.PI) * (3 + (f.id % 5) * 0.5), tmp.z)
      o.rotation.set(u * 9, f.id, u * 5)
      o.scale.setScalar(1)
      o.updateMatrix()
      flying.current.setMatrixAt(i, o.matrix)
      flying.current.setColorAt(i, f.back ? new Color('#ff8a6a') : f.fail ? new Color('#ffd36b') : GOLD)
    })
    for (let i = Math.min(200, ledger.flights.length); i < 200; i++) {
      o.scale.setScalar(0)
      o.updateMatrix()
      flying.current.setMatrixAt(i, o.matrix)
    }
    flying.current.instanceMatrix.needsUpdate = true
    if (flying.current.instanceColor) flying.current.instanceColor.needsUpdate = true

    // SYSTEM's balance, below the floor: a column of dark coins going down into the pit.
    const dc = Math.round((-ledger.system / COIN / 4) * lift)
    for (let k = 0; k < 120; k++) {
      o.position.set(0, -0.3 - k * COIN_H * 1.1, 0)
      o.rotation.set(0, k * 0.5, 0)
      o.scale.set(1.3, 1, 1.3).multiplyScalar(k < dc ? 1 : 0)
      o.updateMatrix()
      debt.current.setMatrixAt(k, o.matrix)
    }
    debt.current.instanceMatrix.needsUpdate = true

    // The invariant, breathing green over the pit.
    const balanced = ledger.total + ledger.system === 0
    // A statement that tried to make money out of nothing: the sign flashes red while it refuses it.
    const refusing = performance.now() / 1000 - useLedgerRoom.getState().refusedAt < 1.6
    sumGlow.current.color.set(balanced && !refusing ? '#7dffa8' : '#ff6a5a').multiplyScalar(refusing ? 2.4 + Math.sin(now * 30) * 0.8 : 1.6 + Math.sin(now * 2) * 0.25)

    if (now - s.lastView > 0.12) {
      s.lastView = now
      setView({ bal: ledger.bal.slice(), events: ledger.events.slice(0, 16), total: ledger.total, system: ledger.system, inflight: ledger.inFlight })
      const b = ledger.batchState
      useLedgerRoom.setState({ stats: { total: ledger.total, system: ledger.system, events: ledger.seq, published: ledger.published, batch: b ? `${b.done}/${b.total}` : null } })
    }
  })

  const sel = useLedgerRoom((q) => q.sel)
  const pick = (i: number) => (e: { stopPropagation(): void; clientX: number; clientY: number }) => {
    e.stopPropagation()
    if (!guard.isClick(e)) return
    const cur = useLedgerRoom.getState().sel
    if (cur < 0 || cur === i) {
      useLedgerRoom.setState({ sel: cur === i ? -1 : i, note: cur === i ? null : pt ? `origem A${i + 1}: agora clique na conta de destino` : `source A${i + 1}: now click the destination account` })
      sfx('click', panFor(ACCTS[i], camera), 0.5)
      return
    }
    const amt = Math.min(ledger.bal[cur], 10000)
    const r = ledger.transfer(cur, i, amt, newKey(), { dur: 1.4 })
    useLedgerRoom.setState({
      sel: -1,
      note: r === 'started' ? (pt ? `A${cur + 1} → A${i + 1}: ${cents(amt)}, debitado; o crédito chega a seguir` : `A${cur + 1} → A${i + 1}: ${cents(amt)}, debited; the credit follows`) : pt ? `A${cur + 1} não tem saldo: TransferFailed` : `A${cur + 1} has no funds: TransferFailed`,
    })
  }

  return (
    <>
      <Environment files="/hdri/studio_small_09.hdr" environmentIntensity={0.45} />
      <color attach="background" args={['#050506']} />
      <fog attach="fog" args={['#050506', 30, 70]} />
      <hemisphereLight args={['#b8a888', '#100c08', 0.18]} />
      {/* A cold light from the open door; a warm one over the ledger. */}
      <spotLight position={[0, WALL_H - 0.5, 0]} angle={0.9} penumbra={0.8} intensity={420} distance={30} decay={1.4} color="#ffe2b8" />
      <pointLight position={[WALL_R - 2, 5, 0]} intensity={120} distance={30} decay={1.6} color="#bcd0ff" />

      <RoomCamera shots={SHOTS} fov={46} minDistance={3} maxDistance={20.5} maxPolarAngle={1.5} />

      {/* The floor, with the pit for SYSTEM's side in the middle, under glass. */}
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <ringGeometry args={[2.2, WALL_R, 64, 1]} />
        <meshStandardMaterial {...floor} color="#5a5650" metalness={0.3} roughness={0.8} />
      </mesh>
      <mesh position={[0, -8, 0]}>
        <cylinderGeometry args={[2.2, 2.2, 16, 48, 1, true]} />
        <meshStandardMaterial color="#0d0c0b" side={DoubleSide} metalness={0.6} roughness={0.5} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.02, 0]}>
        <circleGeometry args={[2.2, 48]} />
        <meshPhysicalMaterial color="#9fb4c8" transmission={0.9} roughness={0.05} thickness={0.2} transparent opacity={0.25} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.03, 0]}>
        <ringGeometry args={[2.2, 2.45, 64]} />
        <meshStandardMaterial color="#8a7440" metalness={1} roughness={0.3} />
      </mesh>
      <instancedMesh ref={debt} args={[undefined, undefined, 120]} frustumCulled={false}>
        <cylinderGeometry args={[0.55, 0.55, COIN_H, 24]} />
        <meshStandardMaterial color="#3a1814" metalness={0.9} roughness={0.35} />
      </instancedMesh>

      {/* The invariant: Σ = 0, SYSTEM included. */}
      <Billboard position={[0, 6.2, 0]}>
        <Text font={FONT_SERIF} fontSize={1.5} anchorX="center" anchorY="bottom">
          {`Σ = ${(view.total + view.system).toLocaleString('pt-BR')}`}
          <meshBasicMaterial ref={sumGlow} toneMapped={false} />
        </Text>
        <Text font={FONT_MONO} fontSize={0.3} letterSpacing={0.14} anchorX="center" anchorY="top" position={[0, -0.15, 0]} textAlign="center">
          {pt
            ? `contas + em voo = ${view.total.toLocaleString('pt-BR')}\nSYSTEM = ${view.system.toLocaleString('pt-BR')}${view.inflight ? `\nem voo agora: ${view.inflight.toLocaleString('pt-BR')}` : ''}`
            : `accounts + in flight = ${view.total.toLocaleString('en-US')}\nSYSTEM = ${view.system.toLocaleString('en-US')}${view.inflight ? `\nin flight now: ${view.inflight.toLocaleString('en-US')}` : ''}`}
          <meshBasicMaterial color="#c8bfae" toneMapped={false} />
        </Text>
      </Billboard>

      {/* The accounts: a plinth, its stack of coins, its name and balance, and a padlock while it's locked. */}
      {ACCTS.map((p, i) => (
        <group key={i}>
          <mesh position={[p.x, PLINTH / 2, p.z]} castShadow receiveShadow onPointerDown={guard.onPointerDown} onClick={pick(i)} onPointerOver={() => (document.body.style.cursor = 'pointer')} onPointerOut={() => (document.body.style.cursor = '')}>
            <cylinderGeometry args={[0.95, 1.1, PLINTH, 32]} />
            <meshStandardMaterial color={sel === i ? '#3a3220' : '#1b1917'} metalness={0.7} roughness={0.35} emissive={sel === i ? '#6a5020' : '#000'} />
          </mesh>
          {/* An invisible column over the stack, so the coins themselves can be clicked too. */}
          <mesh position={[p.x, PLINTH + 5, p.z]} visible={false} onPointerDown={guard.onPointerDown} onClick={pick(i)}>
            <cylinderGeometry args={[0.8, 0.8, 10, 8]} />
          </mesh>
          <mesh ref={(m) => void (locks.current[i] = m)} position={[p.x, 3, p.z]} visible={false}>
            <torusGeometry args={[0.22, 0.06, 6, 16, Math.PI]} />
            <meshBasicMaterial color={new Color('#ffd36b').multiplyScalar(2)} toneMapped={false} />
          </mesh>
          <Billboard position={[p.x * 1.18, 0.35, p.z * 1.18]}>
            <Text font={FONT_MONO} fontSize={0.34} letterSpacing={0.1} anchorX="center" anchorY="bottom">
              {`A${i + 1}`}
              <meshBasicMaterial color={sel === i ? '#ffd36b' : '#efe6d8'} toneMapped={false} />
            </Text>
            <Text font={FONT_MONO} fontSize={0.24} anchorX="center" anchorY="top" position={[0, -0.05, 0]}>
              {cents(view.bal[i])}
              <meshBasicMaterial color="#d8a946" toneMapped={false} />
            </Text>
          </Billboard>
        </group>
      ))}
      <instancedMesh ref={coins} args={[undefined, undefined, ACCOUNTS * MAX_COINS]} frustumCulled={false} castShadow raycast={() => null}>
        <cylinderGeometry args={[0.55, 0.55, COIN_H * 0.92, 28]} />
        <meshStandardMaterial color={GOLD} metalness={1} roughness={0.28} envMapIntensity={1.4} />
      </instancedMesh>
      <instancedMesh ref={flying} args={[undefined, undefined, 200]} frustumCulled={false} raycast={() => null}>
        <cylinderGeometry args={[0.45, 0.45, COIN_H, 20]} />
        <meshStandardMaterial metalness={1} roughness={0.25} emissive="#3a2a08" />
      </instancedMesh>

      {/* The vault: its wall of safe-deposit boxes, and the ceiling. */}
      <mesh position={[0, WALL_H / 2, 0]}>
        <cylinderGeometry args={[WALL_R, WALL_R, WALL_H, 80, 1, true]} />
        <meshStandardMaterial {...metal} color="#2a2724" side={DoubleSide} metalness={0.6} roughness={0.6} />
      </mesh>
      <mesh position={[0, WALL_H, 0]} rotation-x={Math.PI / 2}>
        <circleGeometry args={[WALL_R, 64]} />
        <meshStandardMaterial color="#141312" side={DoubleSide} />
      </mesh>
      <instancedMesh ref={boxes} args={[undefined, undefined, boxCount]} raycast={() => null}>
        <boxGeometry />
        <meshStandardMaterial metalness={0.85} roughness={0.35} envMapIntensity={1.2} />
      </instancedMesh>

      {/* The armoured door, open on its hinge in the wall to the right. */}
      <group position={[WALL_R - 0.4, 4.6, -3.2]}>
        <group ref={door}>
          <group position={[0, 0, 3.2]} rotation-y={Math.PI / 2}>
            <mesh rotation-x={Math.PI / 2}>
              <cylinderGeometry args={[3.6, 3.6, 1.4, 64]} />
              <meshStandardMaterial {...metal} color="#8d8a84" metalness={0.9} roughness={0.35} />
            </mesh>
            {Array.from({ length: 16 }, (_, k) => {
              const a = (k / 16) * Math.PI * 2
              return (
                <mesh key={k} position={[Math.cos(a) * 3.4, Math.sin(a) * 3.4, 0]} rotation-z={a + Math.PI / 2}>
                  <cylinderGeometry args={[0.16, 0.16, 1.2, 12]} />
                  <meshStandardMaterial color="#c9c4ba" metalness={1} roughness={0.2} />
                </mesh>
              )
            })}
            {[0, 1, 2].map((k) => (
              <mesh key={k} position={[0, 0, -0.95]} rotation-z={(k * Math.PI) / 3}>
                <boxGeometry args={[2.6, 0.12, 0.12]} />
                <meshStandardMaterial color="#d8d2c6" metalness={1} roughness={0.2} />
              </mesh>
            ))}
            <mesh position={[0, 0, -0.9]} rotation-x={Math.PI / 2}>
              <cylinderGeometry args={[0.35, 0.35, 0.3, 24]} />
              <meshStandardMaterial color="#d8d2c6" metalness={1} roughness={0.2} />
            </mesh>
          </group>
        </group>
        <mesh position={[0, 0, 0]}>
          <cylinderGeometry args={[0.35, 0.35, 6.6, 16]} />
          <meshStandardMaterial color="#6d6a64" metalness={0.9} roughness={0.3} />
        </mesh>
      </group>
      <mesh position={[WALL_R - 0.25, 4.6, 0]} rotation-y={-Math.PI / 2}>
        <ringGeometry args={[3.7, 4.3, 64]} />
        <meshStandardMaterial color="#6d6a64" metalness={0.9} roughness={0.3} side={DoubleSide} />
      </mesh>

      {/* The event store, written on the far wall as it happens; the outbox relays each line to Kafka. */}
      <group position={onWall(WALL_R - 0.6, 6.2)} rotation-y={EW + Math.PI}>
        <mesh>
          <planeGeometry args={[15, 9.6]} />
          <meshStandardMaterial color="#07090b" metalness={0.2} roughness={0.4} />
        </mesh>
        <Text font={FONT_MONO} fontSize={0.34} letterSpacing={0.18} position={[-7, 4.3, 0.02]} anchorX="left" anchorY="top">
          {pt ? 'EVENT STORE · SÓ ACRESCENTA, NUNCA APAGA' : 'EVENT STORE · APPEND-ONLY'}
          <meshBasicMaterial color="#d8a946" toneMapped={false} />
        </Text>
        {view.events.map((e, i) => (
          <Text key={e.seq} font={FONT_MONO} fontSize={0.27} position={[-7, 3.5 - i * 0.48, 0.02]} anchorX="left" anchorY="top" maxWidth={14.2}>
            {e.text}
            <meshBasicMaterial color={new Color(TONE[e.tone]).multiplyScalar(i === 0 ? 1.6 : 1)} toneMapped={false} transparent opacity={1 - i * 0.045} />
          </Text>
        ))}
        <Text font={FONT_MONO} fontSize={0.24} letterSpacing={0.14} position={[7, -4.5, 0.02]} anchorX="right" anchorY="bottom">
          {pt ? 'outbox transacional → kafka' : 'transactional outbox → kafka'}
          <meshBasicMaterial color="#8e9aa8" toneMapped={false} />
        </Text>
      </group>
    </>
  )
}

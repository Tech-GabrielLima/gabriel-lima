import { Billboard, Environment, OrbitControls, Text, useGLTF } from '@react-three/drei'
import { useFrame, useLoader, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  AdditiveBlending,
  Color,
  DataTexture,
  EquirectangularReflectionMapping,
  Group,
  InstancedMesh,
  MathUtils,
  Object3D,
  PerspectiveCamera,
  ShaderMaterial,
  Vector3,
} from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js'
import { panFor, sfx } from '../../../film/audio'
import { useCurtain } from '../../../film/curtain'
import { useFilm } from '../../../film/store'
import { live, useLive } from '../../../live/live'
import { Cluster } from '../../alley/installations/raft'
import { Ocean } from '../../crossing/Ocean'
import { Stars } from '../../moon/Sky'
import { FONT_MONO, FONT_SERIF } from '../../shared'
import { LANTERN_Y, Lighthouse, useLighthouseMaps } from './Lighthouse'
import { useRaftRoom } from './state'
import { TabIsland } from './TabIsland'

// SALA · RAFT (ROTEIRO §2, Cena 03 · v3). Through the RAFT door: an
// archipelago at night, five lighthouses on five islands, and each one is a
// real node of raft-kv-store running on the live server. The leader's lens
// turns and sweeps the sea; the followers' lenses face it. Heartbeats run
// over the water from leader to followers; every new committed entry leaves
// the leader as a ring of light and settles on each tower. Click a lighthouse
// and that node really goes down, for everyone on the site; the others notice
// the silence, elect a new leader, and the new term is written in the sky.
// Without the server, a local election simulation drives the same show.
// And in the middle of the ring, on an island of its own, the visitor's
// cluster: every tab with this room open is a node of a real Raft (./tabs.ts).

// Already light (a few thousand triangles each): one version for every tier.
const M = (n: string) => `/models/${n}.glb`
const MODELS = ['coast_land_rocks_03', 'coast_rocks_05', 'island_tree_02', 'lateral_sea_marker'].map(M)
for (const u of MODELS) useGLTF.preload(u)
const SKY = '/hdri/kloppenheim_02_puresky.hdr'
useLoader.preload(RGBELoader, SKY)
const SKY_GAIN = 0.05
/** The moon sits behind whoever is looking at the archipelago, so its glitter doesn't scatter across the near water. */
const SKY_ROT = 2.2 + Math.PI

/** The ring of islands: centre, radius, and each island's lighthouse base. */
const RING = 48
const N = 5
const ISLANDS = Array.from({ length: N }, (_, i) => {
  const a = -Math.PI / 2 + Math.PI / N + (i / N) * Math.PI * 2
  return { a, pos: new Vector3(Math.cos(a) * RING, 0, Math.sin(a) * RING), base: 3.5 }
})
const LANTERNS = ISLANDS.map((s) => new Vector3(s.pos.x, s.base + LANTERN_Y, s.pos.z))
/** Director's shots: camera position and target. */
const SHOT_AT = (k: number, leader: number, aspect: number): [Vector3, Vector3] => {
  const [p, t] = shotAt(k, leader)
  // A portrait screen is narrow: step back so the archipelago still fits across it.
  return [t.clone().lerp(p, portraitFit(aspect)), t]
}
/** How much further back the camera stands on a narrow (portrait) screen. */
const portraitFit = (aspect: number) => MathUtils.clamp(0.95 / aspect, 1, 1.5)
const shotAt = (k: number, leader: number): [Vector3, Vector3] => {
  if (k === 2 && leader >= 0) {
    const l = LANTERNS[leader]
    const out = new Vector3(l.x, 0, l.z).normalize()
    return [new Vector3(l.x + out.x * 26 + out.z * 12, l.y - 6, l.z + out.z * 26 - out.x * 12), l.clone()]
  }
  if (k === 3) return [new Vector3(0, 125, 34), new Vector3(0, 0, 0)]
  if (k === 4) return [new Vector3(34, 2.4, 66), new Vector3(0, 13, 0)]
  return [new Vector3(0, 21, 108), new Vector3(0, 11, 0)]
}

type NodeView = { up: boolean; leader: boolean; term: number; commit: number; healIn: number }

const o = new Object3D()
const NO_LANTERN = new Vector3(0, -1e4, 0)
const tmp = new Vector3()
const PULSES = 48
const RINGS = 40

/** A bank of fog, soft-edged and drifting, that a downed node disappears into. */
function mistMaterial() {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    fog: false,
    uniforms: { uO: { value: 0 }, uTime: { value: 0 } },
    vertexShader: /* glsl */ `varying vec2 vUv; varying float vD;
      void main() { vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vD = -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `
      uniform float uO; uniform float uTime; varying vec2 vUv; varying float vD;
      float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
      void main() {
        vec2 c = vUv - 0.5;
        float r = length(c * vec2(1.0, 1.7));
        float cloud = n(vUv * 4.0 + vec2(uTime * 0.05, 0.0)) * 0.6 + n(vUv * 9.0 - uTime * 0.03) * 0.4;
        // Wisps, not a disc: the noise carves the bank, and it thins out as the camera walks into it.
        float a = smoothstep(0.5, 0.12, r) * smoothstep(0.3, 0.75, cloud) * smoothstep(12.0, 40.0, vD) * uO;
        gl_FragColor = vec4(vec3(0.24, 0.29, 0.37), a * 0.55);
      }`,
  })
}

/** The water's answer to each lamp: a long shimmering column of light towards the viewer. */
function reflectionMaterial() {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    fog: false,
    uniforms: { uI: { value: 0 }, uTime: { value: 0 } },
    vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uI; uniform float uTime; varying vec2 vUv;
      float h(float x) { return fract(sin(x * 91.7) * 43758.5); }
      void main() {
        float across = abs(vUv.x - 0.5) * 2.0;
        float along = vUv.y;                                   // 0 at the island, 1 towards the viewer
        float band = floor(along * 60.0);
        float ripple = 0.55 + 0.45 * sin(band * 1.7 + uTime * 2.3 + h(band) * 6.0);
        float width = 0.25 + along * 0.6;
        float a = smoothstep(width, 0.0, across) * pow(1.0 - along, 1.4) * ripple;
        gl_FragColor = vec4(vec3(1.0, 0.8, 0.5) * a * uI * 0.9, 1.0);
      }`,
  })
}

export default function RaftRoom() {
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const lang = useFilm((s) => s.lang)
  const [rock, stones, tree, marker] = useGLTF(MODELS)
  const sky = useLoader(RGBELoader, SKY) as DataTexture
  sky.mapping = EquirectangularReflectionMapping
  const maps = useLighthouseMaps()
  const controls = useRef<OrbitControlsImpl>(null)

  // The islands, cloned from the three rock scans and the tree.
  const islands = useMemo(
    () =>
      ISLANDS.map((_, i) => ({
        rock: rock.scene.clone(true),
        stones: [0, 1, 2].map(() => stones.scene.clone(true)),
        tree: i % 2 === 0 ? tree.scene.clone(true) : null,
      })),
    [rock, stones, tree],
  )
  useLayoutEffect(() => {
    for (const isl of islands) for (const g of [isl.rock, ...isl.stones, isl.tree]) g?.traverse((c) => ((c.castShadow = true), (c.receiveShadow = true)))
  }, [islands])

  // Each lighthouse's live state, read by its own frame loop (no React re-render per frame).
  const lamps = useMemo(() => ISLANDS.map(() => ({ lit: { current: 0 }, leader: { current: false }, heading: { current: 0 } })), [])

  // The camera is the visitor's here: a longer lens and a longer reach than the film's.
  useLayoutEffect(() => {
    const prev = { fov: camera.fov, far: camera.far }
    const [p, t] = SHOT_AT(1, -1, camera.aspect)
    camera.position.copy(p)
    camera.fov = camera.aspect < 1 ? 52 : 42
    camera.far = 900
    camera.lookAt(t)
    camera.updateProjectionMatrix()
    return () => {
      camera.fov = prev.fov
      camera.far = prev.far
      camera.updateProjectionMatrix()
    }
  }, [camera])

  // Without the server, the same show runs on a local election simulation.
  const sim = useMemo(() => new Cluster(N), [])
  const [labels, setLabels] = useState<NodeView[]>(() => ISLANDS.map(() => ({ up: true, leader: false, term: 0, commit: 0, healIn: 0 })))
  const st = useRef({
    entry: -1,
    sweep: 0,
    leader: -1,
    term: 0,
    lastBeat: 0,
    commits: [] as number[],
    termShown: -1,
    termAt: -99,
    shotFrom: null as null | { p: Vector3; t: Vector3; p1: Vector3; t1: Vector3; at: number },
    lastLabels: 0,
    idleSince: 0,
    bottles: 0,
  })

  // Pulses (heartbeats, and the visitor's message) and replication rings, pooled.
  const pulses = useRef<InstancedMesh>(null!)
  const pulseData = useMemo(() => Array.from({ length: PULSES }, () => ({ from: new Vector3(), to: new Vector3(), t: 1, speed: 1.4, size: 0.35, fizzle: false })), [])
  const rings = useRef<InstancedMesh>(null!)
  const ringData = useMemo(() => Array.from({ length: RINGS }, () => ({ at: new Vector3(), t: 1, delay: 0 })), [])
  const reflections = useMemo(() => ISLANDS.map(() => reflectionMaterial()), [])
  const reflGroups = useRef<Group[]>([])
  const mists = useMemo(() => ISLANDS.map(() => mistMaterial()), [])

  const launch = (from: Vector3, to: Vector3, speed: number, size: number, fizzle: boolean) => {
    const p = pulseData.find((x) => x.t >= 1)
    if (!p) return
    p.from.copy(from)
    p.to.copy(to)
    p.t = 0
    p.speed = speed
    p.size = size
    p.fizzle = fizzle
  }
  const ring = (at: Vector3, delay: number) => {
    const r = ringData.find((x) => x.t >= 1)
    if (!r) return
    r.at.copy(at)
    r.t = 0
    r.delay = delay
  }

  useEffect(() => () => void (document.body.style.cursor = ''), [])

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05)
    // One clock for everything here (the controls' events use it too).
    const now = performance.now() / 1000
    void state
    const s = st.current

    // The entrance: dark while the curtain is down; then the lamps come on one by one, the leader last.
    const phase = useCurtain.getState().phase
    if (s.entry < 0 && (phase === 'opening' || phase === 'open')) s.entry = now

    // Who's who: the live cluster, or the local simulation.
    const L = useLive.getState()
    const liveRaft = L.status === 'live' ? L.state?.raft : undefined
    if (!liveRaft) sim.step(dt)
    const view: NodeView[] = liveRaft
      ? liveRaft.nodes.map((n, i) => ({ up: n.up, leader: n.up && i === liveRaft.leader, term: n.term, commit: n.commit, healIn: liveRaft.healAt[i] ? Math.max(0, Math.ceil((liveRaft.healAt[i] - L.state!.t) / 1000)) : 0 }))
      : sim.nodes.map((n) => ({ up: n.role !== 'down', leader: n.role === 'leader', term: n.term, commit: 0, healIn: 0 }))
    const leader = view.findIndex((v) => v.leader)
    const term = leader >= 0 ? view[leader].term : Math.max(...view.map((v) => v.term))

    // A new leader: every lamp flares, and the new term is written in the sky.
    if (leader >= 0 && leader !== s.leader && s.entry >= 0 && now - s.entry > 3) {
      s.termShown = term
      s.termAt = now
      useRaftRoom.setState({ elected: { leader, term, at: performance.now() } })
      sfx('bell', panFor(LANTERNS[leader], camera), 0.9)
    }
    s.leader = leader
    s.term = term

    // The lens: the leader's sweeps the sea; followers face the leader; with no leader they search.
    s.sweep += dt * 0.55
    view.forEach((v, i) => {
      const order = (leader >= 0 ? (i - leader + N) % N : i) // the leader lights last
      const ignite = s.entry < 0 ? 0 : MathUtils.clamp((now - s.entry - 0.6 - ((order + N - 1) % N) * 0.42) / 0.35, 0, 1)
      if (ignite > 0 && ignite < 1 && lamps[i].lit.current === 0) sfx('click', panFor(LANTERNS[i], camera), 0.5)
      const target = (v.up ? 1 : 0) * ignite
      const lamp = lamps[i]
      lamp.lit.current += (target - lamp.lit.current) * Math.min(1, dt * (target > lamp.lit.current ? 10 : 3))
      lamp.leader.current = v.leader
      const want = v.leader ? s.sweep + i : leader >= 0 ? Math.atan2(-(LANTERNS[leader].z - LANTERNS[i].z), LANTERNS[leader].x - LANTERNS[i].x) : Math.sin(now * 0.9 + i * 2) * 2.2
      const d = Math.atan2(Math.sin(want - lamp.heading.current), Math.cos(want - lamp.heading.current))
      lamp.heading.current += d * Math.min(1, dt * (v.leader ? 20 : 2.5))
      const m = mists[i].uniforms
      m.uO.value += ((v.up ? 0 : 0.85) - m.uO.value) * Math.min(1, dt * 1.2)
      m.uTime.value = now
      const r = reflections[i]
      r.uniforms.uI.value = lamp.lit.current * (v.leader ? 1 : 0.45)
      r.uniforms.uTime.value = now
      const g = reflGroups.current[i]
      if (g) g.rotation.y = Math.atan2(camera.position.x - ISLANDS[i].pos.x, camera.position.z - ISLANDS[i].pos.z)
    })

    // Heartbeats: the leader, twice a second, to every follower (a downed one never answers).
    if (leader >= 0 && now - s.lastBeat > 0.5 && s.entry >= 0 && now - s.entry > 3) {
      s.lastBeat = now
      view.forEach((v, i) => i !== leader && launch(LANTERNS[leader], LANTERNS[i], 1.25, 0.32, !v.up))
    }
    // Replication: each new committed entry rings the leader, then every follower that's up.
    view.forEach((v, i) => {
      const was = s.commits[i] ?? v.commit
      if (v.commit > was && v.up) ring(LANTERNS[i], i === leader ? 0 : 0.55)
      s.commits[i] = v.commit
    })
    // The visitor's message: thrown from the camera to the leader, then replicated.
    const bottles = useRaftRoom.getState().bottles
    if (bottles !== s.bottles) {
      s.bottles = bottles
      if (leader >= 0) {
        tmp.copy(camera.position).add(new Vector3(0, -2, 0))
        launch(tmp, LANTERNS[leader], 0.8, 0.7, false)
        if (!liveRaft) setTimeout(() => view.forEach((v, i) => v.up && ring(LANTERNS[i], i === leader ? 0 : 0.55)), 1200)
      }
    }

    // Draw the pulses along low arcs over the water, and the rings rising round the lanterns.
    pulseData.forEach((p, i) => {
      if (p.t < 1) p.t = Math.min(1, p.t + dt * p.speed)
      const t = p.t
      const alive = t < 1 && !(p.fizzle && t > 0.82)
      tmp.lerpVectors(p.from, p.to, t)
      tmp.y += Math.sin(t * Math.PI) * 7
      o.position.copy(tmp)
      o.scale.setScalar(alive ? p.size * (p.fizzle && t > 0.7 ? (0.82 - t) * 8 : 1) : 0)
      o.updateMatrix()
      pulses.current.setMatrixAt(i, o.matrix)
    })
    pulses.current.instanceMatrix.needsUpdate = true
    ringData.forEach((r, i) => {
      if (r.t < 1) {
        if (r.delay > 0) r.delay -= dt
        else r.t = Math.min(1, r.t + dt * 0.8)
      }
      const on = r.t < 1 && r.delay <= 0
      o.position.set(r.at.x, r.at.y - 2 + r.t * 5, r.at.z)
      o.rotation.set(Math.PI / 2, 0, 0)
      o.scale.setScalar(on ? 1 + r.t * 3 : 0)
      o.updateMatrix()
      rings.current.setMatrixAt(i, o.matrix)
      rings.current.setColorAt(i, new Color('#ffcf8a').multiplyScalar(on ? (1 - r.t) * 2.2 : 0))
    })
    rings.current.instanceMatrix.needsUpdate = true
    if (rings.current.instanceColor) rings.current.instanceColor.needsUpdate = true


    // Director's shots: fly there smoothly; any drag cancels.
    const shot = useRaftRoom.getState().shot
    const c = controls.current
    if (shot && c) {
      const [p1, t1] = SHOT_AT(shot, leader, camera.aspect)
      s.shotFrom = { p: camera.position.clone(), t: c.target.clone(), p1, t1, at: now }
      useRaftRoom.setState({ shot: 0 })
    }
    if (s.shotFrom && c) {
      const u = MathUtils.smootherstep(Math.min(1, (now - s.shotFrom.at) / 2.2), 0, 1)
      camera.position.lerpVectors(s.shotFrom.p, s.shotFrom.p1, u)
      c.target.lerpVectors(s.shotFrom.t, s.shotFrom.t1, u)
      if (u >= 1) s.shotFrom = null
    }
    // Left alone, the camera drifts slowly round the archipelago, like a film's establishing shot.
    if (c) c.autoRotate = !s.shotFrom && now - s.idleSince > 9

    // The labels change a few times a second at most.
    if (now - s.lastLabels > 0.25) {
      s.lastLabels = now
      setLabels(view)
    }
  })

  const hover = useRaftRoom((s) => s.hover)
  const down = useRef<{ x: number; y: number } | null>(null)
  const pt = lang === 'pt'

  return (
    <>
      <Environment map={sky} background backgroundRotation={[0, SKY_ROT, 0]} environmentRotation={[0, SKY_ROT, 0]} environmentIntensity={SKY_GAIN * 2} backgroundIntensity={SKY_GAIN} />
      <fog attach="fog" args={['#060a14', 80, 230]} />
      <ambientLight intensity={0.05} color="#8fa6d8" />
      {/* The moon, low behind the archipelago: a cold key light on the rocks. */}
      <directionalLight position={[-60, 40, -120]} intensity={0.35} color="#b8c8ff" />
      <Stars count={2200} radius={420} />
      <group position={[0, 0, 60]}>
        {/* The crossing's sea. Its ripples around a hand-held lantern don't belong here (the lamps have their own reflections), so that light is sent far below. */}
        <Ocean sky={sky} skyRotation={-SKY_ROT} skyGain={SKY_GAIN} lantern={NO_LANTERN} />
      </group>

      <OrbitControls
        ref={controls}
        makeDefault
        target={[0, 11, 0]}
        enableDamping
        dampingFactor={0.06}
        minDistance={14}
        maxDistance={150}
        maxPolarAngle={1.5}
        minPolarAngle={0.12}
        autoRotateSpeed={0.35}
        onStart={() => ((st.current.idleSince = Infinity), (st.current.shotFrom = null))}
        onEnd={() => (st.current.idleSince = performance.now() / 1000)}
      />

      {ISLANDS.map((isl, i) => {
        const v = labels[i]
        return (
          <group key={i} position={isl.pos}>
            {/* The island: a rock scan scaled to an islet, smaller rocks round it, a tree on some. */}
            <primitive object={islands[i].rock} position={[0, -0.9, 0]} scale={3.3} rotation-y={isl.a * 2.3} />
            {islands[i].stones.map((g, k) => (
              <primitive key={k} object={g} position={[Math.cos(k * 2.1 + i) * 14, -0.6, Math.sin(k * 2.1 + i) * 11]} scale={1.8 + k * 0.4} rotation-y={k * 1.3 + i} />
            ))}
            {islands[i].tree && <primitive object={islands[i].tree} position={[-7, 2.4, -3]} scale={1.6} />}
            <group
              position={[0, isl.base, 0]}
              onPointerDown={(e) => (down.current = { x: e.clientX, y: e.clientY })}
              onClick={(e) => {
                e.stopPropagation()
                const d = down.current
                if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) return
                sfx(v.up ? 'zap' : 'click', panFor(LANTERNS[i], camera), 0.8)
                if (useLive.getState().status === 'live') void live.toggleNode(i)
                else sim.toggle(i)
              }}
              onDoubleClick={(e) => {
                e.stopPropagation()
                const l = LANTERNS[i]
                const out = new Vector3(l.x, 0, l.z).normalize()
                st.current.shotFrom = { p: camera.position.clone(), t: controls.current!.target.clone(), p1: new Vector3(l.x + out.x * 22, l.y - 4, l.z + out.z * 22), t1: l.clone(), at: performance.now() / 1000 }
              }}
              onPointerOver={(e) => (e.stopPropagation(), (document.body.style.cursor = 'pointer'), useRaftRoom.setState({ hover: i }))}
              onPointerOut={() => ((document.body.style.cursor = ''), useRaftRoom.setState({ hover: -1 }))}
            >
              <Lighthouse maps={maps} seed={i * 1.7} {...lamps[i]} />
            </group>
            {/* Its light on the water, turned towards whoever is looking. */}
            <group ref={(g) => void (reflGroups.current[i] = g!)} position={[0, 0.25, 0]}>
              <mesh rotation-x={-Math.PI / 2} position={[0, 0, 22]} material={reflections[i]} renderOrder={1}>
                <planeGeometry args={[9, 44]} />
              </mesh>
            </group>
            {/* A node that's down disappears into the fog. */}
            <Billboard position={[0, 10, 0]}>
              <mesh material={mists[i]} renderOrder={5}>
                <planeGeometry args={[46, 30]} />
              </mesh>
              <mesh material={mists[i]} position={[6, -4, 2]} renderOrder={5}>
                <planeGeometry args={[34, 20]} />
              </mesh>
            </Billboard>
            {/* Its name and state, floating above the lantern. */}
            <Billboard position={[0, isl.base + LANTERN_Y + 5.5, 0]}>
              <Text font={FONT_SERIF} fontSize={hover === i ? 2.4 : 2} anchorX="center" anchorY="bottom">
                N{i + 1}
                <meshBasicMaterial color={v.leader ? '#ffd9a0' : v.up ? '#e8e0d4' : '#ff6a5a'} toneMapped={false} fog={false} />
              </Text>
              <Text font={FONT_MONO} fontSize={0.62} letterSpacing={0.12} anchorX="center" anchorY="top" position={[0, -0.3, 0]}>
                {!v.up
                  ? `${pt ? '✕ FORA' : '✕ DOWN'}${v.healIn ? ` · ${pt ? 'volta em' : 'back in'} ${v.healIn}s` : ''}`
                  : `${v.leader ? (pt ? 'LÍDER' : 'LEADER') : pt ? 'SEGUIDOR' : 'FOLLOWER'} · ${pt ? 'mandato' : 'term'} ${v.term}${v.commit ? ` · commit ${v.commit}` : ''}`}
                <meshBasicMaterial color={v.leader ? '#ffb36b' : '#a9a197'} toneMapped={false} fog={false} />
              </Text>
            </Billboard>
          </group>
        )
      })}

      {/* In the middle, the visitor's own cluster: one small lighthouse per open tab of this room (./tabraft.ts). */}
      <TabIsland rock={rock.scene} />

      {/* A sea marker between the islands, and a buoy's bell now and then. */}
      <primitive object={marker.scene} position={[10, -0.4, 22]} scale={1.2} />

      <instancedMesh ref={pulses} args={[undefined, undefined, PULSES]} frustumCulled={false} renderOrder={6}>
        <sphereGeometry args={[1, 12, 10]} />
        <meshBasicMaterial color="#ffe0b0" toneMapped={false} fog={false} />
      </instancedMesh>
      <instancedMesh ref={rings} args={[undefined, undefined, RINGS]} frustumCulled={false} renderOrder={6}>
        <torusGeometry args={[1.6, 0.06, 6, 48]} />
        <meshBasicMaterial toneMapped={false} fog={false} transparent blending={AdditiveBlending} depthWrite={false} />
      </instancedMesh>

    </>
  )
}


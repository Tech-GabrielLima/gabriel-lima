import { Billboard, Text } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { AdditiveBlending, CatmullRomCurve3, Color, DoubleSide, InstancedMesh, MathUtils, Object3D, Shape, ShapeGeometry, ShaderMaterial, TubeGeometry, Vector3 } from 'three'
import { sfx } from '../../../film/audio'
import { useFilm } from '../../../film/store'
import { FONT_MONO, FONT_SERIF } from '../../shared'
import { RoomCamera, preloadPbr, since, useEntry, usePbr, v3, type Shot } from '../shared'
import { BENCH, ERROR, STAGES, useHaleRoom } from './state'

// SALA · HALE (ROTEIRO §0.3). Through the HALE door: a gothic nave, and the
// compiler is its glass. Seven lancet windows down the left aisle are hale's
// pipeline, in the README's order (lexer → parser → AST → type checker → IR
// lowering → optimizer → wave executor); a compile lights them one by one,
// each showing what that stage makes of the README's own `Dashboard` program.
// At the end of the nave the rose window is the program's dependency graph.
// Running it sends its requests up the nave as beams of light: one after
// another, or, as the optimiser schedules them, all the independent ones in a
// single wave, with the README's benchmark (6 fetches at 100 ms a hop). Take
// the error handling out and the type checker's window turns red with the
// repository's real compile error, and nothing after it lights.

preloadPbr('plastered_stone_wall', 'concrete_floor_worn_001')

const NAVE = 7
const AISLE = 12
const BAYS = 7
const BAY = 9
const Z0 = -2
const ROSE_Z = Z0 - BAYS * BAY - 3
const ROSE_Y = 15
const VIOLET = new Color('#c77dff')
const STAGE_COLORS = ['#6b8cff', '#46c8ff', '#3ef0c0', '#9dff6b', '#ffd36b', '#ff9a4f', '#c77dff']
const REQS = BENCH.fetches
/** The beams are slowed down tenfold, so 100 ms reads as a second; the numbers shown are the real ones. */
const SLOW = 10

const SHOTS: Shot[] = [
  [v3(4.5, 5.5, 15), v3(-3.5, 8, -40)],
  [v3(3, 5, Z0 - 20), v3(-AISLE + 0.5, 8, Z0 - 26)],
  [v3(0, 26, Z0 - 30), v3(0, 0, Z0 - 31)],
  [v3(0, 9, ROSE_Z + 22), v3(0, ROSE_Y, ROSE_Z)],
]

const winZ = (i: number) => Z0 - BAY / 2 - i * BAY

/** A lancet: a tall window with a pointed top. */
function lancet(w: number, h: number) {
  const s = new Shape()
  s.moveTo(-w / 2, 0)
  s.lineTo(w / 2, 0)
  s.lineTo(w / 2, h - w * 0.8)
  s.quadraticCurveTo(w / 2, h - w * 0.1, 0, h)
  s.quadraticCurveTo(-w / 2, h - w * 0.1, -w / 2, h - w * 0.8)
  s.lineTo(-w / 2, 0)
  return s
}

/** Stained glass: coloured cells in lead, glowing when lit; red when the stage has failed. */
function glass(color: string, radial = false) {
  return new ShaderMaterial({
    side: DoubleSide,
    toneMapped: false,
    uniforms: { uColor: { value: new Color(color) }, uLit: { value: 0 }, uErr: { value: 0 }, uTime: { value: 0 } },
    vertexShader: /* glsl */ `varying vec2 vP; void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uLit, uErr, uTime; varying vec2 vP;
      vec2 h2(vec2 p) { return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453); }
      void main() {
        vec2 p = vP * 1.6;
        ${radial ? 'float r = length(vP); float a = atan(vP.y, vP.x); p = vec2(a * 2.6, r * 1.2);' : ''}
        vec2 i = floor(p), f = fract(p);
        float d1 = 8.0, d2 = 8.0; vec2 id;
        for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
          vec2 g = vec2(x, y); vec2 o = h2(i + g);
          float d = length(g + o - f);
          if (d < d1) { d2 = d1; d1 = d; id = i + g; } else if (d < d2) d2 = d;
        }
        float lead = smoothstep(0.04, 0.09, d2 - d1);
        vec2 rnd = h2(id);
        vec3 c = uColor * (0.6 + rnd.x * 0.8);
        c = mix(c, c.gbr, rnd.y * 0.25);
        c = mix(c, vec3(1.0, 0.18, 0.12), uErr);
        ${radial ? 'float r2 = length(vP); lead *= smoothstep(0.03, 0.12, abs(fract(r2 * 0.45) - 0.5)); lead *= smoothstep(0.02, 0.1, abs(sin(atan(vP.y, vP.x) * 8.0)));' : ''}
        float glow = 0.05 + uLit * (1.4 + 0.12 * sin(uTime * 2.0 + rnd.x * 6.28));
        gl_FragColor = vec4(c * glow * lead + vec3(0.01) * (1.0 - lead), 1.0);
      }`,
  })
}

/** A shaft of coloured light from a window, slanting down onto the nave floor. */
function shaft(color: string) {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: { uColor: { value: new Color(color) }, uO: { value: 0 } },
    vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `uniform vec3 uColor; uniform float uO; varying vec2 vUv;
      void main() { float a = smoothstep(0.0, 0.25, vUv.x) * smoothstep(1.0, 0.6, vUv.x) * (1.0 - vUv.y * 0.7) * smoothstep(0.0, 0.2, vUv.y) * smoothstep(1.0, 0.8, vUv.y) * uO * 0.18; gl_FragColor = vec4(uColor * a, 1.0); }`,
  })
}

/** What each stage makes of the program, written over its window. */
const STAGE_TEXT: Record<'en' | 'pt', string[]> = {
  pt: [
    'flow · Dashboard · ( · user · : · String · ) · -> · User · { · fetch · GitHub · /users/{user} · -> · u · : · Result<User, NotFound> · …',
    'flow Dashboard(user) -> User\n{ fetch · fetch · fetch · match }',
    'Flow Dashboard\n├ Fetch u\n├ Fetch repos\n├ Fetch followers\n└ Match u',
    'u : Result<User, NotFound>\nmatch u: Ok ✓  Err(NotFound) ✓\ntodo erro tratado',
    '%0 = fetch /users/{user}\n%1 = fetch …/repos\n%2 = fetch …/followers\n%3 = match %0',
    '%0, %1, %2 não dependem\num do outro\n→ wave 1 ‖ 3 requests\n→ wave 2: match',
    'tokio + reqwest\nwave 1: 3 em paralelo\nwave 2: match u',
  ],
  en: [
    'flow · Dashboard · ( · user · : · String · ) · -> · User · { · fetch · GitHub · /users/{user} · -> · u · : · Result<User, NotFound> · …',
    'flow Dashboard(user) -> User\n{ fetch · fetch · fetch · match }',
    'Flow Dashboard\n├ Fetch u\n├ Fetch repos\n├ Fetch followers\n└ Match u',
    'u : Result<User, NotFound>\nmatch u: Ok ✓  Err(NotFound) ✓\nevery error handled',
    '%0 = fetch /users/{user}\n%1 = fetch …/repos\n%2 = fetch …/followers\n%3 = match %0',
    '%0, %1, %2 don’t depend\non each other\n→ wave 1 ‖ 3 requests\n→ wave 2: match',
    'tokio + reqwest\nwave 1: 3 in parallel\nwave 2: match u',
  ],
}

export default function HaleRoom() {
  const lang = useFilm((s) => s.lang)
  const pt = lang === 'pt'
  const entry = useEntry()
  const stone = usePbr('plastered_stone_wall', 2, 3)
  const floorMap = usePbr('concrete_floor_worn_001', 6, 24)
  const stage = useHaleRoom((s) => s.stage)
  const broken = useHaleRoom((s) => s.broken)

  const windows = useMemo(() => STAGE_COLORS.map((c) => glass(c)), [])
  const shafts = useMemo(() => STAGE_COLORS.map((c) => shaft(c)), [])
  const rightGlass = useMemo(() => Array.from({ length: BAYS }, () => glass('#5a6c9a')), [])
  const rose = useMemo(() => glass('#c77dff', true), [])
  const roseShaft = useMemo(() => shaft('#c77dff'), [])
  const lancetGeo = useMemo(() => new ShapeGeometry(lancet(3.2, 8.5)), [])

  // The nave's stonework: clustered piers, pointed arches along it, ribs across the vault.
  const arches = useMemo(() => {
    const out: TubeGeometry[] = []
    const pointed = (a: Vector3, b: Vector3, rise: number) => {
      const mid = a.clone().lerp(b, 0.5)
      mid.y += rise
      const q1 = a.clone().lerp(mid, 0.5).add(v3(0, rise * 0.55, 0))
      const q2 = b.clone().lerp(mid, 0.5).add(v3(0, rise * 0.55, 0))
      return new TubeGeometry(new CatmullRomCurve3([a, q1, mid, q2, b]), 24, 0.22, 6)
    }
    for (let i = 0; i <= BAYS; i++) {
      const z = Z0 - i * BAY
      out.push(pointed(v3(-NAVE, 11, z), v3(NAVE, 11, z), 7))
      if (i < BAYS) {
        for (const sx of [-1, 1]) out.push(pointed(v3(sx * NAVE, 7, z), v3(sx * NAVE, 7, z - BAY), 4))
        out.push(pointed(v3(-NAVE, 11, z), v3(NAVE, 11, z - BAY), 7.5), pointed(v3(NAVE, 11, z), v3(-NAVE, 11, z - BAY), 7.5))
      }
    }
    return out
  }, [])

  const beams = useRef<InstancedMesh>(null!)
  const o = useMemo(() => new Object3D(), [])
  const st = useRef({ compile: 0, compileAt: -99, run: 0, runAt: -99, mode: 'waves' as 'serial' | 'waves', rang: -1, doneNote: false, lit: new Array(7).fill(0), roseLit: 0 })

  useFrame(() => {
    const now = performance.now() / 1000
    const s = st.current
    const t = since(entry)
    const room = useHaleRoom.getState()

    // A compile: one stage every 0.8 s; with the error handling out, it stops, in red, at the type checker.
    if (room.compile !== s.compile) {
      s.compile = room.compile
      s.compileAt = now
      s.rang = -1
    }
    const k = s.compileAt > 0 ? Math.floor((now - s.compileAt) / 0.8) : -1
    const reach = room.broken ? Math.min(k, 3) : Math.min(k, 6)
    if (reach !== s.rang && reach >= 0 && s.compileAt > 0) {
      s.rang = reach
      sfx(room.broken && reach === 3 ? 'zap' : 'bell', undefined, room.broken && reach === 3 ? 0.7 : 0.25 + reach * 0.03)
      useHaleRoom.setState({ stage: reach })
      if (reach === 6 && !room.broken) useHaleRoom.setState({ note: pt ? 'compilado: 3 requests independentes, agendadas numa só onda' : 'compiled: 3 independent requests, scheduled in a single wave' })
      if (room.broken && reach === 3) useHaleRoom.setState({ note: ERROR })
    }
    // Before any compile, the windows glow faintly with the moon; after, each by its stage.
    const intro = MathUtils.smoothstep(t, 0.3, 2.5)
    windows.forEach((w, i) => {
      const on = s.compileAt > 0 && i <= reach ? 1 : 0
      const failed = room.broken && i === 3 && on ? 1 : 0
      s.lit[i] += ((on ? 1 : 0.12 * intro) - s.lit[i]) * 0.08
      w.uniforms.uLit.value = s.lit[i]
      w.uniforms.uErr.value += (failed - w.uniforms.uErr.value) * 0.1
      w.uniforms.uTime.value = now
      shafts[i].uniforms.uO.value = s.lit[i]
    })
    rightGlass.forEach((w) => ((w.uniforms.uLit.value = 0.1 * intro), (w.uniforms.uTime.value = now)))

    // A run: the six requests as beams up the nave to the rose window and back.
    if (room.run.n !== s.run) {
      s.run = room.run.n
      s.runAt = now
      s.mode = room.run.mode
      s.doneNote = false
      sfx('click', undefined, 0.5)
    }
    const hop = (BENCH.serial / REQS / 1000) * SLOW
    const el = now - s.runAt
    for (let r = 0; r < REQS; r++) {
      const start = s.mode === 'serial' ? r * hop : 0
      const dur = s.mode === 'serial' ? hop : (BENCH.parallel / 1000) * SLOW
      const u = (el - start) / dur
      const on = u >= 0 && u <= 1 && s.runAt > 0
      // Out and back: the request goes up the nave, the response comes down.
      const w = u < 0.5 ? u * 2 : 2 - u * 2
      const x = (r - (REQS - 1) / 2) * 1.1
      o.position.set(x, 1.4 + w * (ROSE_Y - 2) * 0.6, MathUtils.lerp(4, ROSE_Z + 2, w))
      o.scale.set(on ? 0.25 : 0, on ? 0.25 : 0, on ? 3.5 : 0)
      o.updateMatrix()
      beams.current.setMatrixAt(r, o.matrix)
    }
    beams.current.instanceMatrix.needsUpdate = true
    const total = s.mode === 'serial' ? hop * REQS : (BENCH.parallel / 1000) * SLOW
    const running = s.runAt > 0 && el < total
    s.roseLit += ((running ? 1 : 0.15 * intro) - s.roseLit) * 0.06
    rose.uniforms.uLit.value = s.roseLit
    rose.uniforms.uTime.value = now
    roseShaft.uniforms.uO.value = s.roseLit
    if (s.runAt > 0 && el >= total && !s.doneNote) {
      s.doneNote = true
      const ms = s.mode === 'serial' ? BENCH.serial : BENCH.parallel
      useHaleRoom.setState({
        note: pt
          ? `${REQS} fetches a 100 ms por salto: ${s.mode === 'serial' ? 'em série' : 'em ondas'} ${ms.toLocaleString('pt-BR')} ms (benchmark do README; em série 620,1 ms, em ondas 104,7 ms, ${BENCH.speedup.toLocaleString('pt-BR')}×)`
          : `${REQS} fetches at 100 ms a hop: ${s.mode === 'serial' ? 'serially' : 'in waves'} ${ms} ms (the README’s benchmark: serial 620.1 ms, waves 104.7 ms, ${BENCH.speedup}×)`,
      })
    }
  })

  return (
    <>
      <color attach="background" args={['#040308']} />
      <fog attach="fog" args={['#07060c', 20, 95]} />
      <hemisphereLight args={['#5a5a8a', '#0c0a08', 0.22]} />
      <pointLight position={[0, 14, -30]} intensity={220} distance={80} decay={1.4} color="#b8a8ff" />
      <pointLight position={[0, 4, 6]} intensity={60} distance={30} decay={1.6} color="#ffd9a0" />

      <RoomCamera shots={SHOTS} fov={50} minDistance={3} maxDistance={60} maxPolarAngle={1.55} />

      {/* The floor, the walls of the aisles, the vault. */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, (Z0 + ROSE_Z) / 2 + 6]}>
        <planeGeometry args={[AISLE * 2, BAYS * BAY + 22]} />
        <meshStandardMaterial {...floorMap} color="#7d7870" roughness={0.75} metalness={0.1} />
      </mesh>
      {[-1, 1].map((sx) => (
        <mesh key={sx} position={[sx * AISLE, 8, (Z0 + ROSE_Z) / 2]} rotation-y={-sx * (Math.PI / 2)}>
          <planeGeometry args={[BAYS * BAY + 10, 16]} />
          <meshStandardMaterial {...stone} color="#6d665c" side={DoubleSide} />
        </mesh>
      ))}
      <mesh position={[0, 11, ROSE_Z]}>
        <planeGeometry args={[AISLE * 2, 24]} />
        <meshStandardMaterial {...stone} color="#5e584f" />
      </mesh>
      {arches.map((g, i) => (
        <mesh key={i} geometry={g}>
          <meshStandardMaterial {...stone} color="#8a8276" />
        </mesh>
      ))}
      {Array.from({ length: (BAYS + 1) * 2 }, (_, i) => {
        const sx = i % 2 ? 1 : -1
        const z = Z0 - Math.floor(i / 2) * BAY
        return (
          <group key={i} position={[sx * NAVE, 0, z]}>
            <mesh position={[0, 5.5, 0]}>
              <cylinderGeometry args={[0.6, 0.7, 11, 16]} />
              <meshStandardMaterial {...stone} color="#8a8276" />
            </mesh>
            {[0, 1, 2, 3].map((k) => (
              <mesh key={k} position={[Math.cos((k * Math.PI) / 2) * 0.6, 5.5, Math.sin((k * Math.PI) / 2) * 0.6]}>
                <cylinderGeometry args={[0.2, 0.22, 11, 8]} />
                <meshStandardMaterial {...stone} color="#958d80" />
              </mesh>
            ))}
            <mesh position={[0, 0.3, 0]}>
              <boxGeometry args={[1.8, 0.6, 1.8]} />
              <meshStandardMaterial {...stone} color="#6d665c" />
            </mesh>
          </group>
        )
      })}

      {/* Left aisle: the pipeline's seven windows, each with its stage and what it made. */}
      {STAGES.map((sg, i) => (
        <group key={sg.id} position={[-AISLE + 0.05, 4, winZ(i)]} rotation-y={Math.PI / 2}>
          <mesh geometry={lancetGeo} material={windows[i]} />
          <Text font={FONT_MONO} fontSize={0.34} letterSpacing={0.2} position={[0, 9.4, 0.05]} anchorX="center" anchorY="bottom">
            {`${i + 1} · ${sg[lang].toUpperCase()}`}
            <meshBasicMaterial color={new Color(broken && i === 3 && stage >= 3 ? '#ff6a5a' : STAGE_COLORS[i]).multiplyScalar(stage >= i ? 1.8 : 0.5)} toneMapped={false} />
          </Text>
          {/* A plaque under the window: what this stage made of the program. */}
          <mesh position={[0, -2.1, 0.03]}>
            <planeGeometry args={[4.2, 3.4]} />
            <meshStandardMaterial color="#0b0a10" roughness={0.6} metalness={0.3} />
          </mesh>
          <Text font={FONT_MONO} fontSize={0.19} lineHeight={1.5} position={[0, -2.1, 0.06]} anchorX="center" anchorY="middle" maxWidth={3.9} textAlign="center">
            {broken && i === 3 && stage >= 3 ? ERROR.split('\n')[0].replace('error: ', '') : stage >= i && !(broken && i > 3) ? STAGE_TEXT[lang][i] : ''}
            <meshBasicMaterial color={broken && i === 3 ? '#ff8a7a' : new Color(STAGE_COLORS[i]).lerp(new Color('#ffffff'), 0.55)} toneMapped={false} />
          </Text>
          {/* Its light, falling across the nave. */}
          <mesh material={shafts[i]} position={[0, 0.5, 5.5]} rotation-x={-1.05}>
            <planeGeometry args={[3.4, 12]} />
          </mesh>
        </group>
      ))}
      {/* Right aisle: plain glass, lit by the night. */}
      {rightGlass.map((m, i) => (
        <group key={i} position={[AISLE - 0.05, 4, winZ(i)]} rotation-y={-Math.PI / 2}>
          <mesh geometry={lancetGeo} material={m} />
        </group>
      ))}

      {/* The rose window: the program's dependency graph. */}
      <group position={[0, ROSE_Y, ROSE_Z + 0.05]}>
        <mesh material={rose}>
          <circleGeometry args={[8, 96]} />
        </mesh>
        <mesh position={[0, 0, 0.02]}>
          <ringGeometry args={[7.8, 8.6, 96]} />
          <meshStandardMaterial {...stone} color="#8a8276" />
        </mesh>
        {/* The flow at the hub, its three fetches round it, the match below. */}
        <Text font={FONT_SERIF} fontSize={1} position={[0, 0.2, 0.1]} anchorX="center" anchorY="middle">
          Dashboard
          <meshBasicMaterial color="#ffffff" toneMapped={false} />
        </Text>
        {['/users/{user}', '/repos', '/followers'].map((l, i) => {
          const a = Math.PI / 2 + (i - 1) * 0.9
          return (
            <Text key={l} font={FONT_MONO} fontSize={0.42} position={[Math.cos(a) * 4.6, Math.sin(a) * 4.6, 0.1]} anchorX="center" anchorY="middle">
              {`fetch ${l}`}
              <meshBasicMaterial color={new Color('#fff2c0').multiplyScalar(1.3)} toneMapped={false} />
            </Text>
          )
        })}
        <Text font={FONT_MONO} fontSize={0.42} position={[0, -4.6, 0.1]} anchorX="center" anchorY="middle">
          {pt ? 'wave 1 ‖ 3 · wave 2: match u' : 'wave 1 ‖ 3 · wave 2: match u'}
          <meshBasicMaterial color={new Color('#ffd9ff').multiplyScalar(1.3)} toneMapped={false} />
        </Text>
        <mesh material={roseShaft} position={[0, -7.5, 9]} rotation-x={-0.95}>
          <planeGeometry args={[14, 22]} />
        </mesh>
      </group>

      {/* The requests in flight. */}
      <instancedMesh ref={beams} args={[undefined, undefined, REQS]} frustumCulled={false}>
        <boxGeometry />
        <meshBasicMaterial color={VIOLET.clone().lerp(new Color('#ffffff'), 0.4).multiplyScalar(3)} toneMapped={false} />
      </instancedMesh>

      {/* The source, on a lectern at the head of the nave. */}
      <group position={[0, 0, 7]}>
        <mesh position={[0, 0.6, 0]}>
          <cylinderGeometry args={[0.25, 0.4, 1.2, 12]} />
          <meshStandardMaterial {...stone} color="#6d665c" />
        </mesh>
        <mesh position={[0, 1.3, 0]} rotation-x={-0.5}>
          <boxGeometry args={[2.6, 0.08, 1.6]} />
          <meshStandardMaterial color="#2a1c12" roughness={0.6} />
        </mesh>
        <Billboard position={[0, 2.9, 0]}>
          <Text font={FONT_MONO} fontSize={0.13} lineHeight={1.5} anchorX="center" anchorY="middle">
            {broken ? `flow Dashboard(user: String) -> User {\n  fetch GitHub /users/{user}  -> u: Result<User, NotFound>\n  fetch GitHub /users/{user}/repos     -> repos\n  fetch GitHub /users/{user}/followers -> followers\n  u   ← ${pt ? 'sem match: o erro não é tratado' : 'no match: the error goes unhandled'}\n}` : `flow Dashboard(user: String) -> User {\n  fetch GitHub /users/{user}           -> u: Result<User, NotFound>\n  fetch GitHub /users/{user}/repos     -> repos\n  fetch GitHub /users/{user}/followers -> followers\n  match u { Ok(profile) => profile  Err(NotFound) => default_user() }\n}`}
            <meshBasicMaterial color={broken ? '#ffb0a8' : '#efe6d8'} toneMapped={false} />
          </Text>
        </Billboard>
      </group>
    </>
  )
}

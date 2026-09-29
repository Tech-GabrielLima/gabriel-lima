import { Text, useGLTF } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { BackSide, CatmullRomCurve3, Color, Group, InstancedMesh, Object3D, PointLight, Vector3 } from 'three'
import { cameraFocus } from '../../film/CameraRig'
import { FONT_MONO } from '../shared'
import { panFor, sfx } from '../../film/audio'
import { findFrame } from '../../cinema/progress'
import { useFilm } from '../../film/store'
import { anchor } from './layout'
import { asset } from '../../film/quality'

// The way out of the alley (ROTEIRO, Cena 03 → 04): a rat that flees the
// flashlight into the manhole, the cover sliding open, and a shaft down to
// black water. The camera dives through it on the chapter's last beats.
//
// Lost frame 22: go down before the camera does. Exploring, light the cover
// and click it before the film's own dive, and it slides aside for you alone:
// a look down the shaft, where a tunnel at the bottom leads off under the
// cinema, "sala de máquinas ↓" (Act III is down there).

const MANHOLE = asset('/models/water_manhole_cover.glb')
const RAT = asset('/models/street_rat.glb')
useGLTF.preload(RAT)

export const HOLE = { x: anchor('manhole').pos[0], z: anchor('manhole').pos[2], r: 0.29 }
const SHAFT = 2.6
const RAT_HOME = new Vector3(2.45, 0, -25.4)
const RAT_SPEED = 3.4 // m/s: rats are fast
/** The film's own dive starts sliding the cover at this chapter fraction. */
const DIVE = 0.9
/** How long the visitor's own look down the shaft lasts. */
const PEEK_S = 5.5
const BLUE = new Color('#5a8cff')
const WARM = new Color('#ffb36b')

interface Props {
  /** The chapter's start and duration, to know how close the cut is. */
  start: number
  dur: number
  /** Where the flashlight lands (world). */
  light: Vector3
}

const o = new Object3D()

export function Manhole({ start, dur, light }: Props) {
  const { scene } = useGLTF(MANHOLE)
  const rat = useGLTF(RAT)
  const cover = useMemo(() => scene.getObjectByName('water_manhole_cover')!, [scene])
  const ratRef = useRef<Group>(null!)
  const bubbles = useRef<InstancedMesh>(null!)
  const camera = useThree((st) => st.camera)
  const lang = useFilm((f) => f.lang)
  const water = useRef<PointLight>(null!)
  const below = useRef<Group>(null!)

  const path = useMemo(
    () => new CatmullRomCurve3([RAT_HOME.clone(), new Vector3(1.9, 0, -26.1), new Vector3(1.2, 0, -27.2), new Vector3(HOLE.x, 0, HOLE.z)]),
    [],
  )
  const st = useRef({ state: 'idle' as 'idle' | 'run' | 'gone', s: 0, lit: 0, respawn: 0, hop: 0, slid: false, coverBase: new Vector3(), holeLit: 0, peek: -1, peekSlide: 0 })
  const seeds = useMemo(() => Array.from({ length: 24 }, () => [Math.random(), Math.random(), Math.random()]), [])

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05)
    const r = st.current
    const e = state.clock.elapsedTime
    const film = useFilm.getState()
    const progress = (film.time - start) / dur
    const watch = film.mode === 'watch'
    if (!r.coverBase.lengthSq()) r.coverBase.copy(cover.position)

    // The rat: idle sniffing, flee when lit (or when the film needs it to), vanish into the drain.
    if (r.state === 'idle') {
      r.lit = light.distanceTo(RAT_HOME) < 1.4 ? r.lit + dt : Math.max(0, r.lit - dt)
      if (r.lit > 0.35 || (watch && progress > 0.86)) {
        r.state = 'run'
        r.s = 0
        sfx('squeak', panFor(RAT_HOME, camera))
        if (r.lit > 0.35) findFrame('rat')
      }
      ratRef.current.position.copy(RAT_HOME)
      ratRef.current.rotation.y = Math.PI * 0.6 + Math.sin(e * 1.3) * 0.25
      ratRef.current.position.y = Math.abs(Math.sin(e * 9)) * 0.004
    } else if (r.state === 'run') {
      r.s = Math.min(1, r.s + (dt * RAT_SPEED) / path.getLength())
      const p = path.getPointAt(r.s)
      const tan = path.getTangentAt(r.s)
      ratRef.current.position.copy(p)
      ratRef.current.position.y = Math.abs(Math.sin(e * 38)) * 0.012
      ratRef.current.rotation.y = Math.atan2(tan.x, tan.z) + Math.PI
      if (r.s >= 1) {
        r.state = 'gone'
        r.respawn = 9
        r.hop = 1 // the cover jolts as something slips under it
      }
    } else {
      ratRef.current.position.y = -1
      r.respawn -= dt
      if (r.respawn <= 0 && progress < 0.8) r.state = 'idle'
    }

    // Lost frame 22: the flashlight on the cover (remembered for a moment, so a click can follow it).
    r.holeLit = Math.hypot(light.x - HOLE.x, light.z - HOLE.z) < 0.85 && light.y < 0.3 ? 1 : Math.max(0, r.holeLit - dt)
    if (r.peek >= 0) {
      const before = r.peek
      r.peek += dt
      // Over the hole first, then straight down it (not through the asphalt), looking at the tunnel's mouth.
      const down = Math.min(1, Math.max(0, (r.peek - 1.1) / 1.4))
      const ease = down * down * (3 - 2 * down)
      cameraFocus.pos.set(HOLE.x, 1.15 - ease * 1.75, HOLE.z + 0.06 - ease * 0.02)
      cameraFocus.look.set(HOLE.x, -SHAFT + 0.2, HOLE.z - HOLE.r * ease)
      cameraFocus.fov = 50 + ease * 12
      if (before < 2.4 && r.peek >= 2.4) findFrame('manhole')
      if (r.peek > PEEK_S) {
        r.peek = -1
        cameraFocus.active = false
        sfx('scrape', panFor(r.coverBase, camera), 0.4)
      }
    }
    r.peekSlide = Math.max(0, Math.min(1, r.peekSlide + dt * (r.peek >= 0 && r.peek < PEEK_S - 0.8 ? 1.4 : -0.9)))
    below.current.visible = r.peekSlide > 0
    water.current.color.lerpColors(BLUE, WARM, r.peekSlide)
    water.current.intensity = 0.8 + r.peekSlide * 1.6

    // The cover: a jolt when the rat goes under, then slides aside for the camera's dive (or the visitor's).
    r.hop = Math.max(0, r.hop - dt * 2.5)
    const slide = Math.max(r.peekSlide, Math.min(1, Math.max(0, (progress - DIVE) / 0.05)))
    if (slide > 0 && !r.slid && r.peek < 0) sfx('scrape', panFor(r.coverBase, camera))
    r.slid = slide > 0
    const ease = slide * slide * (3 - 2 * slide)
    cover.position.set(r.coverBase.x + ease * 0.72, r.coverBase.y + Math.sin(r.hop * Math.PI * 3) * r.hop * 0.03 + ease * 0.01, r.coverBase.z + ease * 0.1)
    cover.rotation.y = ease * 0.5

    // Bubbles rising from the black water.
    seeds.forEach(([a, b, s], i) => {
      const u = (e * (0.2 + s * 0.3) + a) % 1
      o.position.set(HOLE.x + (a - 0.5) * 0.4, -SHAFT + 0.1 + u * 1.4, HOLE.z + (b - 0.5) * 0.4)
      o.scale.setScalar(0.4 + s * 0.8)
      o.updateMatrix()
      bubbles.current.setMatrixAt(i, o.matrix)
    })
    bubbles.current.instanceMatrix.needsUpdate = true
  })

  /** Only exploring, only before the film goes down itself, and only with the light on it. */
  const canPeek = () => {
    const f = useFilm.getState()
    return f.mode === 'explore' && (f.time - start) / dur < DIVE && st.current.peek < 0
  }
  const peek = () => {
    const r = st.current
    if (!canPeek() || r.holeLit <= 0) return
    r.peek = 0
    sfx('scrape', panFor(r.coverBase, camera))
    cameraFocus.pos.set(HOLE.x, 1.15, HOLE.z + 0.06)
    cameraFocus.look.set(HOLE.x, -SHAFT, HOLE.z)
    cameraFocus.fov = 50
    cameraFocus.active = true
  }

  return (
    <group>
      <primitive
        object={scene}
        position={[HOLE.x, 0, HOLE.z]}
        onClick={(e: { stopPropagation(): void }) => (e.stopPropagation(), peek())}
        onPointerOver={() => canPeek() && st.current.holeLit > 0 && (document.body.style.cursor = 'pointer')}
        onPointerOut={() => (document.body.style.cursor = '')}
      />
      <group ref={ratRef} scale={1.7}>
        <primitive object={rat.scene} />
      </group>

      {/* The shaft: wet brick going down to water. */}
      <mesh position={[HOLE.x, -SHAFT / 2, HOLE.z]}>
        <cylinderGeometry args={[HOLE.r, HOLE.r, SHAFT, 24, 1, true]} />
        <meshStandardMaterial color="#1a1512" roughness={0.35} metalness={0.2} side={BackSide} />
      </mesh>
      <mesh position={[HOLE.x, -SHAFT + 0.05, HOLE.z]} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[HOLE.r, 24]} />
        <meshStandardMaterial color="#03060a" roughness={0.08} metalness={0.9} />
      </mesh>
      <pointLight ref={water} position={[HOLE.x, -SHAFT + 0.6, HOLE.z]} color="#5a8cff" intensity={0.8} distance={2} decay={2} />

      {/* Only there when the visitor goes down alone: rungs, and a tunnel at the bottom leading under the cinema. */}
      <group ref={below} visible={false}>
        {Array.from({ length: 7 }, (_, i) => (
          <mesh key={i} position={[HOLE.x, -0.3 - i * 0.32, HOLE.z + HOLE.r - 0.035]}>
            <boxGeometry args={[0.26, 0.018, 0.018]} />
            <meshStandardMaterial color="#5a4a3a" metalness={0.7} roughness={0.5} />
          </mesh>
        ))}
        {/* The tunnel's mouth, lit from somewhere further in. */}
        <mesh position={[HOLE.x, -SHAFT + 0.32, HOLE.z - HOLE.r + 0.012]}>
          <planeGeometry args={[0.34, 0.5]} />
          <meshBasicMaterial color="#1c1006" />
        </mesh>
        <mesh position={[HOLE.x, -SHAFT + 0.1, HOLE.z - HOLE.r + 0.014]}>
          <planeGeometry args={[0.3, 0.04]} />
          <meshBasicMaterial color="#ffb36b" toneMapped={false} />
        </mesh>
        {/* An enamel sign above it, tipped up towards whoever is looking down. */}
        <group position={[HOLE.x, -SHAFT + 0.82, HOLE.z - HOLE.r + 0.06]} rotation-x={-1.0}>
          <mesh>
            <planeGeometry args={[0.44, 0.2]} />
            <meshStandardMaterial color="#e8e0cc" roughness={0.4} metalness={0.2} />
          </mesh>
          <Text font={FONT_MONO} fontSize={0.036} letterSpacing={0.08} position={[0, 0.02, 0.002]} anchorX="center" anchorY="middle">
            {lang === 'pt' ? 'SALA DE MÁQUINAS' : 'MACHINE ROOM'}
            <meshBasicMaterial color="#1a1a1a" />
          </Text>
          <Text font={FONT_MONO} fontSize={0.07} position={[0, -0.055, 0.002]} anchorX="center" anchorY="middle">
            ↓
            <meshBasicMaterial color="#b0201a" />
          </Text>
        </group>
      </group>
      <instancedMesh ref={bubbles} args={[undefined, undefined, 24]} frustumCulled={false}>
        <sphereGeometry args={[0.008, 6, 6]} />
        <meshStandardMaterial color="#9fc8ff" emissive="#3a6cff" emissiveIntensity={0.6} transparent opacity={0.6} />
      </instancedMesh>
    </group>
  )
}

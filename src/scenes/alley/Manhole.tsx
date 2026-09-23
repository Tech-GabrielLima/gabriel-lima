import { useGLTF } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { BackSide, CatmullRomCurve3, Group, InstancedMesh, Object3D, Vector3 } from 'three'
import { panFor, sfx } from '../../film/audio'
import { useEggs } from '../../film/eggs'
import { useFilm } from '../../film/store'
import { anchor } from './layout'
import { asset } from '../../film/quality'

// The way out of the alley (ROTEIRO, Cena 03 → 04): a rat that flees the
// flashlight into the manhole, the cover sliding open, and a shaft down to
// black water. The camera dives through it on the chapter's last beats.

const MANHOLE = asset('/models/water_manhole_cover.glb')
const RAT = asset('/models/street_rat.glb')
useGLTF.preload(RAT)

export const HOLE = { x: anchor('manhole').pos[0], z: anchor('manhole').pos[2], r: 0.29 }
const SHAFT = 2.6
const RAT_HOME = new Vector3(2.45, 0, -25.4)
const RAT_SPEED = 3.4 // m/s: rats are fast

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

  const path = useMemo(
    () => new CatmullRomCurve3([RAT_HOME.clone(), new Vector3(1.9, 0, -26.1), new Vector3(1.2, 0, -27.2), new Vector3(HOLE.x, 0, HOLE.z)]),
    [],
  )
  const st = useRef({ state: 'idle' as 'idle' | 'run' | 'gone', s: 0, lit: 0, respawn: 0, hop: 0, slid: false, coverBase: new Vector3() })
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
        if (r.lit > 0.35) useEggs.getState().find('rat')
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

    // The cover: a jolt when the rat goes under, then slides aside for the camera's dive.
    r.hop = Math.max(0, r.hop - dt * 2.5)
    const slide = Math.min(1, Math.max(0, (progress - 0.9) / 0.05))
    if (slide > 0 && !r.slid) sfx('scrape', panFor(r.coverBase, camera))
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

  return (
    <group>
      <primitive object={scene} position={[HOLE.x, 0, HOLE.z]} />
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
      <pointLight position={[HOLE.x, -SHAFT + 0.6, HOLE.z]} color="#5a8cff" intensity={0.8} distance={2} decay={2} />
      <instancedMesh ref={bubbles} args={[undefined, undefined, 24]} frustumCulled={false}>
        <sphereGeometry args={[0.008, 6, 6]} />
        <meshStandardMaterial color="#9fc8ff" emissive="#3a6cff" emissiveIntensity={0.6} transparent opacity={0.6} />
      </instancedMesh>
    </group>
  )
}

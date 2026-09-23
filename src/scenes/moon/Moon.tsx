import { Text, useGLTF, useTexture } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { BallCollider, CuboidCollider, Physics, RigidBody, type RapierRigidBody } from '@react-three/rapier'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Box3, CanvasTexture, DirectionalLight, Group, MathUtils, Mesh, Object3D, Plane, Raycaster, RepeatWrapping, Vector3 } from 'three'
import { CONSTELLATIONS, STACK } from '../../content/skills'
import { panFor, sfx } from '../../film/audio'
import { CameraRig } from '../../film/CameraRig'
import { useCaption } from '../../film/caption'
import { chapterById } from '../../film/chapters'
import { cursor } from '../../film/cursor'
import { useEggs } from '../../film/eggs'
import { useFilm } from '../../film/store'
import { useQ, asset } from '../../film/quality'
import { MONOGRAM } from '../../ui/monogram'
import type { SceneProps } from '../SceneHost'
import { FONT_MONO } from '../shared'
import { Constellations } from './Constellations'
import { Earth, Stars } from './Sky'
import { useDustBursts } from './DustBursts'

// SCENE 05 — MAR DA TRANQUILIDADE (ROTEIRO §2): the stack as physics and stars.
// The cursor is the Sun: move it and the long hard shadows swing round. Six
// rocks, one per area; drag and throw one (at 1.62 m/s²) and its constellation
// lights over the Earth. All six together become the GL monogram.

const ROCKS = [1, 2, 3, 4, 5, 6, 7].map((i) => asset(`/models/moon_rock_0${i}.glb`))
const PROBE = asset('/models/vintage_spacecraft_instrument.glb')
const RADIO = asset('/models/vintage_radio_transceiver.glb')
for (const u of [...ROCKS, PROBE, RADIO]) useGLTF.preload(u)
const GROUND = '/textures/moon_dusted_02'
const STEPS = '/textures/moon_footprints_01'
useTexture.preload([`${GROUND}/diff.webp`, `${GROUND}/nor.webp`, `${GROUND}/rough.webp`, `${STEPS}/diff.webp`, `${STEPS}/nor.webp`, '/textures/earth/day.webp', '/textures/earth/lights.webp'])

const EARTH: [number, number, number] = [64, 22, -108]
/** Where the six throwable rocks rest, in an arc in front of the camera. */
const SPOTS: [number, number][] = [
  [-1.9, -0.4],
  [-1.1, 0.5],
  [-0.3, -0.2],
  [0.5, 0.6],
  [1.3, -0.3],
  [2.1, 0.4],
]
const ROCK_OF = [1, 3, 0, 5, 4, 6] // which model each throwable uses
const ROCK_SCALE = [2.4, 1.6, 3.2, 2.2, 1.7, 2.8]
const FLAG = new Vector3(-2.6, 0, -1.8)

function radial() {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(64, 64, 10, 64, 64, 64)
  grad.addColorStop(0, '#fff')
  grad.addColorStop(1, '#000')
  g.fillStyle = grad
  g.fillRect(0, 0, 128, 128)
  return new CanvasTexture(c)
}

function flagTexture() {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 170
  const g = c.getContext('2d')!
  g.fillStyle = '#0c0b0d'
  g.fillRect(0, 0, 256, 170)
  g.translate(78, 35)
  g.scale(1.0, 1.0)
  g.strokeStyle = '#ffb36b'
  g.lineWidth = 8
  g.lineCap = g.lineJoin = 'round'
  g.stroke(new Path2D(MONOGRAM))
  return new CanvasTexture(c)
}

const ray = new Raycaster()
const plane = new Plane()

export default function Moon({ chapter }: SceneProps) {
  const lang = useFilm((s) => s.lang)
  const camera = useThree((s) => s.camera)
  const portrait = useThree((s) => s.size.width < s.size.height)
  const { start, dur } = chapterById(chapter)
  const rocks = useGLTF(ROCKS)
  const probe = useGLTF(PROBE)
  const radio = useGLTF(RADIO)

  const sun = useRef<DirectionalLight>(null!)
  const sunDisc = useRef<Mesh>(null!)
  const sunDir = useMemo(() => new Vector3(0.4, 0.3, -1).normalize(), [])
  const sunTarget = useMemo(() => new Object3D(), [])
  const bodies = useRef<(RapierRigidBody | null)[]>([])
  const grab = useRef<number | null>(null)
  const litRef = useRef(CONSTELLATIONS.map(() => 0))
  const [litCount, setLitCount] = useState(0)
  const [lastLit, setLastLit] = useState<number | null>(null)
  const merge = useMemo(() => ({ value: 0 }), [])
  const [merged, setMerged] = useState(false)
  const flag = useRef<Group>(null!)
  const flagUp = useRef(0)
  const [radioOn, setRadioOn] = useState(false)
  const autoNext = useRef(0)
  const allFor = useRef(0)
  const dust = useDustBursts()
  const lastVy = useRef<number[]>([])
  const hitPos = useMemo(() => new Vector3(), [])
  const tmp = useMemo(() => ({ hit: new Vector3(), n: new Vector3(), v: new Vector3() }), [])

  const ground = useTexture({ map: `${GROUND}/diff.webp`, normalMap: `${GROUND}/nor.webp`, roughnessMap: `${GROUND}/rough.webp` })
  for (const t of Object.values(ground)) {
    t.wrapS = t.wrapT = RepeatWrapping
    t.repeat.set(24, 24)
  }
  const steps = useTexture({ map: `${STEPS}/diff.webp`, normalMap: `${STEPS}/nor.webp` })
  const fade = useMemo(radial, [])
  const flagTex = useMemo(flagTexture, [])

  // Scenery boulders: the same seven rocks, big and far.
  const boulders = useMemo(() => {
    const r = (s: number) => () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
    const rand = r(1969)
    return Array.from({ length: 26 }, (_, i) => {
      const a = rand() * Math.PI * 2
      const d = 5 + rand() * 30
      return { src: rocks[i % 7].scene.clone(), pos: [Math.cos(a) * d, -0.05, Math.sin(a) * d - 6] as [number, number, number], rot: rand() * 6, s: 6 + rand() * 18 }
    })
  }, [rocks])
  const throwables = useMemo(() => SPOTS.map((_, i) => rocks[ROCK_OF[i]].scene.clone()), [rocks])
  // Ball colliders sized from each rock: the optimised meshes store quantised
  // (Int16) positions, which Rapier's hull builder can't take.
  const radii = useMemo(
    () =>
      throwables.map((o, i) => {
        const size = new Box3().setFromObject(o).getSize(new Vector3()).multiplyScalar(ROCK_SCALE[i])
        return { r: (size.x + size.y + size.z) / 6, lift: new Box3().setFromObject(o).min.y * -ROCK_SCALE[i] }
      }),
    [throwables],
  )

  useEffect(() => {
    for (const g of [...boulders.map((b) => b.src), ...throwables, probe.scene, radio.scene])
      g.traverse((o) => {
        if ((o as Mesh).isMesh) o.castShadow = o.receiveShadow = true
      })
    const up = () => (grab.current = null)
    addEventListener('pointerup', up)
    // Easter egg: type 1969 and a flag goes up.
    let typed = ''
    const key = (e: KeyboardEvent) => {
      typed = (typed + e.key).slice(-4)
      if (typed === '1969' && flagUp.current === 0) {
        flagUp.current = 0.001
        useEggs.getState().find('flag')
        sfx('thunder', 0, 0.35)
      }
    }
    addEventListener('keydown', key)
    return () => {
      removeEventListener('pointerup', up)
      removeEventListener('keydown', key)
      document.body.style.cursor = ''
      useCaption.setState({ caption: null, close: null })
      for (const u of [...ROCKS, PROBE, RADIO]) useGLTF.clear(u)
    }
  }, [boulders, throwables, probe, radio])

  // Caption: the last constellation lit, the hint before any, the monogram after all.
  useEffect(() => {
    if (radioOn) return void useCaption.setState({ caption: { kicker: '📻', title: 'Houston', hook: STACK.radio[lang], accent: '#9fd8ff' }, close: null })
    if (merged)
      return void useCaption.setState({ caption: { kicker: STACK.kicker[lang], title: 'Full Stack', hook: STACK.done[lang], accent: '#ffb36b' }, close: null })
    if (litCount >= CONSTELLATIONS.length)
      return void useCaption.setState({
        caption: { kicker: `${STACK.kicker[lang]} · 6/6`, title: lang === 'pt' ? 'Seis áreas' : 'Six areas', hook: CONSTELLATIONS.map((c) => c.name[lang]).join(' · '), accent: '#e9eef5' },
        close: null,
      })
    if (lastLit === null)
      return void useCaption.setState({ caption: { kicker: STACK.kicker[lang], title: lang === 'pt' ? 'Minha stack, na Lua' : 'My stack, on the Moon', hook: STACK.hint[lang], accent: '#e9eef5' }, close: null })
    const c = CONSTELLATIONS[lastLit]
    useCaption.setState({
      caption: { kicker: `${STACK.kicker[lang]} · ${litCount}/${CONSTELLATIONS.length}`, title: c.name[lang], hook: c.stars.join(' · '), accent: c.color, url: c.url, open: true },
      close: null,
    })
  }, [lastLit, litCount, lang, radioOn, merged])

  const light = (k: number) => {
    if (litRef.current[k] > 0) return
    litRef.current[k] = 0.001
    setLastLit(k)
    setLitCount((n) => n + 1)
    sfx('zap', 0, 0.6)
  }

  useFrame((_, delta) => {
    const { time, mode } = useFilm.getState()
    const p = MathUtils.clamp((time - start) / dur, 0, 1)

    // The Sun follows the cursor across the sky; shadows swing with it.
    const az = cursor.pos.x * 1.3
    const el = 0.12 + (cursor.pos.y + 1) * 0.32
    sunDir.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el))
    sun.current.position.copy(sunDir).multiplyScalar(30)
    sun.current.target = sunTarget
    sunDisc.current.position.copy(sunDir).multiplyScalar(220)

    // Dragging a rock: pull it towards the cursor on a plane facing the camera.
    if (grab.current !== null) {
      const b = bodies.current[grab.current]
      if (b) {
        const t = b.translation()
        tmp.v.set(t.x, t.y, t.z)
        camera.getWorldDirection(tmp.n)
        tmp.n.y = 0
        tmp.n.normalize()
        plane.setFromNormalAndCoplanarPoint(tmp.n, tmp.v)
        ray.setFromCamera(cursor.pos, camera)
        if (ray.ray.intersectPlane(plane, tmp.hit)) {
          tmp.hit.y = MathUtils.clamp(tmp.hit.y, 0.2, 4)
          b.setLinvel({ x: (tmp.hit.x - t.x) * 7, y: (tmp.hit.y - t.y) * 7, z: (tmp.hit.z - t.z) * 7 }, true)
        }
      }
    }
    // Watch mode throws the rocks for you, one every few seconds.
    if (mode === 'watch' && p > 0.05 && p < 0.62) {
      autoNext.current -= delta
      if (autoNext.current <= 0) {
        autoNext.current = 3.1
        const k = litRef.current.findIndex((v) => v === 0)
        const b = k >= 0 ? bodies.current[k] : null
        if (b) b.applyImpulse({ x: (Math.random() - 0.5) * 0.4 * b.mass(), y: 3.4 * b.mass(), z: -1.2 * b.mass() }, true)
      }
    }
    // A rock thrown high enough lights its constellation; landing kicks up regolith.
    bodies.current.forEach((b, k) => {
      if (!b) return
      const t = b.translation()
      if (t.y > 0.9) light(k)
      const vy = b.linvel().y
      const was = lastVy.current[k] ?? 0
      if (was < -0.8 && vy > was * 0.5 && t.y < radii[k].r + 0.25) {
        dust.burst(hitPos.set(t.x, 0, t.z), Math.min(1.4, -was / 2.2))
        sfx('scrape', panFor(hitPos, camera), Math.min(0.5, -was / 6))
      }
      lastVy.current[k] = vy
    })
    litRef.current.forEach((v, k) => {
      if (v > 0) litRef.current[k] = Math.min(1, v + delta * 0.8)
    })
    // All six: hold them long enough to read, then the stars fly into the monogram.
    const all = litRef.current.every((v) => v > 0.5)
    allFor.current = all ? allFor.current + delta : 0
    const ready = mode === 'watch' ? p > 0.7 : allFor.current > 6
    merge.value = all && ready ? Math.min(1, merge.value + delta * 0.35) : Math.max(0, merge.value - delta)
    if (merge.value > 0.5 !== merged) setMerged(merge.value > 0.5)

    flagUp.current = flagUp.current > 0 ? Math.min(1, flagUp.current + delta * 0.8) : 0
    flag.current.position.y = -1.6 + flagUp.current * 1.6
    flag.current.visible = flagUp.current > 0
  })

  const hot = (v: boolean) => () => (document.body.style.cursor = v ? 'grab' : '')

  return (
    <>
      <CameraRig
        chapter={chapter}
        sway={0.1}
        handheld={0.012}
        maxPull={1}
        keys={[
          // Low and wide, as if lying on the regolith.
          { at: 0, pos: [1.6, 0.55, 5.4], look: [0, 1.1, -6], fov: 58 },
          { at: 0.1, pos: [0, 1.0, 4.2], look: [-1, 5.5, -20], fov: 60 },
          // Tilt up as the constellations fill the sky…
          { at: 0.62, pos: [-0.3, 1.05, 3.6], look: portrait ? [0, 16, -34] : [-2, 9, -34], fov: 62 },
          { at: 0.84, pos: [0, 1.1, 3.4], look: portrait ? [-2.5, 12, -34] : [-2.5, 11, -34], fov: 58 },
          // …and turn to the Earth, closing in until it's all there is.
          { at: 0.93, pos: [0.6, 1.3, 3.2], look: EARTH, fov: 30 },
          { at: 1, pos: [1.0, 1.4, 2.8], look: EARTH, fov: 9 },
        ]}
      />
      <color attach="background" args={['#000000']} />
      <ambientLight intensity={0.015} />
      <hemisphereLight args={['#5a7cff', '#000000', 0.08]} />
      <primitive object={sunTarget} />
      <directionalLight
        ref={sun}
        name="cursor-light"
        intensity={4}
        color="#fff8ee"
        castShadow
        shadow-mapSize={useQ([2048, 2048], [1024, 1024])}
        shadow-camera-left={-12}
        shadow-camera-right={12}
        shadow-camera-top={12}
        shadow-camera-bottom={-12}
        shadow-camera-far={80}
        shadow-bias={-0.0005}
      />
      <mesh ref={sunDisc}>
        <sphereGeometry args={[4, 16, 16]} />
        <meshBasicMaterial color="#fffaf0" toneMapped={false} />
      </mesh>

      <Stars />
      {dust.node}
      <Earth position={EARTH} radius={9} sun={sunDir} />
      <Constellations lit={litRef.current} merge={merge} lang={lang} portrait={portrait} />

      <Physics gravity={[0, -1.62, 0]}>
        <RigidBody type="fixed" colliders={false}>
          <CuboidCollider args={[40, 0.1, 40]} position={[0, -0.1, -6]} />
        </RigidBody>
        {throwables.map((obj, i) => (
          <RigidBody
            key={i}
            ref={(b) => void (bodies.current[i] = b)}
            colliders={false}
            position={[SPOTS[i][0], radii[i].r + 0.02, SPOTS[i][1]]}
            rotation={[0, i * 1.3, 0]}
            linearDamping={0.05}
            angularDamping={0.2}
            restitution={0.2}
            friction={0.9}
          >
            <BallCollider args={[radii[i].r]} />
            <primitive
              object={obj}
              position={[0, -radii[i].r * 0.6, 0]}
              scale={ROCK_SCALE[i]}
              onPointerDown={(e: { stopPropagation(): void }) => {
                e.stopPropagation()
                grab.current = i
                document.body.style.cursor = 'grabbing'
              }}
              onPointerOver={hot(true)}
              onPointerOut={hot(false)}
            />
          </RigidBody>
        ))}
      </Physics>

      {/* Names painted on the ground by each rock. */}
      {SPOTS.map(([x, z], i) => (
        <Text key={i} font={FONT_MONO} fontSize={0.09} letterSpacing={0.25} position={[x, 0.005, z + 0.45]} rotation-x={-Math.PI / 2} anchorX="center">
          {CONSTELLATIONS[i].name[lang].toUpperCase()}
          <meshStandardMaterial color={CONSTELLATIONS[i].color} emissive={CONSTELLATIONS[i].color} emissiveIntensity={0.3} />
        </Text>
      ))}

      {/* Regolith, with a patch of footprints right in front of us. */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, -6]} receiveShadow>
        <planeGeometry args={[90, 90]} />
        <meshStandardMaterial {...ground} color="#9a9a98" />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0.4, 0.004, 2.2]} receiveShadow>
        <planeGeometry args={[3.2, 3.2]} />
        <meshStandardMaterial {...steps} color="#9a9a98" alphaMap={fade} transparent />
      </mesh>
      {boulders.map((b, i) => (
        <primitive key={i} object={b.src} position={b.pos} rotation-y={b.rot} scale={b.s} />
      ))}

      {/* The abandoned probe and its radio. */}
      <primitive object={probe.scene} position={[2.9, 0.12, -1.4]} rotation-y={-0.6} scale={1.6} />
      <group
        position={[2.2, 0, -0.4]}
        rotation-y={-0.9}
        onPointerOver={() => {
          document.body.style.cursor = 'pointer'
          setRadioOn(true)
          sfx('static', panFor(new Vector3(2.2, 0.3, -0.4), camera))
        }}
        onPointerOut={() => {
          document.body.style.cursor = ''
          setRadioOn(false)
        }}
      >
        <primitive object={radio.scene} scale={1.2} />
      </group>

      {/* 1969. */}
      <group ref={flag} position={FLAG} visible={false}>
        <mesh position={[0, 0.9, 0]} castShadow>
          <cylinderGeometry args={[0.015, 0.015, 1.8, 8]} />
          <meshStandardMaterial color="#d8d8d8" metalness={0.8} roughness={0.3} />
        </mesh>
        <mesh position={[0.36, 1.55, 0]} castShadow>
          <planeGeometry args={[0.7, 0.46]} />
          <meshStandardMaterial map={flagTex} side={2} />
        </mesh>
      </group>
    </>
  )
}

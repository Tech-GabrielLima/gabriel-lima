import { Environment, Text, useGLTF, useTexture, useEnvironment } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import { BufferAttribute, CanvasTexture, Group, MathUtils, Mesh, MeshStandardMaterial, Object3D, PointLight, Raycaster, RectAreaLight, RepeatWrapping, SpotLight, Vector3 } from 'three'
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js'
import { ABOUT, BIO } from '../../content/about'
import { sfx } from '../../film/audio'
import { CameraRig } from '../../film/CameraRig'
import { useCaption } from '../../film/caption'
import { chapterById } from '../../film/chapters'
import { cursor } from '../../film/cursor'
import { useEggs } from '../../film/eggs'
import { useFilm } from '../../film/store'
import { useQ, asset } from '../../film/quality'
import { MONOGRAM } from '../../ui/monogram'
import type { SceneProps } from '../SceneHost'
import { FONT_HAND, FONT_MONO } from '../shared'
import { aimLamp, SHADE_OFFSET, type LampRig } from './lamp'
import { RainGlass } from './RainGlass'
import { createTerminal } from './terminal'
import { Steam } from '../fx/Steam'

// SCENE 02 — O ESTÚDIO (ROTEIRO §2): Gabriel's desk at 3 a.m. Rain on the big
// window, the city blurred behind it. The desk lamp follows the cursor and
// whatever it lights wakes up: the bio written on the pad, the clock (the
// visitor's real time), the laptop running flight. Switch the lamp off and
// the drops on the glass gather into the monogram.

RectAreaLightUniformsLib.init()

const M = (n: string) => asset(`/models/${n}.glb`)
const MODELS = ['metal_office_desk', 'desk_lamp_rig', 'classic_laptop', 'wall_clock', 'modern_arm_chair_01', 'potted_plant_02', 'vintage_stapler'].map(M)
for (const u of MODELS) useGLTF.preload(u)
const FLOOR = '/textures/wood_floor_worn'
useTexture.preload([`${FLOOR}/diff.webp`, `${FLOOR}/nor.webp`])
useEnvironment.preload({ files: '/hdri/rooftop_night.hdr' })

const ROOM = { w: 6.4, h: 3.2, back: -3.1 }
const WINDOW = { x: 0.2, y: 1.85, w: 3.4, h: 1.9 }
const DESK_Y = 0.79
const DESK_Z = -2.45
const PAD = new Vector3(-0.28, DESK_Y + 0.004, -2.28)
const CLOCK = new Vector3(-2.3, 2.15, ROOM.back + 0.02)
const LAMP_AT = new Vector3(-0.78, DESK_Y, -2.78)

function wallAlpha() {
  // Opaque back wall with the window cut out.
  const c = document.createElement('canvas')
  c.width = 640
  c.height = 320
  const g = c.getContext('2d')!
  g.fillStyle = '#fff'
  g.fillRect(0, 0, 640, 320)
  g.fillStyle = '#000'
  const px = (x: number) => ((x + ROOM.w / 2) / ROOM.w) * 640
  const py = (y: number) => (1 - y / ROOM.h) * 320
  g.fillRect(px(WINDOW.x - WINDOW.w / 2), py(WINDOW.y + WINDOW.h / 2), px(WINDOW.x + WINDOW.w / 2) - px(WINDOW.x - WINDOW.w / 2), py(WINDOW.y - WINDOW.h / 2) - py(WINDOW.y + WINDOW.h / 2))
  return new CanvasTexture(c)
}

/** A polaroid until Gabriel sends a photo: the monogram, developing. */
function polaroidTexture() {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 256
  const g = c.getContext('2d')!
  const grad = g.createLinearGradient(0, 0, 256, 256)
  grad.addColorStop(0, '#2b2320')
  grad.addColorStop(1, '#10131a')
  g.fillStyle = grad
  g.fillRect(0, 0, 256, 256)
  g.translate(48, 48)
  g.scale(1.6, 1.6)
  g.strokeStyle = '#ffb36b'
  g.lineWidth = 6
  g.lineCap = g.lineJoin = 'round'
  g.stroke(new Path2D(MONOGRAM))
  return new CanvasTexture(c)
}

const ray = new Raycaster()

export default function Studio({ chapter }: SceneProps) {
  const lang = useFilm((s) => s.lang)
  const camera = useThree((s) => s.camera)
  const { start, dur } = chapterById(chapter)
  const [desk, lampModel, laptop, clock, chair, plant, stapler] = useGLTF(MODELS)

  const lampOn = useRef(true)
  const [on, setOn] = useState(true)
  const spot = useRef<SpotLight>(null!)
  const bulb = useRef<Mesh>(null!)
  const screen = useRef<RectAreaLight>(null!)
  const windowLight = useRef<RectAreaLight>(null!)
  const flash = useRef<PointLight>(null!)
  const spotTarget = useMemo(() => new Object3D(), [])
  const aim = useMemo(() => new Vector3(-0.2, DESK_Y, -2.2), [])
  const tmp = useMemo(() => ({ v: new Vector3(), h: new Vector3() }), [])
  const logo = useMemo(() => ({ value: 0 }), [])
  const glassFlash = useMemo(() => ({ value: 0 }), [])
  const dark = useRef(0)
  const storm = useRef({ next: 6, flash: 0, thunder: -1 })
  const bioRefs = useRef<Mesh[]>([])
  const [bioShown, setBioShown] = useState(false)

  const floor = useTexture({ map: `${FLOOR}/diff.webp`, normalMap: `${FLOOR}/nor.webp` })
  for (const t of Object.values(floor)) {
    t.wrapS = t.wrapT = RepeatWrapping
    t.repeat.set(3, 3)
  }
  const alpha = useMemo(wallAlpha, [])
  const polaroid = useMemo(polaroidTexture, [])
  const terminal = useMemo(createTerminal, [])

  const rig = useMemo<LampRig>(
    () => ({
      base: lampModel.scene.getObjectByName('lamp_base')!,
      lower: lampModel.scene.getObjectByName('lamp_lower')!,
      upper: lampModel.scene.getObjectByName('lamp_upper')!,
      head: lampModel.scene.getObjectByName('lamp_head')!,
    }),
    [lampModel],
  )
  // The light and its bulb ride on the shade.
  const shadeMount = useMemo(() => {
    const g = new Group()
    g.position.copy(SHADE_OFFSET)
    rig.head.add(g)
    return g
  }, [rig])

  useEffect(() => {
    for (const s of [desk, lampModel, laptop, clock, chair, plant, stapler].map((g) => g.scene))
      s.traverse((o) => {
        const m = o as Mesh
        if (!m.isMesh) return
        m.castShadow = m.receiveShadow = true
        // The laptop's display shows the live terminal.
        const mat = m.material as MeshStandardMaterial
        if (mat?.name === 'classic_laptop_screen') {
          // The display had no texture, so its UVs were pruned: project the screen plane (x, y) to UVs.
          const g = m.geometry
          g.computeBoundingBox()
          const b = g.boundingBox!
          const pos = g.getAttribute('position')
          const uv = new Float32Array(pos.count * 2)
          for (let i = 0; i < pos.count; i++) {
            uv[i * 2] = (pos.getX(i) - b.min.x) / (b.max.x - b.min.x)
            uv[i * 2 + 1] = (pos.getY(i) - b.min.y) / (b.max.y - b.min.y)
          }
          g.setAttribute('uv', new BufferAttribute(uv, 2))
          mat.color.set('#ffffff')
          mat.map = terminal.texture
          mat.emissiveMap = terminal.texture
          mat.emissive.set('#ffffff')
          mat.emissiveIntensity = 1.3
          mat.needsUpdate = true
        }
      })
    return () => {
      document.body.style.cursor = ''
      useCaption.setState({ caption: null, close: null })
      for (const u of MODELS) useGLTF.clear(u)
    }
  }, [desk, lampModel, laptop, clock, chair, plant, stapler, terminal])

  // The about card, while the camera reads the pad.
  useEffect(() => {
    useCaption.setState(
      bioShown
        ? { caption: { kicker: ABOUT.kicker[lang], title: ABOUT.title, hook: ABOUT.hook[lang], body: ABOUT.body[lang], accent: '#8fb8ff', open: true }, close: null }
        : { caption: null, close: null },
    )
  }, [bioShown, lang])

  const toggleLamp = () => {
    lampOn.current = !lampOn.current
    setOn(lampOn.current)
    sfx('click')
  }

  useFrame((state, delta) => {
    const { time } = useFilm.getState()
    const p = MathUtils.clamp((time - start) / dur, 0, 1)
    const e = state.clock.elapsedTime

    // Where the cursor points: the desk top, or the back wall above it.
    ray.setFromCamera(cursor.pos, camera)
    const o = ray.ray.origin
    const d = ray.ray.direction
    let t = d.y < -1e-3 ? (DESK_Y - o.y) / d.y : Infinity
    tmp.h.copy(d).multiplyScalar(t).add(o)
    if (!(t > 0) || tmp.h.z < ROOM.back || Math.abs(tmp.h.x) > 1.4) {
      t = (ROOM.back - o.z) / d.z
      tmp.h.copy(d).multiplyScalar(t).add(o)
    }
    tmp.h.x = MathUtils.clamp(tmp.h.x, -1.4, 1.6)
    aim.lerp(tmp.h, 0.2)
    aimLamp(rig, aim, 1 - Math.exp(-delta * 5))
    spot.current.target = spotTarget
    spotTarget.position.copy(aim)

    const lit = lampOn.current ? 1 : 0
    spot.current.intensity += (lit * 14 - spot.current.intensity) * 0.2
    ;(bulb.current.material as MeshStandardMaterial).emissiveIntensity = lit * 6

    // The bio writes itself while the lamp is on the pad (or the camera reads it).
    const onPad = aim.distanceTo(PAD) < 0.55 || (p > 0.3 && p < 0.62)
    bioRefs.current.forEach((m, i) => {
      if (!m) return
      const mat = m.material as MeshStandardMaterial
      const want = onPad && lit ? 1 : mat.opacity > 0.99 ? 1 : 0
      if (want) mat.opacity = Math.min(1, mat.opacity + delta * (1.6 - i * 0.12))
    })
    const reading = p > 0.3 && p < 0.66
    if (reading !== bioShown) setBioShown(reading)

    // The clock keeps the visitor's own time.
    const now = new Date()
    const sec = now.getSeconds() + now.getMilliseconds() / 1000
    const min = now.getMinutes() + sec / 60
    const hr = (now.getHours() % 12) + min / 60
    clock.scene.getObjectByName('wall_clock_second_hand')!.rotation.z = -(sec / 60) * Math.PI * 2
    clock.scene.getObjectByName('wall_clock_minute_hand')!.rotation.z = -(min / 60) * Math.PI * 2 + Math.PI / 2
    clock.scene.getObjectByName('wall_clock_hours_hand')!.rotation.z = -(hr / 12) * Math.PI * 2 + Math.PI / 2

    terminal.draw(e)
    screen.current.intensity = 2.4 + Math.sin(e * 50) * 0.05

    // Easter egg: two seconds in the dark and the rain draws the monogram.
    dark.current = lampOn.current ? 0 : dark.current + delta
    const want = dark.current > 0.8 ? 1 : 0
    logo.value += (want - logo.value) * Math.min(1, delta * (want ? 0.9 : 3))
    if (logo.value > 0.9) useEggs.getState().find('drops')

    // Lightning over the city.
    const w = storm.current
    w.next -= delta
    if (w.next <= 0) {
      w.next = 14 + Math.random() * 14
      w.flash = 1
      w.thunder = 0.8 + Math.random() * 1.2
    }
    if (w.thunder > 0 && (w.thunder -= delta) <= 0) sfx('thunder', 0.3)
    w.flash = Math.max(0, w.flash - delta * 2.4)
    const f = w.flash > 0.55 || (w.flash > 0.1 && w.flash < 0.3) ? w.flash : 0
    // The transition: a last, huge flash as the camera reaches the glass.
    const final = MathUtils.smoothstep(p, 0.94, 1)
    flash.current.intensity = f * 18 + final * 30
    windowLight.current.intensity = 1.2 + f * 10
    glassFlash.value = f + final * 1.5
  })

  const hot = (v: boolean) => () => (document.body.style.cursor = v ? 'pointer' : '')

  return (
    <>
      <CameraRig
        chapter={chapter}
        sway={0.08}
        handheld={0.005}
        maxPull={1.5}
        bounds={(p) => ((p.x = MathUtils.clamp(p.x, -ROOM.w / 2 + 0.3, ROOM.w / 2 - 0.3)), (p.y = MathUtils.clamp(p.y, 0.4, ROOM.h - 0.2)))}
        keys={[
          // From behind the chair: the desk against the rainy window.
          { at: 0, pos: [1.7, 1.5, 0.9], look: [-0.1, 1.15, -2.6], fov: 38 },
          { at: 0.22, pos: [0.9, 1.4, -0.4], look: [-0.25, 0.95, -2.4], fov: 38 },
          // Down onto the pad: the bio writes itself.
          { at: 0.32, pos: [-0.18, 1.32, -1.55], look: [-0.28, 0.8, -2.28], fov: 34 },
          { at: 0.6, pos: [-0.32, 1.26, -1.62], look: [-0.28, 0.8, -2.3], fov: 32 },
          // The laptop: flight explaining a crash.
          { at: 0.72, pos: [0.62, 1.2, -1.6], look: [0.42, 0.98, -2.5], fov: 34 },
          // Up to the window, closer and closer to one drop…
          { at: 0.86, pos: [0.3, 1.6, -2.1], look: [0.25, 1.85, -3.2], fov: 40 },
          { at: 1, pos: [0.25, 1.82, ROOM.back + 0.25], look: [0.25, 1.85, -6], fov: 30 },
        ]}
      />
      {/* The window paints the city itself (RainGlass); the HDRI only lights reflections. */}
      <Environment files="/hdri/rooftop_night.hdr" environmentIntensity={0.08} />
      <ambientLight intensity={0.02} color="#8fa8d8" />
      <pointLight ref={flash} position={[WINDOW.x, WINDOW.y, ROOM.back - 1.5]} color="#cfe0ff" intensity={0} distance={14} decay={1.4} />
      <rectAreaLight ref={windowLight} args={['#6a86c8', 1.2, WINDOW.w, WINDOW.h]} position={[WINDOW.x, WINDOW.y, ROOM.back + 0.05]} />

      {/* The room: back wall with its window, floor, side walls. */}
      <mesh position={[0, ROOM.h / 2, ROOM.back]} receiveShadow>
        <planeGeometry args={[ROOM.w, ROOM.h]} />
        <meshStandardMaterial color="#1f2328" roughness={0.9} alphaMap={alpha} alphaTest={0.5} />
      </mesh>
      <group position={[WINDOW.x, WINDOW.y, ROOM.back + 0.01]}>
        <RainGlass width={WINDOW.w} height={WINDOW.h} logo={logo} flash={glassFlash} />
        {/* Mullions. */}
        {[-WINDOW.w / 6, WINDOW.w / 6].map((x) => (
          <mesh key={x} position={[x, 0, 0.02]}>
            <boxGeometry args={[0.04, WINDOW.h, 0.05]} />
            <meshStandardMaterial color="#16181c" />
          </mesh>
        ))}
        <mesh position={[0, -WINDOW.h / 2 - 0.03, 0.08]}>
          <boxGeometry args={[WINDOW.w + 0.2, 0.05, 0.22]} />
          <meshStandardMaterial color="#2a2d33" roughness={0.6} />
        </mesh>
      </group>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, -1]} receiveShadow>
        <planeGeometry args={[ROOM.w, 6]} />
        <meshStandardMaterial {...floor} color="#6d5d50" roughness={0.75} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[(s * ROOM.w) / 2, ROOM.h / 2, -1]} rotation-y={(-s * Math.PI) / 2} receiveShadow>
          <planeGeometry args={[6, ROOM.h]} />
          <meshStandardMaterial color="#1a1d22" roughness={0.9} />
        </mesh>
      ))}

      {/* The desk and its life. */}
      <primitive object={desk.scene} position={[0, 0, DESK_Z]} />
      <primitive object={laptop.scene} position={[0.42, DESK_Y, -2.52]} rotation-y={-0.18} />
      <rectAreaLight ref={screen} args={['#9fd8ff', 2.4, 0.6, 0.4]} position={[0.4, DESK_Y + 0.3, -2.62]} rotation-y={Math.PI - 0.18} />
      <primitive object={stapler.scene} position={[0.85, DESK_Y, -2.2]} rotation-y={0.7} />
      <primitive object={chair.scene} position={[0.15, 0, -1.3]} rotation-y={Math.PI + 0.25} />
      <primitive object={plant.scene} position={[2.4, 0, -2.6]} />
      <primitive object={clock.scene} position={CLOCK} />

      {/* The lamp: clamped to the desk, following the cursor. */}
      <group position={LAMP_AT} onClick={(e) => (e.stopPropagation(), toggleLamp())} onPointerOver={hot(true)} onPointerOut={hot(false)}>
        <primitive object={lampModel.scene} />
      </group>
      <primitive object={spotTarget} />
      <primitive object={shadeMount}>
        <spotLight ref={spot} name="cursor-light" angle={0.55} penumbra={0.5} intensity={14} decay={1.6} distance={6} color="#ffcf8a" castShadow shadow-mapSize={useQ([1024, 1024], [512, 512])} shadow-bias={-0.0004} />
        <mesh ref={bulb} position={[0, -0.02, -0.01]}>
          <sphereGeometry args={[0.025, 10, 10]} />
          <meshStandardMaterial color="#000" emissive="#ffd9a0" emissiveIntensity={6} toneMapped={false} />
        </mesh>
      </primitive>

      {/* 3 a.m. coffee. */}
      <group position={[0.02, DESK_Y, -2.18]}>
        <mesh position={[0, 0.05, 0]} castShadow>
          <cylinderGeometry args={[0.042, 0.038, 0.1, 24, 1, true]} />
          <meshStandardMaterial color="#2b3a4e" roughness={0.3} side={2} />
        </mesh>
        <mesh position={[0, 0.001, 0]}>
          <circleGeometry args={[0.038, 24]} />
          <meshStandardMaterial color="#2b3a4e" roughness={0.3} />
        </mesh>
        <mesh position={[0, 0.085, 0]} rotation-x={-Math.PI / 2}>
          <circleGeometry args={[0.039, 24]} />
          <meshStandardMaterial color="#2a1708" roughness={0.15} />
        </mesh>
        <mesh position={[0.048, 0.055, 0]} rotation-y={Math.PI / 2}>
          <torusGeometry args={[0.024, 0.006, 8, 16, Math.PI]} />
          <meshStandardMaterial color="#2b3a4e" roughness={0.3} />
        </mesh>
      </group>
      <Steam position={[0.02, DESK_Y + 0.1, -2.18]} spread={0.03} rise={0.35} life={3.2} size={0.12} count={22} color="#e8e4dc" opacity={0.16} drift={[0.05, 0.02]} additive />

      {/* The pad with the bio, handwritten line by line. */}
      <group position={PAD} rotation-x={-Math.PI / 2} rotation-z={0.08}>
        <mesh receiveShadow>
          <planeGeometry args={[0.34, 0.44]} />
          <meshStandardMaterial color="#efe1a8" roughness={1} />
        </mesh>
        {BIO[lang].map((line, i) => (
          <Text
            key={lang + i}
            ref={(m: Mesh) => void (bioRefs.current[i] = m)}
            font={FONT_HAND}
            fontSize={0.024}
            position={[-0.15, 0.17 - i * 0.045, 0.001]}
            anchorX="left"
            maxWidth={0.3}
          >
            {line}
            <meshStandardMaterial color="#1c2a5a" roughness={1} transparent opacity={0} />
          </Text>
        ))}
      </group>

      {/* Polaroid taped by the window. */}
      <group position={[1.62, 1.35, ROOM.back + 0.02]} rotation-z={-0.07}>
        <mesh>
          <planeGeometry args={[0.2, 0.24]} />
          <meshStandardMaterial color="#f2efe6" roughness={0.9} />
        </mesh>
        <mesh position={[0, 0.02, 0.001]}>
          <planeGeometry args={[0.17, 0.17]} />
          <meshStandardMaterial map={polaroid} roughness={0.6} />
        </mesh>
        <Text font={FONT_HAND} fontSize={0.018} position={[0, -0.095, 0.002]} anchorX="center">
          {on ? 'GL · 3am' : '...'}
          <meshStandardMaterial color="#223" roughness={1} />
        </Text>
      </group>
      <Text font={FONT_MONO} fontSize={0.035} letterSpacing={0.2} position={[-2.3, 1.9, ROOM.back + 0.02]} anchorX="center">
        {lang === 'pt' ? 'SUA HORA' : 'YOUR TIME'}
        <meshStandardMaterial color="#6a7078" roughness={1} />
      </Text>
    </>
  )
}

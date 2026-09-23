import { Environment, MeshReflectorMaterial, Text, useGLTF, useTexture, useEnvironment } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import { AdditiveBlending, BufferAttribute, ShaderMaterial, UniformsLib, UniformsUtils, Group, HemisphereLight, MathUtils, Mesh, MeshStandardMaterial, Object3D, Path, PointLight, RepeatWrapping, SRGBColorSpace, Shape, ShapeGeometry, SpotLight, Vector3 } from 'three'
import { PROJECTS, projectById, MONOLITH, SUPERVISED, type DoorId } from '../../content/projects'
import { setBedLevel, sfx } from '../../film/audio'
import { useQ, asset } from '../../film/quality'
import { CameraRig, cameraFocus, type CameraKey } from '../../film/CameraRig'
import { useCaption } from '../../film/caption'
import { chapterById } from '../../film/chapters'
import { useFilm } from '../../film/store'
import { MONOGRAM } from '../../ui/monogram'
import type { SceneProps } from '../SceneHost'
import { FONT_MONO } from '../shared'
import { HALF, LENGTH, OPENING, TOWER_Z, anchor, cursorOnAlley, doorAnchor, inward, type Anchor } from './layout'
import { NeonPath } from './Neon'
import { LIFT, ROOM_DEPTH, Shutter } from './Shutter'
import GROUND from './ground.json'
import { Interiors } from './Interiors'
import { HOLE, Manhole } from './Manhole'
import { Rain } from './Rain'
import { Splashes } from './Splashes'
import { Steam } from '../fx/Steam'
import { SupervisorTree } from './SupervisorTree'
import { Tower } from './Tower'
import { FlightBox, OrderBook, RaftTable, type InstallationProps } from './installations/Installations'
import { CudaWall, HalePrism, LedgerScale, NablaNet, UnderConstruction } from './installations/More'

// SCENE 03 — O BECO (ROTEIRO §2). The showcase: a wet neo-noir alley where every
// roller shutter hides a project, and the visitor holds the flashlight.

const SET = '/scenes/alley_lit.glb'
// Baked in Cycles by scripts/blender/alley_bake.py (npm run bake:light).
const LIGHTMAPS = { set: '/scenes/alley_lightmap.webp', ground: '/scenes/ground_lightmap.webp' }
/** Lightmaps hold irradiance; three's Lambert divides by π, so scale back up (tuned by eye). */
const LIGHTMAP_INTENSITY = 3.2
const GROUND_LIGHTMAP_INTENSITY = 1.6
const SHUTTER = asset('/models/rollershutter_door.glb')
const CAMERA = asset('/models/security_camera_rig.glb')
const ASPHALT = '/textures/asphalt_02'
for (const u of [SET, SHUTTER, CAMERA]) useGLTF.preload(u)
useTexture.preload(['/textures/asphalt_02/diff.webp', '/textures/asphalt_02/nor.webp', '/textures/puddles.webp', '/scenes/alley_lightmap.webp', '/scenes/ground_lightmap.webp'])
useEnvironment.preload({ files: '/hdri/shanghai_bund.hdr' })

const EYE = 1.62
const NEON_SIGN = new Vector3(-HALF + 0.72, 4.7, -3.4)

const INSTALLATIONS: Partial<Record<DoorId, (p: InstallationProps) => React.JSX.Element>> = {
  flight: FlightBox,
  raft: RaftTable,
  match: OrderBook,
  hale: HalePrism,
  ledger: LedgerScale,
  nabla: NablaNet,
  cuda: CudaWall,
  obras: UnderConstruction,
}
const deg = (d: number) => (d * Math.PI) / 180

/** Where the camera stops in watch mode (chapter fraction) and what it shows. */
const STOPS: { door?: DoorId; tower?: true; elixir?: true; from: number; to: number }[] = [
  { door: 'flight', from: 0.12, to: 0.2 },
  { door: 'raft', from: 0.27, to: 0.36 },
  { door: 'match', from: 0.4, to: 0.48 },
  { elixir: true, from: 0.52, to: 0.6 },
  { tower: true, from: 0.66, to: 0.84 },
]

/** Camera pose facing a door from the middle of the alley. */
function doorShot(id: DoorId, at: number, dist = 4.6): CameraKey {
  const a = doorAnchor(id)
  const n = inward(a)
  const close = dist < 3
  return {
    at,
    pos: [a.pos[0] + n.x * dist, close ? 1.45 : EYE, a.pos[2] + n.z * dist + (close ? 0.25 : 1.1)],
    look: [a.pos[0] - n.x * (close ? 1.2 : 0), close ? 1.3 : 1.15, a.pos[2] - n.z * (close ? 1.2 : 0)],
    fov: close ? 40 : 44,
  }
}

const KEYS: CameraKey[] = [
  // Establishing: from the street, down the alley to the tower's lit windows.
  { at: 0, pos: [0.2, 1.75, 5.5], look: [0, 5, TOWER_Z], fov: 38 },
  { at: 0.08, pos: [0, EYE, 1.2], look: [0, 3.2, TOWER_Z], fov: 40 },
  // Arrive, then push in slowly as the shutter rolls up.
  doorShot('flight', 0.12),
  doorShot('flight', 0.2, 2.3),
  { at: 0.24, pos: [0.5, EYE, -6.6], look: [-HALF, 1.6, -8.5], fov: 42 },
  // Arrive, then push in slowly as the shutter rolls up.
  doorShot('raft', 0.27),
  doorShot('raft', 0.36, 2.3),
  // Arrive, then push in slowly as the shutter rolls up.
  doorShot('match', 0.4),
  doorShot('match', 0.48, 2.3),
  // Look up: the supervision tree of bulbs strung across the alley.
  { at: 0.52, pos: [-2.1, 1.6, -16.4], look: [1.3, 4.7, -19.6], fov: 50 },
  { at: 0.6, pos: [-2.3, 1.5, -17.3], look: [1.5, 4.8, -19.8], fov: 48 },
  { at: 0.63, pos: [0, EYE, -23.2], look: [0, 3.5, TOWER_Z], fov: 44 },
  // The tower: tilt up across 900 windows.
  { at: 0.66, pos: [0, 1.4, -27.2], look: [0, 7, TOWER_Z], fov: 52 },
  { at: 0.84, pos: [0, 1.3, -28.6], look: [0, 12, TOWER_Z], fov: 56 },
  // Follow the rat down to the manhole, then dive through it: the way out of this chapter.
  { at: 0.88, pos: [1.2, 1.8, -24.2], look: [1.6, 0, -26.4], fov: 44 },
  { at: 0.93, pos: [0.4, 1.9, -26.3], look: [0.6, 0, -28.1], fov: 44 },
  { at: 0.965, pos: [0.6, 1.2, -27.85], look: [0.6, -2, -28.1], fov: 50 },
  { at: 1, pos: [0.6, -1.9, -28.02], look: [0.6, -3.2, -28.1], fov: 58 },
]

/** Phones back the camera off; it must stay between the walls and above the floor. */
const keepInAlley = (p: Vector3) => {
  p.x = MathUtils.clamp(p.x, -HALF + 0.35, HALF - 0.35)
  p.y = MathUtils.clamp(p.y, 0.4, 9)
}

function place(o: Object3D, a: Anchor) {
  o.position.fromArray(a.pos)
  o.rotation.set(0, deg(a.yaw), 0)
}

export default function Alley({ chapter }: SceneProps) {
  const lang = useFilm((s) => s.lang)
  const camera = useThree((s) => s.camera)
  const lowTier = useQ(false, true)
  const shadowSize = useQ<[number, number]>([1024, 1024], [512, 512])
  const set = useGLTF(SET)
  const shutterModel = useGLTF(SHUTTER)
  const camModel = useGLTF(CAMERA)
  const { start, dur } = chapterById(chapter)

  const [pointed, setHovered] = useState<DoorId | null>(null)
  // The door the flashlight is on: "nothing exists until the light touches it" — and it works for a finger too.
  const [litDoor, setLitDoor] = useState<DoorId | null>(null)
  const hovered = pointed ?? litDoor
  const [open, setOpen] = useState<DoorId | null>(null)
  const [stop, setStop] = useState<(typeof STOPS)[number] | null>(null)
  const [bulbs, setBulbs] = useState(false)

  const flash = useRef<SpotLight>(null!)
  const flashTarget = useMemo(() => new Object3D(), [])
  const leak = useRef<SpotLight>(null!)
  const leakTarget = useMemo(() => new Object3D(), [])
  const room = useRef<PointLight>(null!)
  const cams = useRef<Group[]>([])
  const sky = useRef<HemisphereLight>(null!)
  const storm = useRef({ next: 9 + Math.random() * 8, flash: 0, thunder: -1 })
  const tmp = useMemo(() => ({ hit: new Vector3(), n: new Vector3(), v: new Vector3(), right: new Vector3(), up: new Vector3() }), [])

  const asphalt = useTexture({ map: `${ASPHALT}/diff.webp`, normalMap: `${ASPHALT}/nor.webp` })
  // The ground's UVs are in metres (see `ground`), so repeats are per metre.
  for (const t of Object.values(asphalt)) {
    t.wrapS = t.wrapT = RepeatWrapping
    t.repeat.set(0.47, 0.45)
  }
  // Puddle mask: dark = standing water. One tile spans the alley's width, repeating along it.
  const puddles = useTexture('/textures/puddles.webp')
  puddles.wrapS = puddles.wrapT = RepeatWrapping
  puddles.repeat.set(1 / (HALF * 2 + 0.4), 0.05)
  puddles.offset.set(0.5, 0)

  // The alley floor, with a real hole where the manhole is (the camera dives through it).
  // Shape coords are (x, -z); the mesh is laid flat by rotation-x = -π/2.
  const ground = useMemo(() => {
    const w = HALF + 0.2
    const s = new Shape().moveTo(-w, -8).lineTo(w, -8).lineTo(w, LENGTH + 14).lineTo(-w, LENGTH + 14).closePath()
    s.holes.push(new Path().absarc(HOLE.x, -HOLE.z, HOLE.r, 0, Math.PI * 2, true))
    const geo = new ShapeGeometry(s, 48)
    // Second UV set for the baked floor lightmap, normalised to the bake's bounds.
    const pos = geo.getAttribute('position')
    const uv1 = new Float32Array(pos.count * 2)
    for (let i = 0; i < pos.count; i++) {
      uv1[i * 2] = (pos.getX(i) - GROUND.x0) / (GROUND.x1 - GROUND.x0)
      uv1[i * 2 + 1] = (-pos.getY(i) - GROUND.z0) / (GROUND.z1 - GROUND.z0)
    }
    geo.setAttribute('uv1', new BufferAttribute(uv1, 2))
    return geo
  }, [])

  const lightmaps = useTexture(LIGHTMAPS)
  lightmaps.set.flipY = false // glTF UV convention
  for (const t of Object.values(lightmaps)) {
    t.channel = 1
    t.colorSpace = SRGBColorSpace
  }

  // drei's reflector builds its own shader and drops lightMap, so the baked floor
  // light is added by a second pass over the same geometry: asphalt × irradiance.
  const groundLight = useMemo(
    () =>
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: {
          ...UniformsUtils.clone(UniformsLib.fog),
          uLight: { value: lightmaps.ground },
          uAlbedo: { value: asphalt.map },
          uWet: { value: puddles },
          uWetRepeat: { value: puddles.repeat },
          uWetOffset: { value: puddles.offset },
          uRepeat: { value: asphalt.map.repeat },
          uIntensity: { value: GROUND_LIGHTMAP_INTENSITY },
        },
        vertexShader: /* glsl */ `
          attribute vec2 uv1;
          varying vec2 vUv;
          varying vec2 vUv1;
          #include <fog_pars_vertex>
          void main() {
            vUv = uv;
            vUv1 = uv1;
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * mvPosition;
            #include <fog_vertex>
          }
        `,
        fragmentShader: /* glsl */ `
          uniform sampler2D uLight;
          uniform sampler2D uAlbedo;
          uniform vec2 uRepeat;
          uniform float uIntensity;
          uniform sampler2D uWet;
          uniform vec2 uWetRepeat;
          uniform vec2 uWetOffset;
          varying vec2 vUv;
          varying vec2 vUv1;
          #include <fog_pars_fragment>
          void main() {
            vec3 light = texture2D(uLight, vUv1).rgb;
            vec3 albedo = texture2D(uAlbedo, vUv * uRepeat).rgb;
            // Standing water (dark in the mask) is mostly mirror: less diffuse light there.
            float dry = texture2D(uWet, vUv * uWetRepeat + uWetOffset).r;
            gl_FragColor = vec4(albedo * light * uIntensity * mix(0.35, 1.0, dry), 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
            #include <fog_fragment>
          }
        `,
        fog: true,
      }),
    [lightmaps.ground, asphalt.map, puddles],
  )

  // One rig per wall; each head is what swivels.
  const cameraRigs = useMemo(() => [camModel.scene, camModel.scene.clone()], [camModel])
  useEffect(() => {
    cams.current = cameraRigs.map((r) => r.getObjectByName('camera_head') as Group)
    for (const r of cameraRigs) r.getObjectByName('camera_head')!.rotation.order = 'YXZ'
  }, [cameraRigs])

  const shutterMesh = useMemo(() => shutterModel.scene.getObjectByName('rollershutter_door')!, [shutterModel])

  useEffect(() => {
    set.scene.traverse((o) => {
      const m = o as Mesh
      if (!m.isMesh) return
      m.castShadow = m.receiveShadow = true
      for (const mat of [m.material].flat() as MeshStandardMaterial[]) {
        mat.lightMap = lightmaps.set
        mat.lightMapIntensity = LIGHTMAP_INTENSITY
        mat.needsUpdate = true
      }
    })
    return () => {
      document.body.style.cursor = ''
      setBedLevel('neon', 0)
      cameraFocus.active = false
      useCaption.setState({ caption: null, close: null })
      for (const u of [SET, SHUTTER, CAMERA]) useGLTF.clear(u)
    }
  }, [set, lightmaps])

  // --- opening a door pauses the film and walks the camera inside ------------
  const resume = useRef(false)
  const openDoor = (id: DoorId) => {
    const s = useFilm.getState()
    resume.current = s.playing
    if (s.playing) s.togglePlay()
    setOpen(id)
    const a = doorAnchor(id)
    const n = inward(a)
    cameraFocus.pos.set(a.pos[0] + n.x * 1.1, 1.45, a.pos[2] + n.z * 1.1)
    cameraFocus.look.set(a.pos[0] - n.x * ROOM_DEPTH, 1.3, a.pos[2] - n.z * ROOM_DEPTH)
    cameraFocus.fov = 48
    cameraFocus.active = true
  }
  const closeDoor = () => {
    setOpen(null)
    cameraFocus.active = false
    if (resume.current && !useFilm.getState().playing) useFilm.getState().togglePlay()
  }
  // Deep link: ?door=raft opens that project directly (shareable per project).
  useEffect(() => {
    const d = new URLSearchParams(location.search).get('door') as DoorId | null
    if (d && PROJECTS.some((p) => p.id === d)) openDoor(d)
  }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeDoor()
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  })

  // --- captions: open card > lit door > watch-mode stop ---------------------
  const active = open ?? hovered ?? stop?.door ?? null
  useEffect(() => {
    if (active) {
      const p = projectById(active)
      useCaption.setState({
        caption: {
          kicker: `${p.tag} · ${p.role[lang]}`,
          title: p.title,
          hook: p.hook[lang],
          line: p.stat[lang],
          body: p.plain[lang],
          details: p.blurb[lang],
          stack: p.stack,
          url: open || stop?.door === active ? p.url : undefined,
          accent: p.light,
          // Full card when the door is open, or when watch mode stops here.
          open: !!open || stop?.door === active,
        },
        close: open ? closeDoor : null,
      })
    } else if (bulbs || stop?.elixir) {
      useCaption.setState({
        caption: {
          kicker: `${SUPERVISED.tag} · Elixir / OTP`,
          title: SUPERVISED.title[lang],
          hook: SUPERVISED.hook[lang],
          line: SUPERVISED.line[lang],
          body: SUPERVISED.plain[lang],
          accent: '#8fc8ff',
          open: !!stop?.elixir,
        },
        close: null,
      })
    } else if (stop?.tower) {
      useCaption.setState({
        caption: {
          kicker: 'BEL · 900',
          title: MONOLITH.title[lang],
          hook: MONOLITH.hook[lang],
          line: MONOLITH.line[lang],
          body: MONOLITH.plain[lang],
          accent: '#9fd8ff',
          open: true,
        },
        close: null,
      })
    } else useCaption.setState({ caption: null, close: null })
  }, [active, open, stop, lang, bulbs])

  useFrame((_, delta) => {
    const { time, mode } = useFilm.getState()
    // The neon sign buzzes louder as you walk past it.
    setBedLevel('neon', MathUtils.clamp(1 - camera.position.distanceTo(NEON_SIGN) / 9, 0, 1) * 0.9)
    // Lightning: a double flicker in the sky, thunder a second or two later.
    const w = storm.current
    w.next -= delta
    if (w.next <= 0) {
      w.next = 22 + Math.random() * 22
      w.flash = 1
      w.thunder = 1 + Math.random() * 1.5
    }
    if (w.thunder > 0 && (w.thunder -= delta) <= 0) sfx('thunder', (Math.random() - 0.5) * 0.6)
    w.flash = Math.max(0, w.flash - delta * 2.2)
    const f = w.flash > 0.55 || (w.flash > 0.1 && w.flash < 0.3) ? w.flash : 0
    sky.current.intensity = 0.12 + f * 7
    const p = (time - start) / dur
    const s = mode === 'watch' ? (STOPS.find((x) => p >= x.from && p <= x.to) ?? null) : null
    if (s !== stop) setStop(s)

    // The flashlight: held low and to the right of the lens, pointing where the cursor does.
    cursorOnAlley(camera, tmp.hit)
    tmp.right.set(1, 0, 0).applyQuaternion(camera.quaternion)
    tmp.up.set(0, 1, 0).applyQuaternion(camera.quaternion)
    flash.current.position.copy(camera.position).addScaledVector(tmp.right, 0.28).addScaledVector(tmp.up, -0.22)
    flashTarget.position.lerp(tmp.hit, 0.5)
    flash.current.target = flashTarget

    let near: DoorId | null = null
    let best = 1.25
    for (const pr of PROJECTS) {
      const a = doorAnchor(pr.id)
      const d = Math.hypot(flashTarget.position.x - a.pos[0], (flashTarget.position.y - 1.3) * 0.8, flashTarget.position.z - a.pos[2])
      if (d < best) {
        best = d
        near = pr.id
      }
    }
    if (near !== litDoor) setLitDoor(near)

    // Security cameras: the head swivels on its mount to follow the flashlight's spot.
    // Worked out in each mount's own frame, where the lens rests facing +z (into the alley).
    for (const c of cams.current) {
      if (!c) continue
      c.parent!.worldToLocal(tmp.v.copy(flashTarget.position))
      const dx = tmp.v.x - c.position.x
      const dy = tmp.v.y - c.position.y
      const dz = tmp.v.z - c.position.z
      const yaw = MathUtils.clamp(Math.atan2(dx, dz), -1.1, 1.1)
      const pitch = MathUtils.clamp(Math.atan2(-dy, Math.hypot(dx, dz)), -0.25, 0.9)
      c.rotation.y += (yaw - c.rotation.y) * 0.06
      c.rotation.x += (pitch - c.rotation.x) * 0.06
    }

    // One shared light for whichever door is awake: inside the room, and a spill under the shutter.
    const lit = open ?? hovered ?? stop?.door ?? null
    if (lit) {
      const a = doorAnchor(lit)
      const n = inward(a, tmp.n)
      const color = projectById(lit).light
      room.current.position.set(a.pos[0] - n.x * 0.9, 0.9, a.pos[2] - n.z * 0.9)
      room.current.color.set(color)
      leak.current.position.set(a.pos[0] - n.x * 0.4, 0.35, a.pos[2] - n.z * 0.4)
      leakTarget.position.set(a.pos[0] + n.x * 2.5, 0, a.pos[2] + n.z * 2.5)
      leak.current.color.set(color)
      leak.current.target = leakTarget
    }
    const want = lit ? (open ? 9 : 7) : 0
    room.current.intensity += (want - room.current.intensity) * 0.08
    leak.current.intensity += ((lit ? (open ? 9 : 4.5) : 0) - leak.current.intensity) * 0.08
  })

  const lamps = ['lamp_left', 'lamp_right'].map((k) => {
    const a = anchor(k)
    const n = inward(a)
    return [a.pos[0] + n.x * 0.55, 3.62, a.pos[2] + n.z * 0.55] as [number, number, number]
  })

  return (
    <>
      <CameraRig chapter={chapter} keys={KEYS} sway={0.1} handheld={0.006} maxPull={1.7} bounds={keepInAlley} />
      <fogExp2 attach="fog" args={['#080b13', 0.03]} />
      <Environment files="/hdri/shanghai_bund.hdr" environmentIntensity={0.02} />
      {/* Static light is baked; these only touch what moves (shutters, cameras, the rat). */}
      <ambientLight intensity={0.05} color="#6f86b8" />
      {/* Cold sky spill from above the rooftops. */}
      <hemisphereLight ref={sky} args={['#34466e', '#000000', 0.25]} />

      {/* The set, as assembled in Blender, and the rooms behind its windows. */}
      <primitive object={set.scene} />
      <Interiors />

      {/* Wet asphalt: a blurred planar reflection of every neon and lamp. */}
      <mesh rotation-x={-Math.PI / 2} geometry={ground} receiveShadow>
        {lowTier ? (
          // Phones: no planar reflection (it renders the whole alley twice); the
          // environment map and the puddle roughness still read as wet.
          <meshStandardMaterial {...asphalt} roughnessMap={puddles} color="#4a4e58" metalness={0.55} roughness={0.9} envMapIntensity={6} />
        ) : (
        <MeshReflectorMaterial
          {...asphalt}
          roughnessMap={puddles}
          color="#4a4e58"
          resolution={512}
          blur={[160, 40]}
          mixBlur={0.6}
          mixStrength={7}
          mixContrast={1.2}
          mirror={0.92}
          metalness={0.4}
          roughness={1}
          depthScale={0.6}
          minDepthThreshold={0.2}
          maxDepthThreshold={1.6}
        />
        )}
      </mesh>

      <mesh rotation-x={-Math.PI / 2} position-y={0.002} geometry={ground} material={groundLight} />

      {/* The visitor's flashlight. */}
      <primitive object={flashTarget} />
      <spotLight
        ref={flash}
        name="cursor-light"
        angle={0.24}
        penumbra={0.55}
        intensity={24}
        decay={1.25}
        distance={30}
        color="#ffd2a0"
        castShadow
        shadow-mapSize={shadowSize}
        shadow-bias={-0.0003}
        shadow-camera-near={0.3}
        shadow-camera-far={30}
      />

      {/* Sodium street lamps (their light is in the lightmap; these are the bulbs). */}
      {lamps.map((p, i) => (
        <group key={i} position={p}>
          <mesh>
            <sphereGeometry args={[0.07, 12, 12]} />
            <meshBasicMaterial color="#ffc987" toneMapped={false} />
          </mesh>
        </group>
      ))}

      {/* The monogram as a projecting neon sign near the entrance. */}
      <group position={NEON_SIGN}>
        <NeonPath d={MONOGRAM} size={1.1} color="#ffb36b" intensity={6} flicker />
        <mesh position={[-0.62, 0, 0]}>
          <boxGeometry args={[0.5, 0.04, 0.04]} />
          <meshStandardMaterial color="#222" metalness={0.8} roughness={0.4} />
        </mesh>
      </group>

      {/* Doors. */}
      <primitive object={leakTarget} />
      <spotLight ref={leak} angle={1.1} penumbra={1} intensity={0} decay={2} distance={5} />
      <pointLight ref={room} intensity={0} distance={4.5} decay={1.6} />
      {PROJECTS.map((p) => (
        <Shutter
          key={p.id}
          project={p}
          shutter={shutterMesh}
          lift={open === p.id || stop?.door === p.id ? LIFT.open : hovered === p.id ? LIFT.peek : LIFT.closed}
          onHover={(on) => setHovered((h) => (on ? p.id : h === p.id ? null : h))}
          onOpen={() => (open === p.id ? closeDoor() : openDoor(p.id))}
        >
          {(() => {
            const Inst = INSTALLATIONS[p.id]
            const awake = open === p.id || hovered === p.id || stop?.door === p.id
            if (Inst) return <Inst w={(p.featured ? OPENING.large : OPENING.small).w} lang={lang} awake={awake} />
            // Doors whose installation isn't built yet show their number in neon (ROTEIRO §9, fase 7).
            return (
              <Text font={FONT_MONO} fontSize={0.16} letterSpacing={0.12} position={[0, 1.55, 0]} anchorX="center" maxWidth={1.3} textAlign="center">
                {p.stat[lang]}
                <meshStandardMaterial color="#000" emissive={p.light} emissiveIntensity={3.5} toneMapped={false} />
              </Text>
            )
          })()}
        </Shutter>
      ))}

      {/* Security cameras, bolted to the walls (their plate sits at the model's -z). */}
      {cameraRigs.map((m, i) => (
        <group key={i} ref={(g) => g && place(g, anchor(i ? 'camera_left' : 'camera_right'))}>
          <primitive object={m} position={[0, -0.12, 0.3]} scale={1.3} />
        </group>
      ))}

      <Manhole start={start} dur={dur} light={flashTarget.position} />
      <Tower lang={lang} />
      <SupervisorTree lang={lang} auto={!!stop?.elixir} onHover={setBulbs} />
      <Rain count={useQ(2400, 900)} />
      <Splashes half={HALF} z0={3} z1={TOWER_Z + 1} count={useQ(260, 110)} />
      {/* Steam rising from the manhole, lit by the lamps (and your flashlight). */}
      <Steam position={[HOLE.x, 0.05, HOLE.z]} spread={0.45} rise={2.6} life={5.5} size={1.4} count={46} color="#b8b0a8" opacity={0.11} drift={[0.3, 0.2]} />
      {/* Warm exhaust from the air-conditioners on the walls. */}
      <Steam position={[HALF - 0.6, 4.3, -15.2]} spread={0.3} rise={0.9} life={3.5} size={0.9} count={18} color="#9aa0aa" opacity={0.08} drift={[-0.8, 0]} />
      <Steam position={[-HALF + 0.6, 7.4, -5.8]} spread={0.3} rise={0.9} life={3.5} size={0.9} count={18} color="#9aa0aa" opacity={0.08} drift={[0.8, 0]} />
    </>
  )
}

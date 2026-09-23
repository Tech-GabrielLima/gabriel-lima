import { Environment, SpotLight, Text, useGLTF, useTexture, useEnvironment } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { CanvasTexture, Group, MathUtils, Mesh, Object3D, PointLight, RepeatWrapping, SpotLight as ThreeSpotLight, Vector3 } from 'three'
import { CameraRig } from '../../film/CameraRig'
import { TOTAL, chapterById } from '../../film/chapters'
import { cursor } from '../../film/cursor'
import { useEggs } from '../../film/eggs'
import { useFilm } from '../../film/store'
import { useQ, asset } from '../../film/quality'
import { useT } from '../../i18n'
import type { SceneProps } from '../SceneHost'
import { FONT_MARKER, FONT_MONO, FONT_SERIF, FONT_SERIF_ITALIC, cursorOnWall } from '../shared'
import { Dust } from './Dust'

// SCENE 01 — A CABINE (ROTEIRO §2). The projector turns on its stand to follow
// the cursor; the wall only shows what its beam touches; dust hangs in the
// light. At the end the machine finds the projection port and the camera
// flies down the beam, through the port, towards the screen.

const MODEL = asset('/models/filmstrip_projector_8mm.glb')
const LAMP = asset('/models/caged_hanging_light.glb')
const BOX = asset('/models/cardboard_box_01.glb')
const STOOL = asset('/models/metal_stool_01.glb')
const WALL_TEX = '/textures/concrete_wall_004'
const FLOOR_TEX = '/textures/concrete_floor_worn_001'
for (const u of [MODEL, LAMP, BOX, STOOL]) useGLTF.preload(u)
useEnvironment.preload({ files: '/hdri/studio_small_09.hdr' })
useTexture.preload([`${WALL_TEX}/diff.webp`, `${WALL_TEX}/nor.webp`, `${WALL_TEX}/rough.webp`, `${FLOOR_TEX}/diff.webp`])

const WALL_Z = -4
/** The projector sits on its stand at this height; its lens faces +Z (checked in Blender). */
const STAND: [number, number, number] = [0, 1.0, 0]
const LENS: [number, number, number] = [-0.06, 0.075, 0.15]
/** The machine's back edge (model z), its tilt hinge. */
const BACK_Z = -0.14
/** The projection port in the wall, where the beam goes at the end. */
const PORT = { x: 0, y: 1.25, w: 0.62, h: 0.4 }
const WALL = { w: 10, h: 5, y: 2 }
const REELS = ['filmstrip_projector_8mm_spool_feed', 'filmstrip_projector_8mm_01_film_side', 'filmstrip_projector_8mm_film', 'filmstrip_projector_8mm_spool_takeup']
const SPIDER = new Vector3(2.55, 2.85, WALL_Z + 0.02)

/** Wall alpha: opaque everywhere except the projection port. */
function portAlpha() {
  const c = document.createElement('canvas')
  c.width = 1000
  c.height = 500
  const g = c.getContext('2d')!
  g.fillStyle = '#fff'
  g.fillRect(0, 0, c.width, c.height)
  g.fillStyle = '#000'
  const px = (x: number) => ((x + WALL.w / 2) / WALL.w) * c.width
  const py = (y: number) => (1 - (y - (WALL.y - WALL.h / 2)) / WALL.h) * c.height
  g.fillRect(px(PORT.x - PORT.w / 2), py(PORT.y + PORT.h / 2), px(PORT.x + PORT.w / 2) - px(PORT.x - PORT.w / 2), py(PORT.y - PORT.h / 2) - py(PORT.y + PORT.h / 2))
  return new CanvasTexture(c)
}

function Poster({ position, rotation = 0, size, children }: { position: [number, number, number]; rotation?: number; size: [number, number]; children: React.ReactNode }) {
  return (
    <group position={position} rotation-z={rotation}>
      <mesh receiveShadow>
        <planeGeometry args={size} />
        <meshStandardMaterial color="#cfc2a8" roughness={1} />
      </mesh>
      <group position={[0, 0, 0.003]}>{children}</group>
    </group>
  )
}

const ink = <meshStandardMaterial color="#1a1512" roughness={1} />

export default function Booth({ chapter }: SceneProps) {
  const t = useT()
  const camera = useThree((s) => s.camera)
  const { scene } = useGLTF(MODEL)
  const lamp = useGLTF(LAMP)
  const box = useGLTF(BOX)
  const stool = useGLTF(STOOL)
  const { start, dur } = chapterById(chapter)

  const head = useRef<Group>(null!)
  const tilt = useRef<Group>(null!)
  const lens = useRef<Group>(null!)
  const beam = useRef<ThreeSpotLight>(null!)
  const bulb = useRef<PointLight>(null!)
  const leak = useRef<PointLight>(null!)
  const spider = useRef<Group>(null!)
  const target = useMemo(() => new Object3D(), [])
  const tmp = useMemo(() => ({ hit: new Vector3(), dir: new Vector3(), port: new Vector3(PORT.x, PORT.y, WALL_Z), a: new Vector3() }), [])
  const beamOrigin = useMemo(() => new Vector3(), [])
  const beamDir = useMemo(() => new Vector3(0, 0, -1), [])
  const reels = useMemo(() => REELS.map((n) => scene.getObjectByName(n)).filter(Boolean) as Object3D[], [scene])
  const spiderState = useRef({ lit: 0, drop: 0 })
  const alpha = useMemo(portAlpha, [])

  const wall = useTexture({ map: `${WALL_TEX}/diff.webp`, normalMap: `${WALL_TEX}/nor.webp`, roughnessMap: `${WALL_TEX}/rough.webp` })
  for (const tex of Object.values(wall)) {
    tex.wrapS = tex.wrapT = RepeatWrapping
    tex.repeat.set(4, 2)
  }
  const floor = useTexture(`${FLOOR_TEX}/diff.webp`)
  floor.wrapS = floor.wrapT = RepeatWrapping
  floor.repeat.set(4, 4)
  const box2 = useMemo(() => box.scene.clone(), [box])

  useEffect(() => {
    for (const s of [scene, lamp.scene, box.scene, box2, stool.scene])
      s.traverse((o) => {
        if ((o as Mesh).isMesh) o.castShadow = o.receiveShadow = true
      })
    return () => {
      for (const u of [MODEL, LAMP, BOX, STOOL]) useGLTF.clear(u)
    }
  }, [scene, lamp, box, box2, stool])

  useFrame((state, delta) => {
    const { time, playing } = useFilm.getState()
    const p = (time - start) / dur

    // Aim: the cursor's spot on the wall — until the end, when the machine finds the port.
    cursorOnWall(camera, WALL_Z, tmp.hit)
    if (!cursor.active) {
      // Nobody holding the light (a phone, or a still mouse): the projectionist reads the wall —
      // across the name left to right, down to the title, over to the line in the corner.
      const e = state.clock.elapsedTime * 0.32
      const u = (Math.sin(e) + 1) / 2
      tmp.hit.set(MathUtils.lerp(-1.8, 1.8, u), 2.4 - (Math.sin(e * 0.5) + 1) * 0.35, WALL_Z)
    }
    tmp.hit.x = MathUtils.clamp(tmp.hit.x, -3.2, 3.2)
    tmp.hit.y = MathUtils.clamp(tmp.hit.y, 0.5, 3.4)
    const auto = MathUtils.smoothstep(p, 0.74, 0.84)
    tmp.hit.lerp(tmp.port, auto)
    tmp.dir.set(tmp.hit.x - STAND[0], tmp.hit.y - STAND[1] - LENS[1], tmp.hit.z - STAND[2])
    const yaw = Math.atan2(tmp.dir.x, tmp.dir.z)
    const pitch = -Math.atan2(tmp.dir.y, Math.hypot(tmp.dir.x, tmp.dir.z))
    // A heavy machine on a stand lags behind the hand.
    const k = 1 - Math.exp(-delta * (auto > 0 ? 6 : 4))
    head.current.rotation.y += (MathUtils.euclideanModulo(yaw - head.current.rotation.y + Math.PI, Math.PI * 2) - Math.PI) * k
    // Only ever tilt up (negative x): pointing below the lens would push the front into the plate.
    tilt.current.rotation.x += (Math.min(0, pitch) - tilt.current.rotation.x) * k
    beam.current.target = target

    lens.current.getWorldPosition(beamOrigin)
    target.getWorldPosition(tmp.a)
    beamDir.subVectors(tmp.a, beamOrigin).normalize()

    // Reels turn while the film runs (feed and take-up at the same angular speed).
    const spin = (playing ? 2.4 : 0.3) * delta
    for (const r of reels) r.rotation.x -= spin

    const e = state.clock.elapsedTime
    const flicker = Math.sin(e * 23) * Math.sin(e * 7.3) > 0.93 ? 0.2 : 1
    bulb.current.intensity = 0.9 * flicker + Math.sin(e * 3) * 0.05
    leak.current.intensity = (playing ? 0.34 : 0.1) + 0.08 * Math.sign(Math.sin(e * Math.PI * 2 * 18))

    // Easter egg: hold the beam on the web for three seconds and its owner comes down.
    const sp = spiderState.current
    const onWeb = tmp.hit.distanceTo(SPIDER) < 0.55
    sp.lit = onWeb ? sp.lit + delta : Math.max(0, sp.lit - delta * 0.5)
    if (sp.lit > 3 && sp.drop === 0) {
      sp.drop = 0.001
      useEggs.getState().find('spider')
    }
    if (sp.drop > 0) sp.drop = Math.min(1, sp.drop + delta * 0.6)
    spider.current.position.y = SPIDER.y + 0.25 - sp.drop * 0.55
    spider.current.scale.setScalar(sp.drop > 0 ? 1 : 0)
  })

  return (
    <>
      <CameraRig
        chapter={chapter}
        sway={0.08}
        keys={[
          // Macro on the feed reel turning (the machine faces the wall, so its front is at -z)…
          { at: 0, pos: [0.42, 1.36, -0.46], look: [0.06, 1.27, -0.12], fov: 30 },
          // …dolly out and round to frame the whole machine…
          { at: 0.32, pos: [1.05, 1.45, -0.2], look: [0, 1.12, 0], fov: 34 },
          // …settle behind it, looking down the beam at the wall.
          { at: 0.55, pos: [0.4, 1.55, 1.5], look: [0, 1.6, WALL_Z], fov: 40 },
          { at: 0.78, pos: [0.25, 1.5, 1.2], look: [0, 1.5, WALL_Z], fov: 40 },
          // The machine finds the port; the camera rides the beam through it.
          { at: 0.9, pos: [0.02, 1.3, -2.6], look: [0, 1.25, WALL_Z - 6], fov: 44 },
          { at: 1, pos: [0, 1.25, WALL_Z - 1.2], look: [0, 1.2, -18], fov: 50 },
        ]}
      />
      <Environment files="/hdri/studio_small_09.hdr" environmentIntensity={0.012} />
      <ambientLight intensity={0.004} />

      <group position={STAND}>
        {/* Yaw, then pitch in the turned frame: the machine faces away from its rest pose. */}
        {/* Yaw on the turntable; tilt about the machine's back edge, like a projector raising its front feet —
            so the front can lift but never sink into the plate. */}
        <group ref={head} rotation-y={Math.PI}>
          <group ref={tilt} position={[0, 0, BACK_Z]}>
          <group position={[0, 0, -BACK_Z]}>
          <primitive object={scene} />
          {/* Lamp-house spill through the vents, pulsing with the 18 fps shutter. */}
          <pointLight ref={leak} position={[0.05, 0.2, -0.05]} color="#ff9a4a" distance={1.4} decay={2} />
          <group ref={lens} position={LENS}>
            <SpotLight
              ref={beam}
              name="cursor-light"
              angle={0.2}
              penumbra={0.35}
              intensity={90}
              decay={1.3}
              distance={24}
              color="#ffd6a0"
              attenuation={6}
              anglePower={4}
              opacity={0.45}
              castShadow
              shadow-mapSize={useQ([1024, 1024], [512, 512])}
              shadow-bias={-0.0004}
            />
            <primitive object={target} position={[0, 0, 4]} />
          </group>
          </group>
          </group>
        </group>
        <mesh position={[0, -0.5, 0]} castShadow>
          <cylinderGeometry args={[0.035, 0.035, 1, 12]} />
          <meshStandardMaterial color="#2a2b2e" metalness={0.8} roughness={0.45} />
        </mesh>
        <mesh position={[0, -0.01, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.36, 0.02, 0.66]} />
          <meshStandardMaterial color="#1c1d20" metalness={0.7} roughness={0.5} />
        </mesh>
      </group>
      <Dust origin={beamOrigin} dir={beamDir} angle={0.2} count={useQ(2200, 900)} />

      {/* The bare caged bulb, and its light. */}
      <group position={[1.35, 3.1, 1.2]} scale={0.6}>
        <primitive object={lamp.scene} />
      </group>
      <pointLight ref={bulb} position={[1.35, 2.75, 1.2]} color="#ffb36b" distance={4.5} decay={2} />

      {/* Set dressing: film cans in boxes, a stool. */}
      <primitive object={box.scene} position={[-1.7, 0, -2.6]} rotation-y={0.4} />
      <primitive object={box2} position={[-1.55, 0.34, -2.55]} rotation-y={-0.2} scale={0.85} />
      <primitive object={stool.scene} position={[1.1, 0, 0.6]} rotation-y={0.6} />

      {/* The booth's front wall, with its projection port. */}
      <mesh position={[0, WALL.y, WALL_Z]} receiveShadow>
        <planeGeometry args={[WALL.w, WALL.h]} />
        <meshStandardMaterial {...wall} color="#8c8378" alphaMap={alpha} alphaTest={0.5} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[10, 10]} />
        <meshStandardMaterial map={floor} color="#6a6560" roughness={0.9} />
      </mesh>
      {/* Beyond the port, far below: the auditorium's screen, faintly lit. */}
      <mesh position={[0, 0.2, -20]} receiveShadow>
        <planeGeometry args={[9, 4]} />
        <meshStandardMaterial color="#7a746a" roughness={1} emissive="#1a140e" />
      </mesh>

      {/* What the beam reveals (ROTEIRO, Cena 01). */}
      <group position={[0, 0, WALL_Z + 0.01]}>
        <Text font={FONT_SERIF} fontSize={0.72} anchorX="center" position={[0, 2.35, 0]}>
          GABRIEL LIMA
          <meshStandardMaterial color="#efe4d2" roughness={0.95} />
        </Text>
        <Text font={FONT_MONO} fontSize={0.1} letterSpacing={0.35} anchorX="center" position={[0, 1.78, 0]}>
          {t.slate.booth.toUpperCase()}
          <meshStandardMaterial color="#d6cab8" roughness={1} />
        </Text>
        <Text font={FONT_MARKER} fontSize={0.2} anchorX="left" position={[1.05, 0.72, 0]} rotation-z={0.06} maxWidth={2}>
          {`“${t.slate.studio}”`}
          <meshStandardMaterial color="#c9b9a2" roughness={1} />
        </Text>
        <Text font={FONT_MONO} fontSize={0.07} letterSpacing={0.4} anchorX="left" position={[-3.0, 3.25, 0]}>
          EST. 2022
          <meshStandardMaterial color="#b3a794" roughness={1} />
        </Text>

        <Poster position={[-2.35, 1.55, 0.004]} rotation={-0.04} size={[0.9, 1.3]}>
          <Text font={FONT_MONO} fontSize={0.045} letterSpacing={0.3} anchorX="center" position={[0, 0.5, 0]}>
            {t.tonight}
            {ink}
          </Text>
          <Text font={FONT_SERIF} fontSize={0.2} anchorX="center" textAlign="center" maxWidth={0.8} lineHeight={0.95} position={[0, 0.12, 0]}>
            {t.film}
            {ink}
          </Text>
          <Text font={FONT_SERIF_ITALIC} fontSize={0.06} anchorX="center" position={[0, -0.28, 0]}>
            {t.by}
            {ink}
          </Text>
          <Text font={FONT_MONO} fontSize={0.035} letterSpacing={0.25} anchorX="center" position={[0, -0.52, 0]}>
            {`00:00 · ${String(Math.floor(TOTAL / 60)).padStart(2, '0')}:${String(Math.round(TOTAL % 60)).padStart(2, '0')}`}
            {ink}
          </Text>
        </Poster>
        <Poster position={[2.3, 1.45, 0.004]} rotation={0.05} size={[1.1, 0.8]}>
          <Text font={FONT_SERIF} fontSize={0.17} anchorX="center" textAlign="center" maxWidth={1} lineHeight={1} position={[0, 0.03, 0]}>
            {t.tagline}
            {ink}
          </Text>
        </Poster>

        {/* A web in the corner, and (if you wait) its owner. */}
        <group position={[SPIDER.x, SPIDER.y + 0.22, 0.01]}>
          {Array.from({ length: 7 }, (_, i) => (
            <mesh key={i} rotation-z={(i / 7) * Math.PI}>
              <planeGeometry args={[0.7, 0.003]} />
              <meshStandardMaterial color="#d8d0c4" transparent opacity={0.5} roughness={1} />
            </mesh>
          ))}
          {[0.08, 0.16, 0.25, 0.33].map((r) => (
            <mesh key={r}>
              <ringGeometry args={[r, r + 0.003, 14]} />
              <meshStandardMaterial color="#d8d0c4" transparent opacity={0.4} roughness={1} />
            </mesh>
          ))}
        </group>
        <group ref={spider} position={[SPIDER.x, SPIDER.y, 0.03]}>
          <mesh>
            <sphereGeometry args={[0.035, 10, 10]} />
            <meshStandardMaterial color="#0d0b0a" roughness={0.5} />
          </mesh>
          {Array.from({ length: 8 }, (_, i) => (
            <mesh key={i} rotation-z={(i < 4 ? 0.5 : Math.PI - 0.5) + ((i % 4) - 1.5) * 0.35}>
              <boxGeometry args={[0.16, 0.005, 0.005]} />
              <meshStandardMaterial color="#0d0b0a" />
            </mesh>
          ))}
          <mesh position={[0, 0.3, 0]}>
            <boxGeometry args={[0.002, 0.6, 0.002]} />
            <meshStandardMaterial color="#d8d0c4" transparent opacity={0.5} />
          </mesh>
        </group>
      </group>
    </>
  )
}

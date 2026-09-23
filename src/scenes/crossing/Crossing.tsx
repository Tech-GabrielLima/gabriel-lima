import { Environment, Text, useGLTF } from '@react-three/drei'
import { useFrame, useLoader, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import { DataTexture, EquirectangularReflectionMapping, Group, MathUtils, Mesh, MeshStandardMaterial, Object3D, PointLight, Raycaster, Vector3 } from 'three'
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js'
import { MILESTONES } from '../../content/about'
import { sfx, panFor } from '../../film/audio'
import { CameraRig } from '../../film/CameraRig'
import { useCaption } from '../../film/caption'
import { cursor } from '../../film/cursor'
import { useEggs } from '../../film/eggs'
import { useFilm } from '../../film/store'
import { useContact } from '../../ui/ContactPanel'
import type { SceneProps } from '../SceneHost'
import { FONT_MONO, FONT_SERIF, FONT_SERIF_ITALIC } from '../shared'
import { Ocean } from './Ocean'
import { Steam } from '../fx/Steam'
import { asset } from '../../film/quality'

// SCENE 04 — A TRAVESSIA (ROTEIRO §2): the career as a pier at night. Each
// lantern is a milestone; carry your own lantern (the cursor) past it and the
// flame jumps across, and the year is carved into the planks. The moon rises
// at the far end, its path on the water pointing where the film goes next.

const M = (n: string) => asset(`/models/${n}.glb`)
const MODELS = ['modular_wooden_pier', 'wooden_lantern_01', 'ocean_buoy', 'lifebuoy', 'seadogs_compass', 'treasure_chest'].map(M)
for (const u of MODELS) useGLTF.preload(u)
const SKY = '/hdri/kloppenheim_02_puresky.hdr'
useLoader.preload(RGBELoader, SKY)
/** Poly Haven's night skies are stored brightened; this brings them back to night (background and reflections). */
const SKY_GAIN = 0.045

/** three negates backgroundRotation internally, so the ocean's reflection lookup uses -SKY_ROT. Rotates the sky so the low moon (found in the HDRI at 36° azimuth, 17° up) sits straight down the pier (-z). */
const SKY_ROT = 2.2
const DECK = 2.67
const EYE = DECK + 1.6
const PIER_LEN = 19.03
const LANTERN_Z = [-0.6, -2.0, -7, -12, -17, -22, -27.5, -34]
const LANTERN_X = [1.02, 1.02, -1.02, 1.02, -1.02, 1.02, -1.02, 0.4]
const COMPASS = new Vector3(0.75, DECK + 0.46, 3.2)
const CHEST = new Vector3(-0.55, DECK, -35.2)
const LIGHTHOUSES = [new Vector3(-70, 7, -230), new Vector3(25, 6, -260), new Vector3(95, 8, -215)]

const ray = new Raycaster()
const o3 = new Object3D()

export default function Crossing({ chapter }: SceneProps) {
  const lang = useFilm((s) => s.lang)
  const camera = useThree((s) => s.camera)
  const [pier, lanternModel, buoy, lifebuoy, compass, chest] = useGLTF(MODELS)
  const sky = useLoader(RGBELoader, SKY) as DataTexture
  sky.mapping = EquirectangularReflectionMapping

  const hand = useRef<Group>(null!)
  const handLight = useRef<PointLight>(null!)
  const lights = useRef<PointLight[]>([])
  const glass = useRef<MeshStandardMaterial[]>([])
  const words = useRef<Mesh[][]>([])
  const houses = useRef<Mesh[]>([])
  const buoyRef = useRef<Group>(null!)
  const lanternPos = useMemo(() => new Vector3(0, EYE, 2), [])
  const vel = useMemo(() => new Vector3(), [])
  const target = useMemo(() => new Vector3(), [])
  const lit = useRef(MILESTONES.map(() => 0))
  const st = useRef({ corner: 0, spin: 0, chestOpen: 0, bell: 5 })
  const [current, setCurrent] = useState(-1)

  // Three copies of the pier kit make ~57 m of pier.
  const piers = useMemo(() => [0, 1, 2].map((k) => (k ? pier.scene.clone() : pier.scene)), [pier])
  const lanterns = useMemo(() => MILESTONES.map(() => lanternModel.scene.clone(true)), [lanternModel])
  const handLantern = useMemo(() => lanternModel.scene.clone(true), [lanternModel])
  const needle = useMemo(() => compass.scene.getObjectByName('seadogs_compass_needle')!, [compass])
  const lid = useMemo(() => chest.scene.getObjectByName('treasure_chest_lid')!, [chest])

  // Each lantern's glass gets its own material, so it can light up on its own.
  useEffect(() => {
    lanterns.forEach((l, i) =>
      l.traverse((o) => {
        const m = o as Mesh
        if (!m.isMesh) return
        const mat = (m.material as MeshStandardMaterial).clone()
        mat.emissive.set('#ff9a3d')
        mat.emissiveIntensity = 0
        m.material = mat
        glass.current[i] = mat
      }),
    )
    handLantern.traverse((o) => {
      const m = o as Mesh
      if (m.isMesh) {
        const mat = (m.material as MeshStandardMaterial).clone()
        mat.emissive.set('#ffb36b')
        mat.emissiveIntensity = 0.6
        m.material = mat
      }
    })
    return () => {
      document.body.style.cursor = ''
      useCaption.setState({ caption: null, close: null })
      for (const u of MODELS) useGLTF.clear(u)
    }
  }, [lanterns, handLantern])

  // Caption for the milestone you're walking past.
  useEffect(() => {
    if (current < 0)
      return void useCaption.setState({
        caption: {
          kicker: `04 · ${lang === 'pt' ? 'TRAJETÓRIA' : 'JOURNEY'}`,
          title: lang === 'pt' ? 'Quatro anos, um píer' : 'Four years, one pier',
          hook: lang === 'pt' ? 'Cada lampião é um capítulo. Leve o seu (o cursor) até ele para acender.' : 'Every lantern is a chapter. Bring yours (the cursor) close to light it.',
          accent: '#ffb36b',
        },
        close: null,
      })
    const m = MILESTONES[current]
    useCaption.setState({
      caption: {
        kicker: `04 · ${lang === 'pt' ? 'TRAJETÓRIA' : 'JOURNEY'} · ${m.year}`,
        title: m.title[lang],
        hook: m.line[lang],
        accent: '#ffb36b',
        open: !!m.future,
        action: m.future ? { label: lang === 'pt' ? '☎ Vamos conversar' : '☎ Let’s talk', run: () => useContact.getState().set(true) } : undefined,
      },
      close: null,
    })
  }, [current, lang])

  const openChest = () => {
    if (st.current.chestOpen > 0) return
    st.current.chestOpen = 0.001
    useEggs.getState().find('chest')
    sfx('scrape', panFor(CHEST, camera), 0.6)
    setTimeout(() => useContact.getState().set(true), 1400)
  }

  useFrame((state, delta) => {
    const { mode } = useFilm.getState()
    const e = state.clock.elapsedTime
    const s = st.current

    // The lantern in your hand: aimed where the cursor meets the deck, swinging on its handle.
    ray.setFromCamera(cursor.pos, camera)
    const d = ray.ray.direction
    const org = ray.ray.origin
    const tDeck = d.y < -1e-3 ? (DECK - org.y) / d.y : 12
    target.copy(d).multiplyScalar(MathUtils.clamp(tDeck, 1, 14)).add(org)
    target.y = Math.max(target.y, DECK) + 0.75
    target.x = MathUtils.clamp(target.x, -5, 5)
    vel.addScaledVector(target.clone().sub(lanternPos), delta * 18).multiplyScalar(Math.exp(-delta * 6))
    lanternPos.addScaledVector(vel, delta)
    hand.current.position.copy(lanternPos)
    hand.current.rotation.z = MathUtils.clamp(-vel.x * 0.18, -0.6, 0.6)
    hand.current.rotation.x = MathUtils.clamp(vel.z * 0.18, -0.6, 0.6)
    handLight.current.intensity = 2.6 + Math.sin(e * 17) * 0.15 + Math.sin(e * 5.3) * 0.2

    // Flames jump from your lantern to the milestones you pass (or the film lights them for you).
    let near = -1
    let nearD = Infinity
    MILESTONES.forEach((m, i) => {
      const lz = LANTERN_Z[i]
      const reach = lanternPos.distanceTo(o3.position.set(LANTERN_X[i], DECK + 0.3, lz)) < 1.4
      const passed = mode === 'watch' && camera.position.z < lz + 4.5 && !m.future
      if ((reach || passed) && lit.current[i] === 0) {
        lit.current[i] = 0.001
        sfx('zap', panFor(o3.position, camera), 0.4)
      }
      if (lit.current[i] > 0) lit.current[i] = Math.min(1, lit.current[i] + delta * 1.5)
      const g = glass.current[i]
      if (g) g.emissiveIntensity = lit.current[i] * (2.4 + Math.sin(e * 11 + i) * 0.25)
      for (const w of words.current[i] ?? []) if (w) (w.material as MeshStandardMaterial).opacity = lit.current[i]
      // The milestone being read: the nearest lit one ahead of the camera.
      const ahead = camera.position.z - lz
      if (lit.current[i] > 0.3 && ahead > 1.2 && ahead < 9.5 && ahead < nearD) {
        nearD = ahead
        near = i
      }
    })
    if (near !== current) setCurrent(near)
    // Two real lights follow the two nearest lit lanterns; the rest glow by emission.
    const order = MILESTONES.map((_, i) => i)
      .filter((i) => lit.current[i] > 0)
      .sort((a, b) => Math.abs(camera.position.z - LANTERN_Z[a]) - Math.abs(camera.position.z - LANTERN_Z[b]))
    lights.current.forEach((l, k) => {
      const i = order[k]
      if (i === undefined) return void (l.intensity = 0)
      l.position.set(LANTERN_X[i], DECK + 0.35, LANTERN_Z[i])
      l.intensity = 3.2 * lit.current[i]
    })

    // Distant lighthouses keeping consensus: the leader flashes, the others answer after a delay.
    const beat = (e % 1.8) / 1.8
    houses.current.forEach((h, i) => {
      if (!h) return
      const delay = [0, 0.12, 0.22][i]
      const pulse = Math.exp(-((beat - delay) ** 2) * 900)
      ;(h.material as MeshStandardMaterial).emissiveIntensity = 0.4 + pulse * 14
    })

    // Easter egg: hold the cursor in the bottom-left corner and the compass loses its mind.
    s.corner = cursor.pos.x < -0.78 && cursor.pos.y < -0.55 ? s.corner + delta : 0
    if (s.corner > 1.2) s.spin = 1
    s.spin = Math.max(0, s.spin - delta * 0.25)
    const aimAt = s.spin > 0.3 ? CHEST : lanternPos
    const want = Math.atan2(aimAt.x - COMPASS.x, aimAt.z - COMPASS.z)
    needle.rotation.y = s.spin > 0.6 ? needle.rotation.y + delta * 25 : needle.rotation.y + (want - needle.rotation.y) * 0.1
    if (s.chestOpen > 0) s.chestOpen = Math.min(1, s.chestOpen + delta * 1.2)
    lid.rotation.x = -s.chestOpen * 1.6

    // A buoy rides the swell, its bell rings now and then.
    buoyRef.current.position.y = Math.sin(e * 0.9) * 0.25 - 0.3
    buoyRef.current.rotation.z = Math.sin(e * 0.7) * 0.12
    s.bell -= delta
    if (s.bell <= 0) {
      s.bell = 7 + Math.random() * 8
      sfx('bell', panFor(buoyRef.current.position, camera), 0.5)
    }
  })

  const hot = (v: boolean) => () => (document.body.style.cursor = v ? 'pointer' : '')

  return (
    <>
      <CameraRig
        chapter={chapter}
        sway={0.14}
        handheld={0.008}
        keys={[
          // Out of the water: the camera surfaces by the pier.
          { at: 0, pos: [2.6, 0.5, 7], look: [0, 3, -30], fov: 44 },
          { at: 0.08, pos: [0.3, EYE, 5.5], look: [0, 3.6, -40], fov: 42 },
          // The walk: slow, down the pier towards the moon.
          { at: 0.84, pos: [0, EYE, -31.5], look: [0, 3.9, -60], fov: 42 },
          // The last lantern, and the chest.
          { at: 0.9, pos: [0.2, EYE - 0.2, -32.2], look: [0, 3.2, -36], fov: 40 },
          // Up along the moon's path on the water.
          { at: 1, pos: [0, 12, -60], look: [0, 30, -240], fov: 36 },
        ]}
      />
      <Environment map={sky} background backgroundRotation={[0, SKY_ROT, 0]} environmentRotation={[0, SKY_ROT, 0]} environmentIntensity={SKY_GAIN * 2} backgroundIntensity={SKY_GAIN} />
      <fog attach="fog" args={['#070b14', 70, 260]} />
      <directionalLight position={[0, 40, -200]} intensity={0.35} color="#b8c8ff" />
      <ambientLight intensity={0.04} color="#8fa8ff" />

      {/* Mist drifting low over the water on both sides of the pier. */}
      {[-9, 9, -18, 18].map((x, i) => (
        <Steam key={i} position={[x, 0.2, -18 - i * 6]} spread={16} rise={1.5} life={14} size={9} count={26} color="#8ea0c0" opacity={0.05} drift={[x > 0 ? -2 : 2, -1]} />
      ))}
      <Ocean sky={sky} skyRotation={-SKY_ROT} skyGain={SKY_GAIN} lantern={lanternPos} />

      {piers.map((s, k) => (
        <primitive key={k} object={s} position={[0, 0, -PIER_LEN * k]} />
      ))}

      {/* Milestone lanterns and their carved words. */}
      {MILESTONES.map((m, i) => (
        <group key={i}>
          <primitive
            object={lanterns[i]}
            position={[LANTERN_X[i], DECK, LANTERN_Z[i]]}
            scale={m.small ? 0.8 : m.anchor ? 1.4 : m.future ? 1.6 : 1.1}
            onClick={m.future ? () => useContact.getState().set(true) : undefined}
            onPointerOver={m.future ? hot(true) : undefined}
            onPointerOut={m.future ? hot(false) : undefined}
          />
          {/* A wooden sign by each lantern, angled towards the walk so it reads as you approach. */}
          <group
            position={m.future ? [0, DECK + 1.7, LANTERN_Z[i] - 0.6] : [Math.sign(LANTERN_X[i]) * 2.05, DECK + 1.35, LANTERN_Z[i] - 1.2]}
            rotation-y={m.future ? 0 : -Math.sign(LANTERN_X[i]) * 0.62}
          >
            <mesh position={[0, 0, -0.03]}>
              <boxGeometry args={[1.8, 1.05, 0.05]} />
              <meshStandardMaterial color="#3b2a1c" roughness={0.9} />
            </mesh>
            <mesh position={[0, -2.1, -0.03]}>
              <boxGeometry args={[0.07, 3.4, 0.07]} />
              <meshStandardMaterial color="#2a1d14" roughness={0.9} />
            </mesh>
            {[
              <Text key="y" font={FONT_MONO} fontSize={0.09} letterSpacing={0.25} anchorX="center" anchorY="bottom" position={[0, 0.33, 0]}>
                {m.year}
                <meshStandardMaterial color="#ffcf8a" emissive="#ff9a3d" emissiveIntensity={0.9} transparent opacity={0} />
              </Text>,
              <Text key="t" font={FONT_SERIF} fontSize={0.19} anchorX="center" anchorY="top" textAlign="center" position={[0, 0.29, 0]} maxWidth={1.6} lineHeight={1.05}>
                {m.title[lang]}
                <meshStandardMaterial color="#fff0d8" emissive="#ffb36b" emissiveIntensity={0.6} transparent opacity={0} />
              </Text>,
              <Text key="l" font={FONT_SERIF_ITALIC} fontSize={0.072} anchorX="center" anchorY="bottom" textAlign="center" position={[0, -0.44, 0]} maxWidth={1.55} lineHeight={1.25}>
                {m.line[lang]}
                <meshStandardMaterial color="#f0dcc0" emissive="#ffb36b" emissiveIntensity={0.3} transparent opacity={0} />
              </Text>,
            ].map((el, k) => (
              <group key={k} ref={(g) => g && ((words.current[i] ??= [])[k] = g.children[0] as Mesh)}>
                {el}
              </group>
            ))}
          </group>
        </group>
      ))}
      <pointLight ref={(l) => void (lights.current[0] = l!)} color="#ff9a3d" distance={6} decay={2} intensity={0} />
      <pointLight ref={(l) => void (lights.current[1] = l!)} color="#ff9a3d" distance={6} decay={2} intensity={0} />

      {/* Your lantern. */}
      <group ref={hand}>
        <primitive object={handLantern} position={[0, -0.45, 0]} scale={0.8} />
        <pointLight ref={handLight} name="cursor-light" position={[0, -0.25, 0]} color="#ffb36b" distance={9} decay={1.6} />
      </group>

      {/* Props: compass on a crate, lifebuoy, a buoy out at sea, the chest at the end. */}
      <mesh position={[COMPASS.x, DECK + 0.22, COMPASS.z]}>
        <boxGeometry args={[0.5, 0.44, 0.4]} />
        <meshStandardMaterial color="#3a2a1c" roughness={0.9} />
      </mesh>
      <primitive object={compass.scene} position={COMPASS} scale={2} />
      <primitive object={lifebuoy.scene} position={[-1.2, DECK + 0.45, -9.6]} rotation-y={Math.PI / 2} />
      <group ref={buoyRef} position={[9, -0.3, -20]}>
        <primitive object={buoy.scene} />
      </group>
      <group position={CHEST} rotation-y={0.4} onClick={openChest} onPointerOver={hot(true)} onPointerOut={hot(false)}>
        <primitive object={chest.scene} scale={0.8} />
      </group>

      {/* Three lighthouses on the horizon, in consensus. */}
      {LIGHTHOUSES.map((pos, i) => (
        <group key={i} position={pos}>
          <mesh ref={(m) => void (houses.current[i] = m!)}>
            <sphereGeometry args={[0.9, 12, 12]} />
            <meshStandardMaterial color="#000" emissive="#fff2d0" emissiveIntensity={0.4} toneMapped={false} fog={false} />
          </mesh>
          <mesh position={[0, -4, 0]}>
            <cylinderGeometry args={[0.6, 1.1, 8, 10]} />
            <meshStandardMaterial color="#0c1018" />
          </mesh>
        </group>
      ))}
    </>
  )
}

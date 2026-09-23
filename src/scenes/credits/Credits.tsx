import { SpotLight, Text, useGLTF, useTexture } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  BoxGeometry,
  Color,
  Group,
  InstancedMesh,
  MathUtils,
  Object3D,
  PlaneGeometry,
  Raycaster,
  RectAreaLight,
  RepeatWrapping,
  SpotLight as ThreeSpotLight,
  Vector3,
} from 'three'
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { CREDITS } from '../../content/contact'
import { creditNames } from '../../content/soundCredits'
import { panFor, sfx } from '../../film/audio'
import { CameraRig, cameraFocus } from '../../film/CameraRig'
import { useCaption } from '../../film/caption'
import { TOTAL, chapterById } from '../../film/chapters'
import { cursor } from '../../film/cursor'
import { EGG_COUNT, useEggs } from '../../film/eggs'
import { useFilm } from '../../film/store'
import { useQ, asset } from '../../film/quality'
import { useT } from '../../i18n'
import { useContact } from '../../ui/ContactPanel'
import type { SceneProps } from '../SceneHost'
import { FONT_MONO, FONT_SERIF, FONT_SERIF_ITALIC } from '../shared'
import { Dust } from '../booth/Dust'
import { goExit } from '../../lobby/preload'
import { ExitDoor } from './ExitDoor'
import { useLive } from '../../live/live'

// SCENE 06 — CRÉDITOS (ROTEIRO §2) and the post-credits duck (Cena 07).
// The empty auditorium seen from the stalls: the credits roll, the screen's
// light washes over the seats, the aisle lights come up, and the phone on the
// wall rings — the film literally calls you. Answering opens the contact.
// Beside it, under the exit sign, a door leads out of the film: Act III.

RectAreaLightUniformsLib.init()

const PHONE = asset('/models/vintage_telephone_wall_clock.glb')
const DUCK = asset('/models/rubber_duck_toy.glb')
const VELVET = '/textures/velour_velvet'
const CARPET = '/textures/dirty_carpet'
for (const u of [PHONE, DUCK]) useGLTF.preload(u)
useTexture.preload([`${VELVET}/diff.webp`, `${VELVET}/nor.webp`, `${CARPET}/diff.webp`, `${CARPET}/nor.webp`])

const SCREEN = { y: 4.3, z: -14, w: 12, h: 5 }
const ROOM = { w: 16, back: 8, h: 9 }
const ROWS = 10
const PER_SIDE = 9
const PHONE_POS = new Vector3(-ROOM.w / 2 + 0.02, 1.45, 2.2)
const EXIT_POS = new Vector3(-ROOM.w / 2 + 0.02, 0, 3.4)
/** Credits finish rolling at this fraction of the chapter. */
const ROLL_END = 0.72

const rowZ = (r: number) => -6.5 + r * 1.15

/** Credit line spacing, and the extra height of each wrapped line of a long name. */
const LINE = 0.62
const WRAP = 0.3
/** Roughly how many characters of the name column fit on one line (serif 0.24 in 5.4 m). */
const PER_LINE = 42

/** The roll: the crew (all Gabriel), then who made the music and sounds, then the thanks. */
function rollOf(lang: 'en' | 'pt') {
  const crew = CREDITS.map((c) => ({ role: c.role[lang], name: typeof c.name === 'string' ? c.name : c.name[lang] }))
  const sound = [
    { role: lang === 'pt' ? 'Trilha' : 'Music', name: creditNames('music').join(' · ') },
    { role: lang === 'pt' ? 'Sons' : 'Sound', name: creditNames('sound').join(' · ') },
    {
      role: lang === 'pt' ? 'Licenças' : 'Licences',
      name: lang === 'pt' ? 'CC BY 3.0 · CC BY 4.0 · CC0, via Freesound e Wikimedia Commons. Títulos e links na versão em texto.' : 'CC BY 3.0 · CC BY 4.0 · CC0, via Freesound and Wikimedia Commons. Titles and links in the text version.',
    },
  ]
  const lines = [...crew.slice(0, -1), ...sound, crew[crew.length - 1]]
  let y = 0
  const placed = lines.map((l) => {
    const at = y
    y += LINE + (Math.ceil(l.name.length / PER_LINE) - 1) * WRAP
    return { ...l, y: at }
  })
  return { lines: placed, height: y }
}
const seatX = (i: number, side: number) => side * (1.25 + i * 0.62)
/** On the aisle seat of the back row: the one next to yours. */
const DUCK_POS = new Vector3(seatX(0, -1), 0.51, rowZ(ROWS - 1) + 0.04)

/** A cinema seat: cushion, back and two arms, merged into one geometry. */
function seatGeometry() {
  const parts = [
    new BoxGeometry(0.52, 0.13, 0.48).translate(0, 0.44, 0.02),
    new BoxGeometry(0.52, 0.66, 0.1).rotateX(-0.12).translate(0, 0.82, -0.24),
    new BoxGeometry(0.06, 0.24, 0.46).translate(-0.29, 0.6, 0),
    new BoxGeometry(0.06, 0.24, 0.46).translate(0.29, 0.6, 0),
    new BoxGeometry(0.08, 0.44, 0.3).translate(0, 0.22, -0.06),
  ]
  return mergeGeometries(parts)
}

/** Curtain: a plane with vertical folds. */
function curtainGeometry(w: number, h: number, folds: number) {
  const g = new PlaneGeometry(w, h, folds * 8, 1)
  const p = g.getAttribute('position')
  for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin((p.getX(i) / w) * folds * Math.PI * 2) * 0.12)
  g.computeVertexNormals()
  return g
}

const o = new Object3D()
const ray = new Raycaster()
// The projector's beam over the audience, from the booth port to the screen.
const BEAM_FROM = new Vector3(0, 6.6, ROOM.back - 0.1)
const BEAM_DIR = new Vector3(0, SCREEN.y, SCREEN.z).sub(BEAM_FROM).normalize()
const BEAM_BOX: [[number, number, number], [number, number, number]] = [[-7, 1, SCREEN.z], [7, 8.5, ROOM.back]]

export default function Credits({ chapter }: SceneProps) {
  const t = useT()
  const lang = useFilm((s) => s.lang)
  const camera = useThree((s) => s.camera)
  const portrait = useThree((s) => s.size.width < s.size.height)
  const { start, dur } = chapterById(chapter)
  const rolled = useMemo(() => rollOf(lang), [lang])
  const phone = useGLTF(PHONE)
  const duck = useGLTF(DUCK)

  const seats = useRef<InstancedMesh>(null!)
  const aisle = useRef<InstancedMesh>(null!)
  const roll = useRef<Group>(null!)
  const screenLight = useRef<RectAreaLight>(null!)
  const follow = useRef<ThreeSpotLight>(null!)
  const phoneRef = useRef<Group>(null!)
  const duckRef = useRef<Group>(null!)
  const popcorn = useRef<InstancedMesh>(null!)
  const house = useRef<Group>(null!)
  const followTarget = useMemo(() => new Object3D(), [])
  const hit = useMemo(() => new Vector3(), [])
  const state = useRef({ ringNext: 0, hover: 0, voicemail: false, idle: 0, post: false, answered: false, leaving: false, pops: [] as { p: Vector3; v: Vector3; life: number }[] })
  const [post, setPost] = useState(false)
  const [voicemail, setVoicemail] = useState(false)
  const contactOpen = useContact((s) => s.open)
  // The exit door: how open it is (0..1) and how much the foyer's light is up behind it.
  const doorOpen = useRef(0)
  const doorLit = useRef(0)
  const [answered, setAnswered] = useState(false)
  useEffect(() => {
    if (contactOpen && !state.current.answered) {
      state.current.answered = true
      setAnswered(true)
    }
  }, [contactOpen])
  const eggs = useEggs((s) => s.found.length)

  const velvet = useTexture({ map: `${VELVET}/diff.webp`, normalMap: `${VELVET}/nor.webp` })
  const carpet = useTexture({ map: `${CARPET}/diff.webp`, normalMap: `${CARPET}/nor.webp` })
  for (const tex of [...Object.values(velvet), ...Object.values(carpet)]) {
    tex.wrapS = tex.wrapT = RepeatWrapping
  }
  carpet.map.repeat.set(6, 8)
  carpet.normalMap.repeat.set(6, 8)

  const seatGeo = useMemo(seatGeometry, [])
  const curtain = useMemo(() => curtainGeometry(3, ROOM.h, 7), [])
  const seatCount = ROWS * PER_SIDE * 2

  useLayoutEffect(() => {
    let k = 0
    for (let r = 0; r < ROWS; r++)
      for (const side of [-1, 1])
        for (let i = 0; i < PER_SIDE; i++) {
          o.position.set(seatX(i, side), 0, rowZ(r))
          o.rotation.set(0, 0, 0)
          o.scale.setScalar(1)
          o.updateMatrix()
          seats.current.setMatrixAt(k++, o.matrix)
        }
    seats.current.instanceMatrix.needsUpdate = true
    for (let r = 0; r < ROWS; r++)
      for (const side of [-1, 1]) {
        o.position.set(side * 0.85, 0.03, rowZ(r) + 0.3)
        o.updateMatrix()
        aisle.current.setMatrixAt(r * 2 + (side > 0 ? 1 : 0), o.matrix)
      }
    aisle.current.instanceMatrix.needsUpdate = true
    screenLight.current.lookAt(0, 1.5, 6)
  }, [])

  useEffect(() => {
    return () => {
      document.body.style.cursor = ''
      cameraFocus.active = false
      useCaption.setState({ caption: null, close: null })
      for (const u of [PHONE, DUCK]) useGLTF.clear(u)
    }
  }, [])

  /** Out through the exit: the leaves swing open, the camera steps up to the light, and Act III takes over. */
  const leave = () => {
    const st = state.current
    if (st.leaving) return
    st.leaving = true
    useContact.getState().set(false)
    sfx('door', panFor(EXIT_POS, camera))
    cameraFocus.pos.set(EXIT_POS.x + 2.2, 1.35, EXIT_POS.z)
    cameraFocus.look.set(EXIT_POS.x, 1.15, EXIT_POS.z)
    cameraFocus.fov = 44
    cameraFocus.active = true
    setTimeout(() => {
      goExit()
      // Behind Act III the room resets, so "watch again" starts clean.
      setTimeout(() => {
        st.leaving = false
        doorOpen.current = 0
        cameraFocus.active = false
      }, 1500)
    }, 1300)
  }

  // The call-to-action card once the credits have rolled.
  const [ringing, setRinging] = useState(false)
  useEffect(() => {
    if (post) {
      useCaption.setState({
        caption: {
          kicker: '07 · ' + (lang === 'pt' ? 'PÓS-CRÉDITOS' : 'POST-CREDITS'),
          title: t.contact.duck,
          hook: `🥚 ${eggs}/${EGG_COUNT} ${t.ui.eggs}`,
          accent: '#ffd21f',
          action: {
            label: `↺ ${t.ui.watchAgain}`,
            run: () => {
              cameraFocus.active = false
              useFilm.getState().seek(0)
              if (!useFilm.getState().playing) useFilm.getState().togglePlay()
            },
          },
          open: true,
        },
        close: null,
      })
    } else if (voicemail && !contactOpen) {
      useCaption.setState({ caption: { kicker: '☎', title: lang === 'pt' ? 'Secretária eletrônica' : 'Answering machine', hook: t.contact.voicemail, accent: '#ffb36b' }, close: null })
    } else if (ringing && !contactOpen) {
      useCaption.setState({
        caption: {
          kicker: t.contact.kicker,
          title: t.contact.title,
          hook: t.contact.hook,
          accent: '#ff5a4f',
          action: { label: `☎ ${t.contact.answer}`, run: () => useContact.getState().set(true) },
          open: true,
        },
        close: null,
      })
    } else if (answered && !contactOpen) {
      // Frame the phone and the door beside it, so the way out is plain.
      if (!state.current.leaving) {
        cameraFocus.pos.set(-4.3, 1.5, 3.3)
        cameraFocus.look.set(EXIT_POS.x, 1.35, 2.85)
        cameraFocus.fov = 46
        cameraFocus.active = true
      }
      useCaption.setState({
        caption: {
          kicker: lang === 'pt' ? 'SAÍDA' : 'EXIT',
          title: lang === 'pt' ? 'Lá fora, as luzes estão acesas.' : 'Outside, the lights are up.',
          hook: lang === 'pt' ? 'O filme acabou; os projetos continuam rodando ao vivo do outro lado da porta.' : 'The film is over; the projects are still running, live, on the other side of the door.',
          accent: '#5dff8a',
          action: { label: lang === 'pt' ? 'Sair pela porta ▸' : 'Walk out ▸', run: () => leave() },
          open: true,
        },
        close: null,
      })
    } else useCaption.setState({ caption: null, close: null })
  }, [ringing, contactOpen, voicemail, post, answered, lang, t, eggs])


  const answer = () => {
    useContact.getState().set(true)
    state.current.hover = 0
  }

  useFrame((_, delta) => {
    const { time } = useFilm.getState()
    const p = MathUtils.clamp((time - start) / dur, 0, 1)
    const st = state.current

    // Credits roll up the screen.
    const k = roll.current.scale.y
    roll.current.position.y = MathUtils.lerp(SCREEN.y - SCREEN.h / 2 - 0.6 * k, SCREEN.y + (rolled.height + 2.4) * k, Math.min(1, p / ROLL_END))
    // The screen flickers with the projector; it dims once the reel runs out.
    const lit = p < ROLL_END + 0.08 ? 1 : 0.35
    screenLight.current.intensity = (11 + Math.sin(time * 40) * 0.3) * lit
    // Aisle lights come up as the film ends, like at the end of a session.
    const houseUp = MathUtils.smoothstep(p, 0.55, 0.9) + (st.post ? 1 : 0)
    ;(aisle.current.material as unknown as { color: Color }).color.setScalar(0.4 + houseUp * 3)
    house.current.children.forEach((l) => ((l as unknown as { intensity: number }).intensity = st.post ? 6 : houseUp * 0.6))

    // The follow-spot from the booth: where the visitor points.
    ray.setFromCamera(cursor.pos, camera)
    const d = ray.ray.direction
    const org = ray.ray.origin
    let tt = 30
    if (d.x < -1e-4) tt = Math.min(tt, (-ROOM.w / 2 - org.x) / d.x)
    if (d.x > 1e-4) tt = Math.min(tt, (ROOM.w / 2 - org.x) / d.x)
    if (d.y < -1e-4) tt = Math.min(tt, -org.y / d.y)
    if (d.z < -1e-4) tt = Math.min(tt, (SCREEN.z - org.z) / d.z)
    hit.copy(d).multiplyScalar(tt).add(org)
    followTarget.position.lerp(hit, 0.3)
    follow.current.target = followTarget

    // The phone rings once the credits end (until answered).
    const shouldRing = p > 0.62 && !useContact.getState().open && !st.post && !st.answered
    if (shouldRing !== ringing) setRinging(shouldRing)
    if (shouldRing) {
      st.ringNext -= delta
      if (st.ringNext <= 0) {
        sfx('ring', panFor(PHONE_POS, camera))
        st.ringNext = 4
      }
    } else st.ringNext = 0
    const shake = shouldRing && st.ringNext > 2.2 ? Math.sin(time * 60) * 0.04 : 0
    phoneRef.current.rotation.z = shake

    // Easter egg: hover the ringing phone without answering and it goes to voicemail.
    if (st.hover > 0) {
      st.hover += delta
      if (st.hover > 8 && !st.voicemail) {
        st.voicemail = true
        setVoicemail(true)
        useEggs.getState().find('phone')
        sfx('beep', panFor(PHONE_POS, camera))
      }
    }

    // The exit's light comes up with the house lights; opening it floods the doorway.
    doorLit.current = MathUtils.smoothstep(p, 0.6, 0.95)
    doorOpen.current = MathUtils.damp(doorOpen.current, st.leaving ? 1 : 0, 2.2, delta)

    // Post-credits: ten seconds of black after the end, then the lights and the duck.
    if (time >= TOTAL - 0.01 && !useContact.getState().open) st.idle += delta
    else st.idle = 0
    if (st.idle > 10 && !st.post) {
      st.post = true
      setPost(true)
      // You're sitting one seat over: look sideways at your neighbour.
      cameraFocus.pos.set(seatX(1, -1) - 0.05, 1.08, rowZ(ROWS - 1) + 0.12)
      cameraFocus.look.set(DUCK_POS.x, DUCK_POS.y + 0.14, DUCK_POS.z)
      cameraFocus.fov = 46
      cameraFocus.active = true
    }
    if (st.post && time < TOTAL - 0.5) {
      // The visitor chose to watch again.
      st.post = false
      setPost(false)
      cameraFocus.active = false
    }
    duckRef.current.visible = st.post

    // Popcorn confetti.
    st.pops.forEach((c, i) => {
      if (c.life > 0) {
        c.life -= delta
        c.v.y -= 5 * delta
        c.p.addScaledVector(c.v, delta)
      }
      o.position.copy(c.p)
      o.scale.setScalar(c.life > 0 ? 1 : 0)
      o.updateMatrix()
      popcorn.current.setMatrixAt(i, o.matrix)
    })
    popcorn.current.instanceMatrix.needsUpdate = true
  })

  const quack = () => {
    sfx('quack', panFor(DUCK_POS, camera))
    useEggs.getState().find('duck')
    const st = state.current
    st.pops = Array.from({ length: 40 }, () => ({
      p: DUCK_POS.clone().add(new Vector3(0.25, 0.25, 0)),
      v: new Vector3((Math.random() - 0.5) * 2, 1.5 + Math.random() * 2, (Math.random() - 0.5) * 2),
      life: 1.2 + Math.random() * 0.6,
    }))
  }

  const hover = (on: boolean) => {
    document.body.style.cursor = on ? 'pointer' : ''
    state.current.hover = on && ringing ? 0.001 : 0
  }

  return (
    <>
      <CameraRig
        chapter={chapter}
        sway={0.1}
        maxPull={1.1}
        bounds={(p) => ((p.x = MathUtils.clamp(p.x, -ROOM.w / 2 + 0.4, ROOM.w / 2 - 0.4)), (p.z = Math.min(p.z, ROOM.back - 0.3)), (p.y = MathUtils.clamp(p.y, 0.6, ROOM.h - 0.5)))}
        keys={[
          // From the stalls, a slow push-in while the credits roll…
          { at: 0, pos: [0.9, 1.95, 4.6], look: [0, 3.9, SCREEN.z], fov: 42 },
          { at: 0.68, pos: [0.55, 1.85, 2.6], look: [0, 4.0, SCREEN.z], fov: 40 },
          // …then the phone rings, and the camera turns to it.
          { at: 0.8, pos: [0.2, 1.75, 2.4], look: [-6, 1.8, 1.6], fov: 40 },
          { at: 1, pos: [-4.4, 1.6, 2.6], look: [PHONE_POS.x, 1.55, PHONE_POS.z], fov: 38 },
        ]}
      />
      <ambientLight intensity={0.08} color="#8fa0c8" />

      {/* The screen, its black masking, and the light it throws on the room. */}
      <mesh position={[0, SCREEN.y, SCREEN.z]}>
        <planeGeometry args={[SCREEN.w, SCREEN.h]} />
        <meshBasicMaterial color="#3a3833" toneMapped={false} />
      </mesh>
      {/* On a phone the column is scaled up: the screen is 12 m wide, the text only half of that. */}
      <group ref={roll} position={[0, 0, SCREEN.z + 0.02]} scale={portrait ? 1.7 : 1}>
        <Text font={FONT_SERIF} fontSize={0.62} anchorX="center" position={[0, 1.2, 0]}>
          {t.film}
          <meshBasicMaterial color="#f4ecdf" toneMapped={false} />
        </Text>
        <Text font={FONT_SERIF_ITALIC} fontSize={0.2} anchorX="center" position={[0, 0.55, 0]}>
          {t.by}
          <meshBasicMaterial color="#d8cfc2" toneMapped={false} />
        </Text>
        {rolled.lines.map((c, i) => (
          <group key={i} position={[0, -0.4 - c.y, 0]}>
            <Text font={FONT_MONO} fontSize={0.12} letterSpacing={0.2} anchorX="right" position={[-0.25, 0, 0]}>
              {c.role.toUpperCase()}
              <meshBasicMaterial color="#b9b0a3" toneMapped={false} />
            </Text>
            {/* Hung from its first line, so a long list of names wraps downwards beside its role. */}
            <Text font={FONT_SERIF} fontSize={0.24} anchorX="left" anchorY="top" position={[0.25, 0.16, 0]} maxWidth={5.4} lineHeight={1.25}>
              {c.name}
              <meshBasicMaterial color="#f4ecdf" toneMapped={false} />
            </Text>
          </group>
        ))}
        <Text font={FONT_SERIF_ITALIC} fontSize={0.5} anchorX="center" position={[0, -0.4 - rolled.height - 1.2, 0]}>
          {t.contact.fin}
          <meshBasicMaterial color="#f4ecdf" toneMapped={false} />
        </Text>
      </group>
      {[SCREEN.y + SCREEN.h / 2 + 2, SCREEN.y - SCREEN.h / 2 - 2].map((y) => (
        <mesh key={y} position={[0, y, SCREEN.z + 0.05]}>
          <planeGeometry args={[SCREEN.w + 2, 4]} />
          <meshBasicMaterial color="#050404" />
        </mesh>
      ))}
      <rectAreaLight ref={screenLight} args={['#e8e4dc', 11, SCREEN.w, SCREEN.h]} position={[0, SCREEN.y, SCREEN.z + 0.2]} />

      {/* The projector's beam, from the booth port over the audience. */}
      <SpotLight
        position={[0, 6.6, ROOM.back - 0.1]}
        target-position={[0, SCREEN.y, SCREEN.z]}
        angle={0.36}
        penumbra={0.4}
        intensity={0}
        distance={30}
        attenuation={18}
        anglePower={6}
        opacity={0.18}
        color="#ffe4c0"
      />
      <Dust origin={BEAM_FROM} dir={BEAM_DIR} angle={0.32} count={useQ(2600, 900)} box={BEAM_BOX} />
      {/* A follow-spot the visitor steers. */}
      <primitive object={followTarget} />
      <spotLight ref={follow} name="cursor-light" position={[1.5, 6.6, ROOM.back - 0.3]} angle={0.12} penumbra={0.6} intensity={30} decay={1.2} distance={30} color="#ffd2a0" />

      {/* House lights, off until the end. */}
      <group ref={house}>
        {[-5, 0, 5].map((x) => (
          <pointLight key={x} position={[x, ROOM.h - 1, 0]} color="#ffcf9a" intensity={0} distance={16} decay={1.6} />
        ))}
      </group>

      {/* The room. */}
      <instancedMesh ref={seats} args={[seatGeo, undefined, seatCount]} castShadow receiveShadow>
        <meshStandardMaterial {...velvet} color="#8a1a1e" roughness={0.85} />
      </instancedMesh>
      <instancedMesh ref={aisle} args={[undefined, undefined, ROWS * 2]}>
        <boxGeometry args={[0.18, 0.02, 0.04]} />
        <meshBasicMaterial color="#ffb36b" toneMapped={false} />
      </instancedMesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, -3]} receiveShadow>
        <planeGeometry args={[ROOM.w, 24]} />
        <meshStandardMaterial {...carpet} color="#3a1c1c" roughness={0.95} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[(side * ROOM.w) / 2, ROOM.h / 2, -3]} rotation-y={(-side * Math.PI) / 2}>
          <planeGeometry args={[24, ROOM.h]} />
          <meshStandardMaterial color="#2a1414" roughness={0.9} />
        </mesh>
      ))}
      <mesh position={[0, ROOM.h, -3]} rotation-x={Math.PI / 2}>
        <planeGeometry args={[ROOM.w, 24]} />
        <meshStandardMaterial color="#0c0808" />
      </mesh>
      <mesh position={[0, ROOM.h / 2, SCREEN.z - 0.2]}>
        <planeGeometry args={[ROOM.w, ROOM.h]} />
        <meshStandardMaterial color="#120a0a" />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} geometry={curtain} position={[side * (SCREEN.w / 2 + 1.1), ROOM.h / 2, SCREEN.z + 0.3]}>
          <meshStandardMaterial {...velvet} color="#7a1016" roughness={0.8} />
        </mesh>
      ))}

      {/* The phone on the side wall, by the exit. */}
      <group
        ref={phoneRef}
        position={PHONE_POS}
        rotation-y={Math.PI / 2}
        onClick={(e) => {
          e.stopPropagation()
          answer()
        }}
        onPointerOver={() => hover(true)}
        onPointerOut={() => hover(false)}
      >
        <primitive object={phone.scene} scale={1.6} />
        <mesh position={[0, 0.3, 0.2]} visible={false}>
          <boxGeometry args={[0.9, 1.1, 0.5]} />
        </mesh>
      </group>
      <group position={[-ROOM.w / 2 + 0.03, 2.75, 3.4]} rotation-y={Math.PI / 2}>
        <mesh>
          <boxGeometry args={[0.8, 0.28, 0.05]} />
          <meshStandardMaterial color="#0b1a0e" />
        </mesh>
        <Text font={FONT_MONO} fontSize={0.14} letterSpacing={0.2} position={[0, 0, 0.03]} anchorX="center" anchorY="middle">
          {lang === 'pt' ? 'SAÍDA' : 'EXIT'}
          <meshBasicMaterial color="#5dff8a" toneMapped={false} />
        </Text>
        <pointLight color="#3dff6a" intensity={0.8} distance={3} decay={2} position={[0, 0, 0.3]} />
      </group>

      <Audience />

      {/* The exit, under the sign: out to Act III. */}
      <group position={EXIT_POS} rotation-y={Math.PI / 2}>
        <ExitDoor open={doorOpen} lit={doorLit} onOpen={leave} onHover={(on) => (document.body.style.cursor = on ? 'pointer' : '')} />
      </group>

      {/* Post-credits: the duck, with popcorn, in the seat next to yours. */}
      <group ref={duckRef} position={DUCK_POS} visible={false} onClick={(e) => (e.stopPropagation(), quack())} onPointerOver={() => (document.body.style.cursor = 'pointer')} onPointerOut={() => (document.body.style.cursor = '')}>
        <primitive object={duck.scene} scale={0.75} rotation-y={0.5} />
        <group position={[0.26, 0, 0.02]}>
          <mesh position={[0, 0.12, 0]}>
            <cylinderGeometry args={[0.09, 0.07, 0.24, 16, 1, true]} />
            <meshStandardMaterial color="#e8e2d8" side={2} />
          </mesh>
          {Array.from({ length: 8 }, (_, i) => (
            <mesh key={i} position={[Math.cos(i) * 0.05, 0.25 + (i % 3) * 0.015, Math.sin(i * 1.7) * 0.05]}>
              <sphereGeometry args={[0.025, 8, 8]} />
              <meshStandardMaterial color="#fff3cf" roughness={0.9} />
            </mesh>
          ))}
        </group>
      </group>
      <instancedMesh ref={popcorn} args={[undefined, undefined, 40]} frustumCulled={false}>
        <sphereGeometry args={[0.02, 6, 6]} />
        <meshStandardMaterial color="#fff3cf" roughness={0.9} />
      </instancedMesh>
    </>
  )
}

/**
 * The live audience (ROTEIRO §0.1): everyone on the site right now takes a seat,
 * a small warm glow at head height, filling the house from the middle rows out.
 * You are the empty seat at the back, by the aisle.
 */
function Audience() {
  const lang = useFilm((s) => s.lang)
  const n = useLive((s) => (s.status === 'live' ? (s.state?.audience ?? 0) : 0))
  const mesh = useRef<InstancedMesh>(null!)
  const order = useMemo(() => {
    const seats: [number, number][] = []
    for (let r = 0; r < ROWS - 1; r++) for (const side of [-1, 1]) for (let i = 0; i < PER_SIDE; i++) seats.push([seatX(i, side), rowZ(r)])
    // Middle rows and seats near the aisle fill first, as people do.
    const mid = rowZ(Math.floor(ROWS / 2))
    return seats.sort((a, b) => Math.abs(a[1] - mid) * 0.6 + Math.abs(a[0]) - (Math.abs(b[1] - mid) * 0.6 + Math.abs(b[0])))
  }, [])
  const others = Math.min(order.length, Math.max(0, n - 1))
  useLayoutEffect(() => {
    order.forEach(([x, z], i) => {
      o.position.set(x, 1.02, z + 0.12)
      o.scale.setScalar(i < others ? 1 : 0)
      o.updateMatrix()
      mesh.current.setMatrixAt(i, o.matrix)
    })
    mesh.current.instanceMatrix.needsUpdate = true
  }, [order, others])
  return (
    <>
      <instancedMesh ref={mesh} args={[undefined, undefined, order.length]} frustumCulled={false}>
        <sphereGeometry args={[0.035, 10, 10]} />
        <meshBasicMaterial color="#ffc98a" toneMapped={false} />
      </instancedMesh>
      {n > 0 && (
        <Text font={FONT_MONO} fontSize={0.16} letterSpacing={0.18} position={[0, SCREEN.y - SCREEN.h / 2 - 0.35, SCREEN.z + 0.05]} anchorX="center">
          {lang === 'pt' ? `● ${n} ${n === 1 ? 'pessoa' : 'pessoas'} nesta sessão agora` : `● ${n} ${n === 1 ? 'person' : 'people'} in this session now`}
          <meshBasicMaterial color="#7dffa0" toneMapped={false} />
        </Text>
      )}
    </>
  )
}

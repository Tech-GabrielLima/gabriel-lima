import { PerformanceMonitor, useProgress } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { useEffect } from 'react'
import { startAudio } from './film/audio'
import { FilmClock } from './film/FilmClock'
import { Post } from './film/Post'
import { chapterById } from './film/chapters'
import { bindCursor } from './film/cursor'
import { useFilm } from './film/store'
import { useQuality } from './film/quality'
import { useWarm } from './film/warm'
import { SKIP_LOBBY, usePreload } from './lobby/preload'
import { connectLive } from './live/live'
import { LiveOverlay } from './live/Overlay'
import { SceneHost } from './scenes/SceneHost'
import { ExploreHint, Letterbox, LowerThird, TopBar } from './ui/Chrome'
import { ContactPanel } from './ui/ContactPanel'
import { TextVersion } from './ui/TextVersion'
import { CursorRing } from './ui/CursorRing'
import { Curtain } from './ui/Curtain'
import { XrayStage } from './xray/XrayStage'
import { XrayUI, useXrayKeys } from './xray/XrayUI'
import { Leader } from './ui/Leader'
import { Player } from './ui/Player'
import { useExploreInput } from './ui/useExploreInput'

// ?clean hides the interface (for the OG image and trailer captures).
const CLEAN = new URLSearchParams(location.search).has('clean')

// When the last scene finished warming up (see SceneHost): the frame-rate guard ignores the moments after a cut.
let lastWarm = 0
useWarm.subscribe((s) => void (s.warming || (lastWarm = performance.now())))

/**
 * Mobile browsers drop the WebGL context when they run out of video memory.
 * Rather than a dead black screen, reload at the same moment of the film, lighter.
 */
function onContextLost(e: Event) {
  e.preventDefault()
  const p = new URLSearchParams(location.search)
  if (p.get('recovered')) return // already tried once: don't loop
  const t = (window as unknown as { __filmTime?: number }).__filmTime ?? 0
  p.set('t', t.toFixed(1))
  p.set('start', '')
  p.set('quality', 'low')
  p.set('recovered', '1')
  location.replace(`${location.pathname}?${p.toString().replace(/=(&|$)/g, '$1')}`)
}

/** Where the film picks up after the lobby's door: the title card (the lobby already drew the GL ident). */
const AFTER_DOOR = chapterById('countdown').start + 5.4
/** The lobby's door animation, until its light fills the screen (lobby.css). */
const DOOR_MS = 1000

/**
 * While the lobby is in front, the film loads and compiles its first scene
 * without drawing a frame. It tells the lobby how far it got, and when the
 * shaders are warm the door can open.
 */
function ReportLoading() {
  const { progress, active, total } = useProgress()
  const warming = useWarm((s) => s.warming)
  // If the film never reports ready (a scene that failed to load), the doors open anyway after this long.
  useEffect(() => {
    const t = setTimeout(() => usePreload.setState({ ready: true, progress: 1 }), 25000)
    return () => clearTimeout(t)
  }, [])
  useEffect(() => {
    // The first scene has been compiled once it stops warming after it started.
    let warmed = false
    return useWarm.subscribe((s, prev) => {
      if (prev.warming && !s.warming && !warmed) {
        warmed = true
        usePreload.setState({ ready: true, progress: 1 })
      }
    })
  }, [])
  useEffect(() => {
    if (usePreload.getState().ready) return
    // Loaded assets are 90% of the wait; compiling shaders is the rest.
    const loaded = total > 0 ? progress / 100 : 0
    usePreload.setState({ progress: Math.min(0.99, loaded * 0.9 + (!active && loaded >= 1 && !warming ? 0.05 : 0)) })
  }, [progress, active, total, warming])
  return null
}

/** Called by the lobby's door, inside the click. The film rolls once the door's light has washed over the screen. */
function enterFilm() {
  startAudio()
  useFilm.getState().seek(AFTER_DOOR)
  usePreload.setState({ entered: true, act: 'film' })
  // Coming back for a second session: it plays, whatever mode the last one ended in.
  setTimeout(() => (useFilm.setState({ mode: 'watch' }), useFilm.getState().start()), DOOR_MS)
}

export default function App() {
  // Behind the lobby or Act III, the film holds still and draws nothing.
  const hold = usePreload((s) => s.act !== 'film')
  useEffect(() => {
    // A deep link starts on a running film: its doors are ready from the start.
    usePreload.setState({ mounted: true, enter: enterFilm, ...(SKIP_LOBBY && { ready: true, progress: 1 }) })
  }, [])
  useEffect(() => {
    if (hold) useFilm.setState({ playing: false })
  }, [hold])
  const dpr = useQuality((s) => s.dpr)
  const low = useQuality((s) => s.tier === 'low')

  return (
    <main className={`stage${CLEAN ? ' clean' : ''}`}>
      <Canvas
        className="canvas"
        // Behind the lobby nothing is drawn: scenes load and compile, the GPU stays free for the 2D page.
        frameloop={hold ? 'demand' : 'always'}
        dpr={dpr}
        shadows={low ? 'basic' : 'percentage'}
        gl={{ antialias: false, powerPreference: 'high-performance', stencil: false }}
        onCreated={({ gl }) => gl.domElement.addEventListener('webglcontextlost', onContextLost)}
        camera={{ fov: 35, near: 0.05, far: 200, position: [0, 1.5, 4] }}
      >
        <color attach="background" args={['#07080c']} />
        {/* If the device can't hold the frame rate, render fewer pixels (then fewer effects). */}
        <PerformanceMonitor
          bounds={() => [38, 58]}
          flipflops={4}
          // Loading a scene stalls a few frames on purpose (under the cut's flash): that isn't a slow device.
          onDecline={() => performance.now() - lastWarm > 4000 && !useWarm.getState().warming && useQuality.getState().lower()}
        />
        {!SKIP_LOBBY && <ReportLoading />}
        <FilmClock />
        <SceneHost />
        <XrayStage />
        <Post />
      </Canvas>
      {!hold && <FilmUI />}
    </main>
  )
}

/** Everything drawn over the picture, and the film's own inputs. Mounted once the film owns the screen. */
function FilmUI() {
  useEffect(bindCursor, [])
  useEffect(connectLive, [])
  useXrayKeys()
  useExploreInput()
  return (
    <>
      {/* First over the picture, so the letterbox, the player and the captions stay on top of it. */}
      <Curtain />
      <Leader />
      <Letterbox />
      <TopBar />
      <Player />
      <LowerThird />
      <ExploreHint />
      <ContactPanel />
      <TextVersion />
      <XrayUI />
      <LiveOverlay />
      <CursorRing />
    </>
  )
}

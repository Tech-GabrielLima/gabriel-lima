import { useThree } from '@react-three/fiber'
import { Component, Suspense, lazy, useEffect, useLayoutEffect, useRef, type ComponentType, type ReactNode } from 'react'
import { Group, Mesh, Texture, type Material } from 'three'
import { CHAPTERS, chapterAt, type ChapterId } from '../film/chapters'
import { useFilm } from '../film/store'
import { useWarm } from '../film/warm'

export interface SceneProps {
  chapter: ChapterId
}

type Loader = () => Promise<{ default: ComponentType<SceneProps> }>

// One module per scene, so each scene's code and assets load on demand.
// Scene 00 is drawn in the DOM (ui/Leader.tsx): during it, the booth is
// already mounted and warmed underneath, so the first cut is seamless.
const loaders: Record<ChapterId, Loader> = {
  countdown: () => import('./booth/Booth'),
  booth: () => import('./booth/Booth'),
  studio: () => import('./studio/Studio'),
  alley: () => import('./alley/Alley'),
  crossing: () => import('./crossing/Crossing'),
  moon: () => import('./moon/Moon'),
  credits: () => import('./credits/Credits'),
}

const DEBUG = new URLSearchParams(location.search).has('debug')

const scenes = Object.fromEntries(
  Object.entries(loaders).map(([id, load]) => [id, lazy(load)]),
) as unknown as Record<ChapterId, ComponentType<SceneProps>>

/**
 * Hides a newly mounted scene until the GPU is ready for it: compiles every
 * shader (in parallel where the driver allows) and uploads every texture, then
 * reveals it. Without this the first frame of each scene stalls for a moment.
 */
function Warm({ children }: { children: ReactNode }) {
  const group = useRef<Group>(null!)
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)

  useLayoutEffect(() => {
    let alive = true
    useWarm.setState({ warming: true })
    const g = group.current
    // Visible only for the synchronous part of compile, so the scene's lights are counted.
    g.visible = true
    const t0 = performance.now()
    const ready = gl.compileAsync(scene, camera)
    const t1 = performance.now()
    g.visible = false
    if (DEBUG) console.log(`[warm] compile sync ${(t1 - t0).toFixed(0)} ms`)
    ready
      .then(() => {
        if (!alive) return
        const t2 = performance.now()
        g.traverse((o) => {
          const mats = [(o as Mesh).material].flat().filter(Boolean) as Material[]
          for (const m of mats) for (const v of Object.values(m)) if (v instanceof Texture) gl.initTexture(v)
        })
        if (DEBUG) console.log(`[warm] async wait ${(t2 - t1).toFixed(0)} ms, textures ${(performance.now() - t2).toFixed(0)} ms`)
      })
      .catch(() => {})
      .finally(() => {
        if (!alive) return
        g.visible = true
        // Two more held frames: shadow maps and render targets allocate on the first real render.
        requestAnimationFrame(() => requestAnimationFrame(() => alive && useWarm.setState({ warming: false })))
      })
    return () => {
      alive = false
      useWarm.setState({ warming: false })
    }
  }, [gl, scene, camera])

  return (
    <group ref={group} visible={false}>
      {children}
    </group>
  )
}

/**
 * If a scene fails (a file that didn't arrive, a browser that can't decode
 * something), the film carries on over an empty stage instead of the whole
 * site going down; it tries the scene once more a few seconds later.
 */
class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean; tries: number }> {
  state = { failed: false, tries: 0 }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: unknown) {
    console.error('[scene] failed to load', error)
    useWarm.setState({ warming: false })
    if (this.state.tries < 1) setTimeout(() => this.setState((s) => ({ failed: false, tries: s.tries + 1 })), 3000)
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}

/**
 * Mounts exactly one scene at a time (the previous one unmounts and its GPU
 * resources are released) and fetches the next chapter's module — and with
 * it, its models and textures — while the current one plays.
 */
export function SceneHost() {
  const id = useFilm((s) => chapterAt(s.time).id)
  const sceneId = id === 'countdown' ? 'booth' : id

  useEffect(() => {
    const i = CHAPTERS.findIndex((c) => c.id === id)
    const next = CHAPTERS[i + 1]
    // Give the current scene a moment to settle before downloading the next.
    const t = setTimeout(() => next && void loaders[next.id](), 1500)
    return () => clearTimeout(t)
  }, [id])

  // The wait for a new scene starts at the cut, not when its code and models have arrived:
  // Warm (above) clears it once the scene is compiled; a failed scene clears it in SceneBoundary.
  useLayoutEffect(() => {
    useWarm.setState({ warming: true })
  }, [sceneId])

  const Scene = scenes[sceneId]
  return (
    <SceneBoundary key={sceneId}>
      <Suspense fallback={null}>
        <Warm>
          <Scene chapter={sceneId} />
        </Warm>
      </Suspense>
    </SceneBoundary>
  )
}

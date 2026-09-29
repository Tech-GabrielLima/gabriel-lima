import { useFrame, useThree } from '@react-three/fiber'
import { useMemo } from 'react'
import { MathUtils, PerspectiveCamera, Vector3 } from 'three'
import { chapterById, type ChapterId } from './chapters'
import { cursor } from './cursor'
import { useFilm } from './store'

type V3 = [number, number, number]

export interface CameraKey {
  /** Position in the chapter, 0..1. */
  at: number
  pos: V3
  look: V3
  fov?: number
}

interface Props {
  chapter: ChapterId
  keys: CameraKey[]
  /** How far (world units) the camera sways towards the cursor. */
  sway?: number
  /** Hand-held noise amplitude (world units). */
  handheld?: number
  /** Narrow screens: how far (× distance to the look target) the camera may back off to keep the framing. */
  maxPull?: number
  /** Keeps the backed-off camera inside the set (e.g. between the alley's walls). */
  bounds?: (pos: Vector3) => void
}

const smooth = (x: number) => x * x * (3 - 2 * x)

/**
 * A scene can pull the camera off its rails (e.g. into an opened door) by
 * setting `active` and a pose; the rig blends there and back smoothly.
 */
export const cameraFocus = {
  active: false,
  pos: new Vector3(),
  look: new Vector3(),
  fov: 40,
  /** Current blend, 0 = on rails, 1 = at the focus pose. */
  weight: 0,
}

/**
 * Shots are composed for 16:9. On narrower screens (phones) the lens opens up
 * to a limit and the camera backs off the rest of the way, so what the shot is
 * about still fits across the screen instead of being cropped.
 */
const DESIGN_ASPECT = 16 / 9
const MAX_FOV = 66
function fitFov(fov: number, aspect: number) {
  if (aspect >= DESIGN_ASPECT) return { fov, pull: 1 }
  const h = Math.atan(Math.tan(MathUtils.degToRad(fov) / 2) * DESIGN_ASPECT)
  const wanted = MathUtils.radToDeg(2 * Math.atan(Math.tan(h) / aspect))
  const f = Math.min(MAX_FOV, wanted)
  const hNow = Math.atan(Math.tan(MathUtils.degToRad(f) / 2) * aspect)
  return { fov: f, pull: Math.tan(h) / Math.tan(hNow) }
}

/**
 * Keyframed camera for one chapter. Each segment between keys is eased
 * (smoothstep), so the camera settles on every key like a dolly stopping.
 */
export function CameraRig({ chapter, keys, sway = 0.12, handheld = 0.004, maxPull = 1.6, bounds }: Props) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const { start, dur } = chapterById(chapter)
  const tmp = useMemo(() => ({ pos: new Vector3(), look: new Vector3(), a: new Vector3(), b: new Vector3() }), [])
  const reduced = useMemo(() => matchMedia('(prefers-reduced-motion: reduce)').matches, [])

  useFrame((state, delta) => {
    const { time, mode } = useFilm.getState()
    const p = MathUtils.clamp((time - start) / dur, 0, 1)

    let i = 0
    while (i < keys.length - 2 && p > keys[i + 1].at) i++
    const k0 = keys[i]
    const k1 = keys[Math.min(i + 1, keys.length - 1)]
    const span = k1.at - k0.at
    const u = span > 0 ? smooth(MathUtils.clamp((p - k0.at) / span, 0, 1)) : 0

    tmp.pos.lerpVectors(tmp.a.fromArray(k0.pos), tmp.b.fromArray(k1.pos), u)
    tmp.look.lerpVectors(tmp.a.fromArray(k0.look), tmp.b.fromArray(k1.look), u)

    const s = (mode === 'explore' ? 2.5 : 1) * sway
    tmp.pos.x += cursor.pos.x * s
    tmp.pos.y += cursor.pos.y * s * 0.5
    if (!reduced) {
      const e = state.clock.elapsedTime
      tmp.pos.x += Math.sin(e * 1.3) * handheld + Math.sin(e * 3.1) * handheld * 0.4
      tmp.pos.y += Math.sin(e * 1.7 + 2) * handheld
    }

    let fov = MathUtils.lerp(k0.fov ?? 35, k1.fov ?? k0.fov ?? 35, u)
    cameraFocus.weight += ((cameraFocus.active ? 1 : 0) - cameraFocus.weight) * (1 - Math.exp(-delta * 2.5))
    const w = smooth(MathUtils.clamp(cameraFocus.weight, 0, 1))
    if (w > 1e-3) {
      tmp.pos.lerp(cameraFocus.pos, w)
      tmp.look.lerp(cameraFocus.look, w)
      fov = MathUtils.lerp(fov, cameraFocus.fov, w)
    }

    const fit = fitFov(fov, camera.aspect)
    if (fit.pull > 1.001) {
      tmp.pos.sub(tmp.look).multiplyScalar(Math.min(maxPull, fit.pull)).add(tmp.look)
      bounds?.(tmp.pos)
    }
    fov = fit.fov
    camera.position.copy(tmp.pos)
    camera.lookAt(tmp.look)
    if (Math.abs(camera.fov - fov) > 1e-3) {
      camera.fov = fov
      camera.updateProjectionMatrix()
    }
  })
  return null
}

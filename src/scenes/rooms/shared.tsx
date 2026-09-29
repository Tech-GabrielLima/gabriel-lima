import { OrbitControls, useTexture } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { MathUtils, PerspectiveCamera, RepeatWrapping, SRGBColorSpace, Texture, Vector3 } from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { create } from 'zustand'
import { useCurtain } from '../../film/curtain'

// What the rooms behind the alley's doors share (film/room.ts): the visitor's
// camera, the director's shots it flies to, the slow drift when left alone,
// and the moment the curtain lifts (each room's entrance starts there).
// RAFT and MATCH were built before this and carry their own copies.

const DEBUG = new URLSearchParams(location.search).has('debug')

/** The director's shot asked for from the room's controls (1..4), or 0. */
export const useDirector = create<{ shot: number }>(() => ({ shot: 0 }))

export type Shot = [Vector3, Vector3]

/** A portrait screen is narrow: step back so the set still fits across it. */
const portraitFit = (aspect: number, max: number) => MathUtils.clamp(0.95 / aspect, 1, max)
const fit = ([p, t]: Shot, aspect: number, max = 1.5): Shot => [t.clone().lerp(p, portraitFit(aspect, max)), t.clone()]

/** The time the curtain started to lift on this room (performance.now() seconds), or -1 while it's down. */
export function useEntry() {
  const entry = useRef(-1)
  useFrame(() => {
    const phase = useCurtain.getState().phase
    if (entry.current < 0 && (phase === 'opening' || phase === 'open')) entry.current = performance.now() / 1000
  })
  return entry
}

/** Seconds since the curtain lifted (0 before). */
export const since = (entry: { current: number }) => (entry.current < 0 ? 0 : performance.now() / 1000 - entry.current)

interface Props {
  /** The director's shots, 1-based: shots[0] is where the room opens. */
  shots: Shot[]
  fov?: number
  minDistance?: number
  maxDistance?: number
  maxPolarAngle?: number
  minPolarAngle?: number
  /** Seconds left alone before the camera starts to drift round. */
  idle?: number
  autoRotateSpeed?: number
  /** How far back the camera may step on a portrait screen (a wide set needs more). */
  portrait?: number
  /** Lets the room fly the camera itself (a double-click on something). */
  flyRef?: { current: ((p: Vector3, t: Vector3) => void) | null }
}

/** The visitor's camera in a room: orbit, pan-free, with the director's shots flown to smoothly. */
export function RoomCamera({ shots, fov = 45, minDistance = 4, maxDistance = 120, maxPolarAngle = 1.52, minPolarAngle = 0.05, idle = 10, autoRotateSpeed = 0.3, portrait = 1.5, flyRef }: Props) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const controls = useRef<OrbitControlsImpl>(null)
  const st = useRef({ idleSince: performance.now() / 1000, fly: null as null | { p: Vector3; t: Vector3; p1: Vector3; t1: Vector3; at: number } })
  // Once: the controls take their target from this, and a new vector each render would snap them back to it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const [p0, t0] = useMemo(() => fit(shots[0], camera.aspect, portrait), [camera])

  useLayoutEffect(() => {
    const prev = { fov: camera.fov, far: camera.far, near: camera.near }
    camera.position.copy(p0)
    camera.fov = camera.aspect < 1 ? fov + 10 : fov
    camera.far = 900
    camera.near = 0.1
    camera.lookAt(t0)
    camera.updateProjectionMatrix()
    useDirector.setState({ shot: 0 })
    return () => {
      Object.assign(camera, prev)
      camera.updateProjectionMatrix()
    }
    // Once per room: the first shot is where it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera])

  useEffect(() => {
    if (!flyRef) return
    flyRef.current = (p1, t1) => {
      const c = controls.current
      if (c) st.current.fly = { p: camera.position.clone(), t: c.target.clone(), p1: p1.clone(), t1: t1.clone(), at: performance.now() / 1000 }
    }
    return () => void (flyRef.current = null)
  }, [flyRef, camera])

  useFrame(() => {
    const now = performance.now() / 1000
    const c = controls.current
    if (!c) return
    if (DEBUG) Object.assign(window, { __roomCam: { p: camera.position.toArray().map(Math.round), t: c.target.toArray().map(Math.round) } })
    const shot = useDirector.getState().shot
    if (shot && shots[shot - 1]) {
      const [p1, t1] = fit(shots[shot - 1], camera.aspect, portrait)
      st.current.fly = { p: camera.position.clone(), t: c.target.clone(), p1, t1, at: now }
      useDirector.setState({ shot: 0 })
    }
    const f = st.current.fly
    if (f) {
      const u = MathUtils.smootherstep(Math.min(1, (now - f.at) / 2.2), 0, 1)
      camera.position.lerpVectors(f.p, f.p1, u)
      c.target.lerpVectors(f.t, f.t1, u)
      if (u >= 1) st.current.fly = null
    }
    c.autoRotate = !st.current.fly && now - st.current.idleSince > idle
  })

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      target={t0}
      enableDamping
      enablePan={false}
      dampingFactor={0.06}
      minDistance={minDistance}
      maxDistance={maxDistance}
      maxPolarAngle={maxPolarAngle}
      minPolarAngle={minPolarAngle}
      autoRotateSpeed={autoRotateSpeed}
      onStart={() => ((st.current.idleSince = Infinity), (st.current.fly = null))}
      onEnd={() => (st.current.idleSince = performance.now() / 1000)}
    />
  )
}

/** A click that wasn't the end of a drag (the camera is dragged with the same button). */
export function useClickGuard() {
  const down = useRef<{ x: number; y: number } | null>(null)
  return {
    onPointerDown: (e: { clientX: number; clientY: number }) => void (down.current = { x: e.clientX, y: e.clientY }),
    isClick: (e: { clientX: number; clientY: number }) => !down.current || Math.hypot(e.clientX - down.current.x, e.clientY - down.current.y) <= 6,
  }
}

export const v3 = (x: number, y: number, z: number) => new Vector3(x, y, z)

/** A Poly Haven material from public/textures/<slug> (diff, nor, rough), tiled `repeat` times. Each call gets its own copies, so two surfaces can tile differently. */
export function usePbr(slug: string, rx: number, ry = rx) {
  const base = useTexture({ map: `/textures/${slug}/diff.webp`, normalMap: `/textures/${slug}/nor.webp`, roughnessMap: `/textures/${slug}/rough.webp` })
  return useMemo(() => {
    const out: Record<string, Texture> = {}
    for (const [k, t] of Object.entries(base)) {
      const c = t.clone()
      c.wrapS = c.wrapT = RepeatWrapping
      c.repeat.set(rx, ry)
      if (k === 'map') c.colorSpace = SRGBColorSpace
      c.needsUpdate = true
      out[k] = c
    }
    return out as { map: Texture; normalMap: Texture; roughnessMap: Texture }
    // The textures themselves are cached and stable; the object holding them may not be.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base.map, base.normalMap, base.roughnessMap, rx, ry])
}
export const preloadPbr = (...slugs: string[]) => useTexture.preload(slugs.flatMap((s) => ['diff', 'nor', 'rough'].map((m) => `/textures/${s}/${m}.webp`)))

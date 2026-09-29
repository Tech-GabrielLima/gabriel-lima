import { Camera, Raycaster, Vector3 } from 'three'
import { cursor } from '../../film/cursor'
import type { DoorId } from '../../content/projects'
import data from './anchors.json'

// Geometry of the alley as built by scripts/blender/alley.py (npm run bake:alley).

export interface Anchor {
  pos: [number, number, number]
  yaw: number
}

const anchors = data.anchors as unknown as Record<string, Anchor>
export const HALF = data.half
export const LENGTH = data.length
export const anchor = (name: string) => anchors[`anchor_${name}`]
export const doorAnchor = (id: DoorId) => anchor(`door_${id}`)

/** z of the tower's front face, where the alley ends. */
export const TOWER_Z = anchor('tower').pos[2]

/** Door opening sizes of the two wall modules used for doors (see alley.py). */
export const OPENING = { large: { w: 2.08, h: 2.81 }, small: { w: 1.48, h: 2.81 } }

/** Unit normal pointing out of a wall into the alley, for an anchor's yaw. */
export function inward(a: Anchor, out = new Vector3()) {
  const r = (a.yaw * Math.PI) / 180
  return out.set(Math.sin(r), 0, Math.cos(r))
}

const ray = new Raycaster()

/**
 * Where the visitor's flashlight lands: the cursor ray against the alley's
 * boxes (two facades, the ground, the tower). Analytic, so it costs nothing.
 */
export function cursorOnAlley(camera: Camera, out: Vector3) {
  ray.setFromCamera(cursor.pos, camera)
  const o = ray.ray.origin
  const d = ray.ray.direction
  let t = Infinity
  if (d.x > 1e-4) t = Math.min(t, (HALF - o.x) / d.x)
  if (d.x < -1e-4) t = Math.min(t, (-HALF - o.x) / d.x)
  if (d.y < -1e-4) t = Math.min(t, -o.y / d.y)
  if (d.z < -1e-4) t = Math.min(t, (TOWER_Z - o.z) / d.z)
  if (!Number.isFinite(t) || t < 0) t = 20
  return out.copy(d).multiplyScalar(Math.min(t, 60)).add(o)
}

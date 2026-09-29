import { Camera, Plane, Raycaster, Vector3 } from 'three'
import { cursor } from '../film/cursor'

export const FONT_SERIF = '/fonts/InstrumentSerif-Regular.ttf'
export const FONT_SERIF_ITALIC = '/fonts/InstrumentSerif-Italic.ttf'
export const FONT_MONO = '/fonts/JetBrainsMono.ttf'
export const FONT_MARKER = '/fonts/PermanentMarker-Regular.ttf'
export const FONT_HAND = '/fonts/Caveat.ttf'

const ray = new Raycaster()
const plane = new Plane()
const normal = new Vector3()

/**
 * Where the (smoothed) cursor ray hits the plane `z = wallZ` — i.e. the spot on
 * a wall that the visitor is pointing their light at. Writes into `out`.
 */
export function cursorOnWall(camera: Camera, wallZ: number, out: Vector3) {
  ray.setFromCamera(cursor.pos, camera)
  plane.set(normal.set(0, 0, 1), -wallZ)
  if (!ray.ray.intersectPlane(plane, out)) out.set(0, 0, wallZ)
  return out
}

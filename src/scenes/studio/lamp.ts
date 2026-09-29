import { MathUtils, Object3D, Vector3 } from 'three'

// Two-bone IK for the rigged desk lamp (scripts/blender/lamp_rig.py). The lamp
// works in its own vertical plane: u = forward (the model's -z, where the
// shade overhangs), v = up. Joint positions match the rig script.

const J0 = { u: -0.03, v: 0.07 }
const J1 = { u: -0.285, v: 0.41 }
const J2 = { u: 0.13, v: 0.79 }
const SHADE = { u: 0.19, v: 0.69 }
const L1 = Math.hypot(J1.u - J0.u, J1.v - J0.v)
const L2 = Math.hypot(J2.u - J1.u, J2.v - J1.v)
const REST1 = Math.atan2(J1.v - J0.v, J1.u - J0.u)
const REST2 = Math.atan2(J2.v - J1.v, J2.u - J1.u)
const REST3 = Math.atan2(SHADE.v - J2.v, SHADE.u - J2.u)

export interface LampRig {
  base: Object3D
  lower: Object3D
  upper: Object3D
  head: Object3D
}

const local = new Vector3()

/**
 * Poses the lamp so its shade points at `target` (world). The wrist is placed
 * above and behind the target — a hand holding the lamp — and the arm solved
 * with the elbow kept back, the way an Anglepoise folds.
 */
export function aimLamp(rig: LampRig, target: Vector3, k: number) {
  // Swivel: face the target (the shade overhangs towards -z at rest).
  rig.base.parent!.worldToLocal(local.copy(target))
  const yaw = Math.atan2(-(local.x - rig.base.position.x), -(local.z - rig.base.position.z))
  rig.base.rotation.y += (MathUtils.euclideanModulo(yaw - rig.base.rotation.y + Math.PI, Math.PI * 2) - Math.PI) * k

  const du = Math.hypot(local.x - rig.base.position.x, local.z - rig.base.position.z)
  const dv = local.y - rig.base.position.y
  // Wrist goal, relative to the shoulder.
  const gu = MathUtils.clamp(du * 0.55, -0.05, 0.5) - J0.u
  const gv = MathUtils.clamp(0.6 + dv * 0.25, 0.42, 0.78) - J0.v
  let d = Math.hypot(gu, gv)
  d = MathUtils.clamp(d, Math.abs(L1 - L2) + 1e-3, L1 + L2 - 1e-3)
  const base = Math.atan2(gv, gu)
  const bend = Math.acos(MathUtils.clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1))
  const t1 = base + bend // elbow back
  const e = { u: J0.u + L1 * Math.cos(t1), v: J0.v + L1 * Math.sin(t1) }
  const w = { u: J0.u + gu, v: J0.v + gv }
  const t2 = Math.atan2(w.v - e.v, w.u - e.u)
  // Target in the rig's root frame (du, dv are measured from the shoulder).
  const t3 = Math.atan2(J0.v + dv - w.v, J0.u + du - w.u)

  const a1 = t1 - REST1
  const a2 = t2 - REST2 - a1
  const a3 = t3 - REST3 - a1 - a2
  // Rotation about +x turns (u,v) by +angle (see derivation in the rig script's notes).
  rig.lower.rotation.x += (a1 - rig.lower.rotation.x) * k
  rig.upper.rotation.x += (a2 - rig.upper.rotation.x) * k
  rig.head.rotation.x += (a3 - rig.head.rotation.x) * k
}

export const SHADE_OFFSET = new Vector3(0, SHADE.v - J2.v, -(SHADE.u - J2.u))

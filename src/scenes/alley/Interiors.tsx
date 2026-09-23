import { useLayoutEffect, useMemo, useRef } from 'react'
import { Color, InstancedMesh, Object3D } from 'three'
import { PROJECTS } from '../../content/projects'
import { HALF, LENGTH, doorAnchor } from './layout'

// What's behind the facades' windows (the kit is a shell): one dark "room"
// panel per module and floor, a few of them warmly lit — people still up at
// 3 a.m. Without this the windows are holes and the tower shows through them.

const MODULE = 3
const FLOORS = 4
const DEPTH = 0.45
const COLS = Math.round(LENGTH / MODULE)

function rng(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)
}

export function Interiors() {
  const mesh = useRef<InstancedMesh>(null!)
  const panels = useMemo(() => {
    const r = rng(33)
    // Ground-floor modules with a project door keep their room free.
    const doorZ = PROJECTS.map((p) => doorAnchor(p.id)).map((a) => ({ x: Math.sign(a.pos[0]), z: a.pos[2] }))
    const out: { x: number; y: number; z: number; side: number; lit: number }[] = []
    for (const side of [-1, 1])
      for (let i = 0; i < COLS; i++)
        for (let f = 0; f < FLOORS; f++) {
          const z = -MODULE * i - MODULE / 2
          if (f === 0 && doorZ.some((d) => d.x === side && Math.abs(d.z - z) < 1.6)) continue
          out.push({ x: side * (HALF + DEPTH), y: f * MODULE + MODULE / 2, z, side, lit: f > 0 && r() < 0.22 ? 0.25 + r() * 0.5 : 0 })
        }
    return out
  }, [])

  useLayoutEffect(() => {
    const o = new Object3D()
    const c = new Color()
    panels.forEach((p, i) => {
      o.position.set(p.x, p.y, p.z)
      o.rotation.set(0, -p.side * (Math.PI / 2), 0)
      o.updateMatrix()
      mesh.current.setMatrixAt(i, o.matrix)
      mesh.current.setColorAt(i, p.lit ? c.set('#ffb46a').multiplyScalar(p.lit) : c.set('#050506'))
    })
    mesh.current.instanceMatrix.needsUpdate = true
    mesh.current.instanceColor!.needsUpdate = true
  }, [panels])

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, panels.length]}>
      <planeGeometry args={[MODULE, MODULE]} />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  )
}

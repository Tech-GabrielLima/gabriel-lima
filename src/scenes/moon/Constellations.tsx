import { Text } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { BufferAttribute, BufferGeometry, Color, Group, InstancedMesh, LineSegments, Object3D, Vector3 } from 'three'
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js'
import { CONSTELLATIONS } from '../../content/skills'
import type { Lang } from '../../film/store'
import { MONOGRAM } from '../../ui/monogram'
import { FONT_MONO, FONT_SERIF } from '../shared'

// The skills as constellations over the lunar horizon. `lit[k]` fades each in;
// `merge` (0..1) sends every star to its place on the GL monogram.

const Z = -34
const ORANGE = new Color('#ffb36b')
const LABEL_OFFSET = new Vector3(0.35, 0.05, 0)
// Two rows of three, spread across the sky and clear of the Earth (upper right);
// on a portrait screen, three rows of two.
const PORTRAIT: [number, number][] = [
  [-5.2, 25],
  [5.2, 25],
  [-5.2, 17],
  [5.2, 17],
  [-5.2, 9],
  [5.2, 9],
]
const LANDSCAPE: [number, number][] = [
  [-17, 14.5],
  [-4.5, 17],
  [8, 14.5],
  [-17, 6.5],
  [-4.5, 8.5],
  [8, 6.5],
]

function rng(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)
}

interface Star {
  k: number
  label: string
  home: Vector3
  mono: Vector3
}

export function Constellations({ lit, merge, lang, portrait }: { lit: number[]; merge: { value: number }; lang: Lang; portrait: boolean }) {
  const CENTRES = portrait ? PORTRAIT : LANDSCAPE
  const stars = useMemo<Star[]>(() => {
    const out: Star[] = []
    CONSTELLATIONS.forEach((c, k) => {
      const r = rng(k * 97 + 11)
      const [cx, cy] = CENTRES[k]
      // Evenly round a ring (so labels never pile up), jittered so it reads as a constellation.
      const n = c.stars.length
      const pts = c.stars.map((_, i) => ({ a: (i / n) * Math.PI * 2 + r() * 0.5 + k, d: (portrait ? 2.0 : 2.6) + r() * 1.1 }))
      pts.forEach((p, i) =>
        out.push({ k, label: c.stars[i], home: new Vector3(cx + Math.cos(p.a) * p.d * 1.25, cy + Math.sin(p.a) * p.d * 0.72, Z), mono: new Vector3() }),
      )
    })
    // Places on the monogram, evenly spaced along its single stroke.
    const path = new SVGLoader().parse(`<svg xmlns="http://www.w3.org/2000/svg"><path d="${MONOGRAM}"/></svg>`).paths[0].subPaths[0]
    const spaced = path.getSpacedPoints(out.length - 1)
    out.forEach((s, i) => s.mono.set((spaced[i].x - 50) * 0.26 - 2.5, 11.5 + (50 - spaced[i].y) * 0.26, Z))
    return out
  }, [CENTRES, portrait])

  const inst = useRef<InstancedMesh>(null!)
  const lines = useRef<LineSegments>(null!)
  const labels = useRef<Group>(null!)
  const titles = useRef<Group>(null!)
  const final = useRef<Group>(null!)
  const pos = useMemo(() => stars.map((s) => s.home.clone()), [stars])
  const o = useMemo(() => new Object3D(), [])
  const c = useMemo(() => new Color(), [])

  const lineGeo = useMemo(() => {
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array(stars.length * 2 * 3), 3))
    g.setAttribute('color', new BufferAttribute(new Float32Array(stars.length * 2 * 3), 3))
    return g
  }, [stars])

  useLayoutEffect(() => {
    stars.forEach((s, i) => inst.current.setColorAt(i, c.set(CONSTELLATIONS[s.k].color)))
  }, [stars, c])

  useFrame(() => {
    const m = merge.value
    const e = m * m * (3 - 2 * m)
    const P = lineGeo.getAttribute('position') as BufferAttribute
    const C = lineGeo.getAttribute('color') as BufferAttribute
    stars.forEach((s, i) => {
      pos[i].lerpVectors(s.home, s.mono, e)
      const v = lit[s.k]
      o.position.copy(pos[i])
      o.scale.setScalar((0.13 + (i % 3) * 0.04) * (v + e * 0.4))
      o.updateMatrix()
      inst.current.setMatrixAt(i, o.matrix)
      inst.current.setColorAt(i, c.set(CONSTELLATIONS[s.k].color).lerp(ORANGE, e).multiplyScalar(2 + e * 2))
      // Lines: within a constellation until the merge, then along the monogram's stroke.
      const next = stars[i + 1]
      const sameShape = next && next.k === s.k
      const w = next ? (sameShape ? v * (1 - e) : 0) + e : 0
      const j = i + 1 < stars.length ? i + 1 : i
      P.setXYZ(i * 2, pos[i].x, pos[i].y, pos[i].z)
      P.setXYZ(i * 2 + 1, pos[j].x, pos[j].y, pos[j].z)
      c.set(CONSTELLATIONS[s.k].color).lerp(ORANGE, e).multiplyScalar(w * 0.8)
      C.setXYZ(i * 2, c.r, c.g, c.b)
      C.setXYZ(i * 2 + 1, c.r, c.g, c.b)
    })
    inst.current.instanceMatrix.needsUpdate = true
    inst.current.instanceColor!.needsUpdate = true
    P.needsUpdate = true
    C.needsUpdate = true
    // Labels ride their star; they fade out as the drawing forms.
    labels.current.children.forEach((l, i) => {
      l.position.copy(pos[i]).add(LABEL_OFFSET)
      const mat = (l as unknown as { material: { opacity: number } }).material
      if (mat) mat.opacity = lit[stars[i].k] * (1 - e)
    })
    titles.current.children.forEach((t, k) => {
      const mat = (t as unknown as { material: { opacity: number } }).material
      if (mat) mat.opacity = lit[k] * (1 - e) * 0.9
    })
    final.current.children.forEach((t) => {
      const mat = (t as unknown as { material: { opacity: number } }).material
      if (mat) mat.opacity = Math.max(0, e * 1.4 - 0.4)
    })
  })

  return (
    <group>
      <instancedMesh ref={inst} args={[undefined, undefined, stars.length]} frustumCulled={false}>
        <sphereGeometry args={[1, 10, 10]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <lineSegments ref={lines} geometry={lineGeo} frustumCulled={false}>
        <lineBasicMaterial vertexColors transparent toneMapped={false} />
      </lineSegments>
      <group ref={labels}>
        {stars.map((s, i) => (
          <Text key={i} font={FONT_MONO} fontSize={portrait ? 0.5 : 0.6} anchorX="left" anchorY="middle">
            {s.label}
            <meshBasicMaterial color={CONSTELLATIONS[s.k].color} transparent opacity={0} toneMapped={false} />
          </Text>
        ))}
      </group>
      <group ref={titles}>
        {CONSTELLATIONS.map((cn, k) => (
          <Text key={k} font={FONT_SERIF} fontSize={1.25} anchorX="center" position={[CENTRES[k][0], CENTRES[k][1] - 0.35, Z]}>
            {cn.name[lang]}
            <meshBasicMaterial color={cn.color} transparent opacity={0} toneMapped={false} />
          </Text>
        ))}
      </group>
      <group ref={final}>
        <Text font={FONT_SERIF} fontSize={1.6} anchorX="center" position={[-2.5, 22.6, Z]}>
          Full Stack
          <meshBasicMaterial color="#ffe2c2" transparent opacity={0} toneMapped={false} />
        </Text>
      </group>
    </group>
  )
}

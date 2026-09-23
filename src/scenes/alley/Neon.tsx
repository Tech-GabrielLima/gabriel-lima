import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { CatmullRomCurve3, MeshStandardMaterial, TubeGeometry, Vector3 } from 'three'
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js'

interface Props {
  /** SVG path data in a 100×100 box (e.g. the monogram). */
  d: string
  /** World size of the 100-unit box. */
  size?: number
  color: string
  intensity?: number
  /** Occasional dropout, like a tired transformer. */
  flicker?: boolean
}

/** A bent glass tube following an SVG path, lit from inside. */
export function NeonPath({ d, size = 1, color, intensity = 5, flicker = false }: Props) {
  const geometry = useMemo(() => {
    const svg = new SVGLoader().parse(`<svg xmlns="http://www.w3.org/2000/svg"><path d="${d}"/></svg>`)
    const pts = svg.paths[0].subPaths.flatMap((p) => p.getPoints(24))
    const s = size / 100
    const curve = new CatmullRomCurve3(
      pts.map((p) => new Vector3((p.x - 50) * s, (50 - p.y) * s, 0)),
      false,
      'centripetal',
    )
    return new TubeGeometry(curve, pts.length * 3, size * 0.018, 8, false)
  }, [d, size])

  const mat = useRef<MeshStandardMaterial>(null!)
  useFrame((state) => {
    if (!flicker) return
    const e = state.clock.elapsedTime
    const off = Math.sin(e * 13.7) * Math.sin(e * 3.1) > 0.965
    mat.current.emissiveIntensity = off ? intensity * 0.08 : intensity
  })

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial ref={mat} color="#111" emissive={color} emissiveIntensity={intensity} toneMapped={false} />
    </mesh>
  )
}

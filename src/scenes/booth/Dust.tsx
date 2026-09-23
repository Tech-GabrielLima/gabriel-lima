import { useFrame } from '@react-three/fiber'
import { useMemo } from 'react'
import { AdditiveBlending, BufferAttribute, BufferGeometry, ShaderMaterial, Vector3 } from 'three'
import { cursor } from '../../film/cursor'

interface Props {
  /** Beam origin and unit direction (world), updated by the owner every frame. */
  origin: Vector3
  dir: Vector3
  /** Half-angle of the cone (radians). */
  angle: number
  count?: number
  /** Box the motes fill: [min, max] corners (world). */
  box?: [[number, number, number], [number, number, number]]
}

/**
 * Dust in suspension (ROTEIRO, Cena 01): motes fill the room, but only the ones
 * inside the projector's cone catch the light. The cone test runs per vertex,
 * so the beam can swing freely at no CPU cost; waving the cursor stirs the air.
 */
export function Dust({ origin, dir, angle, count = 2200, box = [[-3.5, 0, -4], [3.5, 3.2, 1.2]] }: Props) {
  const geometry = useMemo(() => {
    const g = new BufferGeometry()
    const p = new Float32Array(count * 3)
    const seed = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      p.set([0, 1, 2].map((k) => box[0][k] + Math.random() * (box[1][k] - box[0][k])), i * 3)
      seed[i] = Math.random()
    }
    g.setAttribute('position', new BufferAttribute(p, 3))
    g.setAttribute('seed', new BufferAttribute(seed, 1))
    return g
  }, [count, box])

  const material = useMemo(
    () =>
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: {
          uTime: { value: 0 },
          uOrigin: { value: origin },
          uDir: { value: dir },
          uCos: { value: Math.cos(angle) },
          uStir: { value: 0 },
          uPixel: { value: 1 },
          uHeight: { value: box[1][1] },
        },
        vertexShader: /* glsl */ `
          attribute float seed;
          uniform float uTime, uCos, uStir, uPixel, uHeight;
          uniform vec3 uOrigin, uDir;
          varying float vLit;
          void main() {
            vec3 p = position;
            float t = uTime * (0.05 + seed * 0.08);
            // Slow Brownian drift, plus a swirl when the visitor waves the light around.
            p += vec3(sin(t * 3.1 + seed * 40.0), sin(t * 2.3 + seed * 17.0) * 0.6 - t * 0.04, cos(t * 2.7 + seed * 9.0)) * (0.25 + uStir * 0.6);
            p.y = mod(p.y, uHeight);
            vec3 v = p - uOrigin;
            float along = dot(v, uDir);
            float c = along / max(length(v), 1e-4);
            // Inside the cone, brighter near the lens, soft at the edge.
            vLit = smoothstep(uCos - 0.01, uCos + 0.02, c) * step(0.05, along) * (1.0 / (1.0 + along * 0.35));
            vLit *= 0.55 + 0.45 * sin(uTime * (1.0 + seed * 3.0) + seed * 60.0);
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_PointSize = uPixel * (1.2 + seed * 2.4) * (3.0 / -mv.z);
            gl_Position = projectionMatrix * mv;
          }
        `,
        fragmentShader: /* glsl */ `
          varying float vLit;
          void main() {
            float d = length(gl_PointCoord - 0.5);
            float a = smoothstep(0.5, 0.0, d) * vLit;
            if (a < 0.003) discard;
            gl_FragColor = vec4(vec3(1.0, 0.86, 0.66) * a * 1.6, a);
          }
        `,
      }),
    [origin, dir, angle],
  )

  useFrame((state) => {
    material.uniforms.uTime.value = state.clock.elapsedTime
    material.uniforms.uStir.value += (Math.min(cursor.speed, 4) / 4 - material.uniforms.uStir.value) * 0.03
    material.uniforms.uPixel.value = state.gl.getPixelRatio() * 2
  })

  return <points geometry={geometry} material={material} frustumCulled={false} />
}

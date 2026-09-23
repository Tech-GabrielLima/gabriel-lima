import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { AdditiveBlending, InstancedBufferAttribute, InstancedMesh, PlaneGeometry, ShaderMaterial } from 'three'
import { cursor } from '../../film/cursor'

/**
 * Rain as camera-facing streaks, animated entirely on the GPU: each drop has a
 * random seed and falls through a box around the alley, wrapping at the ground.
 * Streaks catch the light: brighter near the flashlight's side of the screen.
 */
export function Rain({ count = 2400, box = [6, 12, 36] as [number, number, number], center = [0, 6, -14] as [number, number, number] }) {
  const mesh = useRef<InstancedMesh>(null!)

  const geometry = useMemo(() => {
    const g = new PlaneGeometry(0.006, 0.42)
    const seed = new Float32Array(count * 4)
    for (let i = 0; i < count; i++) seed.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4)
    g.setAttribute('seed', new InstancedBufferAttribute(seed, 4))
    return g
  }, [count])

  const material = useMemo(
    () =>
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: {
          uTime: { value: 0 },
          uBox: { value: box },
          uCenter: { value: center },
          uWind: { value: 0 },
        },
        vertexShader: /* glsl */ `
          attribute vec4 seed;
          uniform float uTime;
          uniform vec3 uBox;
          uniform vec3 uCenter;
          uniform float uWind;
          varying float vAlpha;
          varying float vV;
          void main() {
            float speed = 9.0 + seed.w * 4.0;
            vec3 p = uCenter + (seed.xyz - 0.5) * uBox;
            p.y = uCenter.y - uBox.y * 0.5 + mod(seed.y * uBox.y - uTime * speed, uBox.y);
            p.x += uWind * (p.y - uCenter.y) * 0.06;
            // Billboard around the vertical axis so streaks always face the camera.
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            mv.xy += position.xy * vec2(1.0, 1.0);
            gl_Position = projectionMatrix * mv;
            vAlpha = 0.18 + seed.z * 0.22;
            vV = uv.y;
          }
        `,
        fragmentShader: /* glsl */ `
          varying float vAlpha;
          varying float vV;
          void main() {
            float a = vAlpha * smoothstep(0.0, 0.6, vV) * (1.0 - smoothstep(0.85, 1.0, vV));
            gl_FragColor = vec4(vec3(0.78, 0.82, 0.9) * a, a);
          }
        `,
      }),
    [],
  )

  useFrame((state) => {
    material.uniforms.uTime.value = state.clock.elapsedTime
    // Waving the flashlight fast feels like a gust.
    material.uniforms.uWind.value += (cursor.pos.x * 0.6 + Math.min(cursor.speed, 3) * 0.4 - material.uniforms.uWind.value) * 0.02
  })

  return <instancedMesh ref={mesh} args={[geometry, material, count]} frustumCulled={false} />
}

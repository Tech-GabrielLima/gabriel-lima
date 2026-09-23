import { useFrame } from '@react-three/fiber'
import { useMemo } from 'react'
import { AdditiveBlending, InstancedBufferAttribute, InstancedMesh, RingGeometry, ShaderMaterial } from 'three'

/**
 * Raindrops landing on the wet alley floor: tiny rings that open and fade,
 * each at a new random spot every cycle. All on the GPU, one draw call.
 */
export function Splashes({ count = 260, half = 3, z0 = 2, z1 = -30 }) {
  const mesh = useMemo(() => {
    const g = new RingGeometry(0.8, 1, 20).rotateX(-Math.PI / 2)
    const seed = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) seed.set([Math.random(), Math.random(), Math.random()], i * 3)
    g.setAttribute('seed', new InstancedBufferAttribute(seed, 3))
    const m = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uHalf: { value: half }, uZ: { value: [z0, z1] } },
      vertexShader: /* glsl */ `
        attribute vec3 seed;
        uniform float uTime, uHalf;
        uniform vec2 uZ;
        varying float vA;
        float h(float x) { return fract(sin(x * 91.3458) * 47453.5453); }
        void main() {
          float rate = 1.4 + seed.z * 0.8;
          float cyc = uTime * rate + seed.x * 10.0;
          float k = floor(cyc);
          float age = fract(cyc);
          // A new spot every cycle.
          vec2 at = vec2((h(k + seed.y * 13.0) - 0.5) * 2.0 * uHalf * 0.95, mix(uZ.x, uZ.y, h(k * 1.7 + seed.x * 7.0)));
          float r = 0.015 + age * 0.09;
          vec3 p = position * r + vec3(at.x, 0.006, at.y);
          vA = (1.0 - age) * (1.0 - age);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vA;
        void main() { gl_FragColor = vec4(vec3(0.75, 0.8, 0.9) * vA * 0.5, vA); }
      `,
    })
    const im = new InstancedMesh(g, m, count)
    im.frustumCulled = false
    return im
  }, [count, half, z0, z1])

  useFrame((state) => ((mesh.material as ShaderMaterial).uniforms.uTime.value = state.clock.elapsedTime))
  return <primitive object={mesh} />
}

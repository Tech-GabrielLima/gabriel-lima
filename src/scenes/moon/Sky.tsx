import { useTexture } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { AdditiveBlending, BufferAttribute, BufferGeometry, Mesh, ShaderMaterial, SRGBColorSpace, Vector3 } from 'three'

/** A dome of stars that never moves (there's no air to make them twinkle). */
export function Stars({ count = 2600, radius = 300 }) {
  const geometry = useMemo(() => {
    const g = new BufferGeometry()
    const p = new Float32Array(count * 3)
    const s = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      const u = Math.random() * 2 - 1
      const t = Math.random() * Math.PI * 2
      const r = Math.sqrt(1 - u * u)
      p.set([r * Math.cos(t) * radius, Math.abs(u) * radius, r * Math.sin(t) * radius], i * 3)
      s[i] = Math.random() ** 3
    }
    g.setAttribute('position', new BufferAttribute(p, 3))
    g.setAttribute('size', new BufferAttribute(s, 1))
    return g
  }, [count, radius])
  const material = useMemo(
    () =>
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        vertexShader: /* glsl */ `
          attribute float size;
          varying float vS;
          void main() {
            vS = size;
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = 1.2 + size * 3.2;
            gl_Position = projectionMatrix * mv;
          }
        `,
        fragmentShader: /* glsl */ `
          varying float vS;
          void main() {
            float d = length(gl_PointCoord - 0.5);
            float a = smoothstep(0.5, 0.0, d);
            gl_FragColor = vec4(vec3(0.85, 0.9, 1.0) * (0.35 + vS * 2.0), a);
          }
        `,
      }),
    [],
  )
  return <points geometry={geometry} material={material} frustumCulled={false} />
}

/**
 * The Earth hanging over the horizon: day side lit by the same sun as the
 * rocks, city lights on the night side, a blue fresnel atmosphere.
 */
export function Earth({ position, radius, sun }: { position: [number, number, number]; radius: number; sun: Vector3 }) {
  const maps = useTexture({ day: '/textures/earth/day.webp', night: '/textures/earth/lights.webp' })
  maps.day.colorSpace = maps.night.colorSpace = SRGBColorSpace
  const mesh = useRef<Mesh>(null!)
  const material = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: { uDay: { value: maps.day }, uNight: { value: maps.night }, uSun: { value: sun } },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          varying vec3 vN;
          varying vec3 vView;
          void main() {
            vUv = uv;
            vN = normalize(mat3(modelMatrix) * normal);
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vView = normalize(cameraPosition - wp.xyz);
            gl_Position = projectionMatrix * viewMatrix * wp;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform sampler2D uDay, uNight;
          uniform vec3 uSun;
          varying vec2 vUv;
          varying vec3 vN;
          varying vec3 vView;
          void main() {
            float l = dot(vN, normalize(uSun));
            float day = smoothstep(-0.12, 0.25, l);
            vec3 c = texture2D(uDay, vUv).rgb * day * 1.6;
            c += texture2D(uNight, vUv).rgb * (1.0 - smoothstep(-0.25, 0.05, l)) * vec3(1.0, 0.8, 0.5) * 1.4;
            float rim = pow(1.0 - max(dot(vN, vView), 0.0), 3.0);
            c += vec3(0.25, 0.55, 1.0) * rim * (0.35 + day * 1.4);
            gl_FragColor = vec4(c, 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }
        `,
      }),
    [maps, sun],
  )
  useFrame((_, delta) => (mesh.current.rotation.y += delta * 0.03))
  return (
    <mesh ref={mesh} position={position} rotation-z={0.41} material={material}>
      <sphereGeometry args={[radius, 64, 64]} />
    </mesh>
  )
}

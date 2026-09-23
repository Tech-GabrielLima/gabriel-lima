import { useFrame } from '@react-three/fiber'
import { useMemo } from 'react'
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, NormalBlending, ShaderMaterial } from 'three'

interface Props {
  position: [number, number, number]
  /** Horizontal spread of the source (m). */
  spread?: number
  /** How high a puff rises over its life (m). */
  rise?: number
  /** Seconds a puff lives. */
  life?: number
  /** Puff size in world units at the end of its life. */
  size?: number
  count?: number
  color?: string
  opacity?: number
  /** Sideways drift over a life (m), e.g. a breeze. */
  drift?: [number, number]
  /** Additive for glowing mist in light, normal for smoke against light. */
  additive?: boolean
}

/**
 * Steam, mist and smoke as soft billboards animated on the GPU: each puff is
 * born at the source, rises, swells, curls and fades, then loops. Cheap enough
 * to scatter everywhere (one draw call each).
 */
export function Steam({
  position,
  spread = 0.2,
  rise = 1.2,
  life = 4,
  size = 0.6,
  count = 40,
  color = '#c8d0dc',
  opacity = 0.18,
  drift = [0.2, 0],
  additive = false,
}: Props) {
  const geometry = useMemo(() => {
    const g = new BufferGeometry()
    const seed = new Float32Array(count * 4)
    for (let i = 0; i < count; i++) seed.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4)
    g.setAttribute('position', new BufferAttribute(new Float32Array(count * 3), 3))
    g.setAttribute('seed', new BufferAttribute(seed, 4))
    return g
  }, [count])

  const material = useMemo(
    () =>
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: additive ? AdditiveBlending : NormalBlending,
        uniforms: {
          uTime: { value: 0 },
          uOrigin: { value: position },
          uSpread: { value: spread },
          uRise: { value: rise },
          uLife: { value: life },
          uSize: { value: size },
          uDrift: { value: drift },
          uColor: { value: new Color(color) },
          uOpacity: { value: opacity },
          uPixel: { value: 1 },
        },
        vertexShader: /* glsl */ `
          attribute vec4 seed;
          uniform float uTime, uSpread, uRise, uLife, uSize, uPixel;
          uniform vec3 uOrigin;
          uniform vec2 uDrift;
          varying float vA;
          varying float vRot;
          void main() {
            float age = fract(uTime / uLife + seed.x);
            vec3 p = uOrigin + vec3((seed.y - 0.5) * uSpread, 0.0, (seed.z - 0.5) * uSpread);
            p.y += uRise * age;
            p.x += uDrift.x * age * age + sin(age * 6.0 + seed.w * 20.0) * 0.08 * age;
            p.z += uDrift.y * age * age + cos(age * 5.0 + seed.y * 20.0) * 0.08 * age;
            vA = smoothstep(0.0, 0.15, age) * (1.0 - smoothstep(0.55, 1.0, age));
            vRot = seed.w * 6.28 + age * (seed.x - 0.5) * 2.0;
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_PointSize = uPixel * uSize * (0.35 + age) * (300.0 / -mv.z);
            gl_Position = projectionMatrix * mv;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 uColor;
          uniform float uOpacity;
          varying float vA;
          varying float vRot;
          float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float n(vec2 p) {
            vec2 i = floor(p), f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y);
          }
          void main() {
            vec2 q = gl_PointCoord - 0.5;
            float c = cos(vRot), s = sin(vRot);
            q = mat2(c, -s, s, c) * q;
            // A soft blob with a wispy edge.
            float d = length(q) + (n(q * 6.0 + vRot) - 0.5) * 0.18;
            float a = smoothstep(0.5, 0.05, d) * vA * uOpacity;
            if (a < 0.002) discard;
            gl_FragColor = vec4(uColor, a);
          }
        `,
      }),
    // Props are fixed for a puff source's lifetime; only blending changes the program.
    [additive],
  )

  useFrame((state) => {
    const u = material.uniforms
    u.uTime.value = state.clock.elapsedTime
    u.uPixel.value = state.gl.getPixelRatio()
  })

  return <points geometry={geometry} material={material} frustumCulled={false} />
}

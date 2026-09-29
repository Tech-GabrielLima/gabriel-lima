import { useFrame } from '@react-three/fiber'
import { useMemo } from 'react'
import { DataTexture, ShaderMaterial, UniformsLib, UniformsUtils, Vector3 } from 'three'

interface Props {
  /** The sky HDRI (equirectangular), reflected by the water — the moon's path comes for free. */
  sky: DataTexture
  /** Rotation (radians about +y) applied to the sky, so the reflection matches the background. */
  skyRotation: number
  /** Same gain as the background, so the reflection matches the sky. */
  skyGain: number
  /** The visitor's lantern (world), for its warm reflection and ripples. */
  lantern: Vector3
}

/**
 * Night sea (ROTEIRO, Cena 04): four Gerstner waves, a fresnel mix of deep
 * water and the reflected sky, sparkle from a fine procedural normal, and
 * ripples spreading from where the lantern's light touches the surface.
 */
export function Ocean({ sky, skyRotation, skyGain, lantern }: Props) {
  const material = useMemo(
    () =>
      new ShaderMaterial({
        fog: true,
        uniforms: {
          ...UniformsUtils.clone(UniformsLib.fog),
          uTime: { value: 0 },
          uSky: { value: sky },
          uRot: { value: skyRotation },
          uGain: { value: skyGain },
          uLantern: { value: lantern },
          uCam: { value: new Vector3() },
        },
        vertexShader: /* glsl */ `
          uniform float uTime;
          varying vec3 vWorld;
          varying vec3 vNormal;
          #include <fog_pars_vertex>
          // Gerstner wave: direction (xz), steepness, wavelength.
          vec3 gerstner(vec4 w, vec3 p, inout vec3 tangent, inout vec3 binormal) {
            float k = 6.28318 / w.w;
            float c = sqrt(9.8 / k);
            vec2 d = normalize(w.xy);
            float f = k * (dot(d, p.xz) - c * uTime);
            float a = w.z / k;
            tangent += vec3(-d.x * d.x * w.z * sin(f), d.x * w.z * cos(f), -d.x * d.y * w.z * sin(f));
            binormal += vec3(-d.x * d.y * w.z * sin(f), d.y * w.z * cos(f), -d.y * d.y * w.z * sin(f));
            return vec3(d.x * a * cos(f), a * sin(f), d.y * a * cos(f));
          }
          void main() {
            vec3 p = (modelMatrix * vec4(position, 1.0)).xyz;
            vec3 t = vec3(1.0, 0.0, 0.0), b = vec3(0.0, 0.0, 1.0);
            vec3 q = p;
            q += gerstner(vec4(1.0, 0.3, 0.10, 22.0), p, t, b);
            q += gerstner(vec4(0.6, -0.8, 0.08, 11.0), p, t, b);
            q += gerstner(vec4(-0.4, 1.0, 0.06, 6.0), p, t, b);
            q += gerstner(vec4(0.9, 0.9, 0.05, 3.1), p, t, b);
            vWorld = q;
            vNormal = normalize(cross(b, t));
            vec4 mvPosition = viewMatrix * vec4(q, 1.0);
            gl_Position = projectionMatrix * mvPosition;
            #include <fog_vertex>
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uTime, uRot, uGain;
          uniform sampler2D uSky;
          uniform vec3 uLantern;
          varying vec3 vWorld;
          varying vec3 vNormal;
          #include <fog_pars_fragment>
          float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float n2(vec2 p) {
            vec2 i = floor(p), f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y);
          }
          vec3 sampleSky(vec3 d) {
            float c = cos(uRot), s = sin(uRot);
            d = vec3(c * d.x + s * d.z, d.y, -s * d.x + c * d.z);
            vec2 uv = vec2(atan(d.z, d.x) / 6.28318 + 0.5, asin(clamp(d.y, -1.0, 1.0)) / 3.14159 + 0.5);
            return texture2D(uSky, uv).rgb * uGain;
          }
          void main() {
            vec3 V = normalize(cameraPosition - vWorld);
            // Fine chop for sparkle, scrolling slowly.
            vec2 cp = vWorld.xz * 1.6 + uTime * 0.3;
            vec3 N = normalize(vNormal + vec3(n2(cp) - 0.5, 0.0, n2(cp + 17.0) - 0.5) * 0.22);
            // Ripples where the lantern touches the water.
            vec2 rl = vWorld.xz - uLantern.xz;
            float rd = length(rl);
            N = normalize(N + vec3(normalize(rl + 1e-4) * sin(rd * 14.0 - uTime * 5.0) * exp(-rd * 0.9) * 0.18, 0.0).xzy);
            vec3 R = reflect(-V, N);
            R.y = abs(R.y);
            float fres = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
            vec3 deep = vec3(0.004, 0.012, 0.022);
            vec3 col = mix(deep, sampleSky(R), fres);
            // The lantern's warm glint on the water.
            vec3 L = normalize(uLantern - vWorld);
            float dl = length(uLantern - vWorld);
            float spec = pow(max(dot(reflect(-L, N), V), 0.0), 60.0) * 6.0 / (1.0 + dl * dl * 0.4);
            col += vec3(1.0, 0.62, 0.3) * (spec + 0.4 / (1.0 + dl * dl * 1.5));
            gl_FragColor = vec4(col, 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
            #include <fog_fragment>
          }
        `,
      }),
    [sky, skyRotation, skyGain, lantern],
  )

  useFrame((state) => {
    material.uniforms.uTime.value = state.clock.elapsedTime
  })

  return (
    <mesh material={material} rotation-x={-Math.PI / 2} position={[0, 0, -60]} frustumCulled={false}>
      <planeGeometry args={[300, 300, 220, 220]} />
    </mesh>
  )
}

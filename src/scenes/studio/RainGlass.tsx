import { useTexture } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useMemo } from 'react'
import { CanvasTexture, LinearMipmapLinearFilter, SRGBColorSpace, ShaderMaterial, Vector2, Vector3 } from 'three'
import { MONOGRAM } from '../../ui/monogram'

const CITY = '/textures/city_night.webp'
useTexture.preload(CITY)

/** The monogram as a soft mask, for the easter egg where the drops draw it. */
function logoMask() {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')!
  g.fillStyle = '#000'
  g.fillRect(0, 0, 256, 256)
  g.translate(38, 38)
  g.scale(1.8, 1.8)
  g.strokeStyle = '#fff'
  g.lineWidth = 9
  g.lineCap = 'round'
  g.lineJoin = 'round'
  g.stroke(new Path2D(MONOGRAM))
  return new CanvasTexture(c)
}

/**
 * Rain on the studio's window (ROTEIRO, Cena 02). The pane shows the city
 * behind it (scripts/blender/window_view.py) out of focus, the way a wet
 * window does; every drop is a small lens that shows it sharp and upside
 * down. Big drops slide down in stops and starts, leaving a trail of beads
 * and a clean streak; small droplets appear and evaporate. All procedural.
 * `logo` (0..1) stops the rain and gathers the droplets into the monogram;
 * `flash` is lightning.
 */
export function RainGlass({ width, height, logo, flash }: { width: number; height: number; logo: { value: number }; flash: { value: number } }) {
  const city = useTexture(CITY)
  city.colorSpace = SRGBColorSpace
  city.minFilter = LinearMipmapLinearFilter
  const camera = useThree((s) => s.camera)

  const material = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uAspect: { value: width / height },
          uCity: { value: city },
          uLogo: logo,
          uFlash: flash,
          uMask: { value: logoMask() },
          uParallax: { value: new Vector2() },
        },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
        `,
        fragmentShader: /* glsl */ `
          uniform float uTime, uAspect, uLogo, uFlash;
          uniform sampler2D uCity, uMask;
          uniform vec2 uParallax;
          varying vec2 vUv;

          float h1(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
          vec3 h3(float n) { return fract(sin(vec3(n, n * 1.37, n * 2.13)) * vec3(43758.5453, 22578.1459, 19642.3490)); }

          // A small drop's lens: returns (offset.xy, coverage) in the layer's cell space.
          vec3 lens(vec2 d, float r) {
            float m = smoothstep(r, r * 0.55, length(d));
            return vec3(-d / r * m, m);
          }

          // Droplets that sit still, swell and evaporate. Returns (offset, coverage).
          vec3 beads(vec2 uv, float scale, float t, float keep) {
            vec2 st = uv * vec2(uAspect, 1.0) * scale;
            vec2 id = floor(st);
            vec2 gv = fract(st) - 0.5;
            vec3 n = h3(id.x * 71.3 + id.y * 17.9);
            vec2 p = (n.xy - 0.5) * 0.7;
            float life = fract(t * (0.05 + n.z * 0.05) + n.x);
            float r = (0.12 + n.z * 0.2) * smoothstep(0.0, 0.1, life) * (1.0 - smoothstep(0.75, 1.0, life));
            // Most cells stay dry; the monogram mask decides which in the easter egg.
            r *= step(0.5, n.y) * keep;
            return lens(gv - p, max(r, 1e-4));
          }

          // Drops that slide down in stops and starts, with a trail of beads and a clean streak above them.
          // Returns (offset, coverage, streak).
          vec4 sliders(vec2 uv, float scale, float t) {
            vec2 a = vec2(uAspect, 1.0) * scale;
            vec2 st = uv * a;
            st.x += 0.5;
            float col = floor(st.x);
            vec3 n = h3(col * 13.7 + scale);
            // Cells per second: rain runs down a pane fast, some rivulets faster than others.
            float speed = 0.9 + n.x * 1.6;
            st.y += t * speed + n.y * 20.0;      // the column scrolls down…
            vec2 id = floor(st);
            vec2 gv = fract(st) - vec2(0.5, 0.0);
            vec3 m = h3(id.x * 3.1 + id.y * 91.7);
            // …and each drop stutters within its cell: water catches on the glass, then lets go.
            float ph = t * (1.3 + m.z) + m.x * 6.28;
            float y = 0.55 + (sin(ph + sin(ph) * 0.8) * 0.18);
            // Rivulets wander left and right as they find their way down.
            float x = (m.y - 0.5) * 0.4 + sin(gv.y * 9.0 + id.y * 2.1 + m.z * 6.0) * 0.08;
            vec2 d = gv - vec2(x, y);
            d.y *= 1.35 + smoothstep(0.0, 0.2, -d.y) * 0.6; // heavier at the bottom
            float exists = step(0.35, m.z);
            vec3 drop = lens(d, 0.11 + m.x * 0.06) * exists;
            // Trail: small beads left behind, above the drop, fading with height.
            float above = smoothstep(y, y + 0.03, gv.y);
            float fade = 1.0 - smoothstep(y, 1.0, gv.y);
            vec2 tv = vec2(gv.x - x, fract(gv.y * 7.0) - 0.5);
            vec3 trail = lens(tv * vec2(1.0, 1.3), 0.05 + 0.03 * m.y) * above * fade * exists * step(0.5, h1(vec2(id.x, floor(gv.y * 7.0) + id.y * 7.0)));
            float streak = smoothstep(0.06, 0.0, abs(gv.x - x)) * above * fade * exists;
            vec3 o = drop + trail * 0.7;
            return vec4(o.xy / a, clamp(o.z, 0.0, 1.0), streak);
          }

          void main() {
            float t = uTime;
            float rain = 1.0 - uLogo;
            float mask = texture2D(uMask, vUv).r;
            // With the lamp off long enough, only the droplets inside the monogram survive.
            float keep = mix(1.0, smoothstep(0.2, 0.6, mask), uLogo);

            // Small, many: a pane in the rain, not a few giant blobs.
            vec4 big = sliders(vUv, 11.0, t) * rain;
            vec4 mid = sliders(vUv + 0.31, 19.0, t * 0.9) * rain;
            float clean = clamp(big.w + mid.w * 0.6, 0.0, 1.0);
            vec3 b1 = beads(vUv, 55.0, t, keep) * (1.0 - clean);
            vec3 b2 = beads(vUv + 0.17, 95.0, t * 1.3, keep) * (1.0 - clean);

            vec2 cell = vec2(uAspect, 1.0);
            vec2 off = big.xy + mid.xy * 0.8 + b1.xy / (cell * 55.0) + b2.xy / (cell * 95.0);
            float cover = clamp(big.z + mid.z + b1.z + b2.z, 0.0, 1.0);

            // The city behind: out of focus on the fogged glass, sharp inside the drops and along the streaks.
            vec2 cuv = vUv * 0.9 + 0.05 + uParallax;
            float lod = mix(4.2, 0.6, max(cover, clean * 0.6));
            vec3 col = textureLod(uCity, cuv + off * 1.3, lod).rgb;
            // Condensation lifts and cools the unwiped glass a little.
            col = mix(col, col * 0.82 + vec3(0.03, 0.035, 0.05), (1.0 - cover) * (1.0 - clean) * 0.6);
            // Drops darken at the rim (total internal reflection) and catch the room's light on top.
            col *= 1.0 - cover * (1.0 - cover) * 1.2;
            col += vec3(1.0, 0.9, 0.75) * pow(max(0.0, -off.y * 18.0 - off.x * 6.0), 3.0) * 0.25 * cover;
            // It's 3 a.m.: the city is dim, only its lights are bright.
            col = pow(col, vec3(1.35)) * 0.62;
            col *= 1.0 + uFlash * 5.0;
            gl_FragColor = vec4(col, 1.0);
            #include <colorspace_fragment>
          }
        `,
      }),
    [width, height, city, logo, flash],
  )

  const cam = useMemo(() => new Vector3(), [])
  useFrame((state) => {
    material.uniforms.uTime.value = state.clock.elapsedTime
    // A touch of parallax: the city is far, the glass is here.
    camera.getWorldPosition(cam)
    ;(material.uniforms.uParallax.value as Vector2).set(-cam.x * 0.012, -(cam.y - 1.6) * 0.012)
  })

  return (
    <mesh material={material}>
      <planeGeometry args={[width, height]} />
    </mesh>
  )
}

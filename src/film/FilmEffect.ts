import { BlendFunction, Effect, EffectAttribute } from 'postprocessing'
import { Uniform, Vector2, Vector3 } from 'three'

// The "celluloid" pass applied to every scene (ROTEIRO §1): gate weave, edge-only
// chromatic aberration, a per-scene colour grade, halation on highlights, soft
// grain that lives in the midtones (not per-pixel TV static), the odd speck of
// dust and scratch, a faint lamp flicker, the vignette, and the two ways a
// cut is hidden: an over-exposed flash, or the film burning through.
export const FILM_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uFlash;
uniform float uBurn;
uniform float uGrain;
uniform float uWeave;
uniform float uDirt;
uniform vec2 uRes;
uniform vec3 uShadow;   // split-toning: tint pushed into the shadows
uniform vec3 uHigh;     // … and into the highlights
uniform float uContrast;

// Integer hash (no sin/fract patterns): stable per pixel, uncorrelated across frames.
float hash(vec2 p) {
  uvec2 q = uvec2(ivec2(p)) * uvec2(1597334673u, 3812015801u);
  uint n = (q.x ^ q.y) * 1597334673u;
  return float(n) * (1.0 / float(0xffffffffu));
}

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i * 7.0), b = hash((i + vec2(1.0, 0.0)) * 7.0), c = hash((i + vec2(0.0, 1.0)) * 7.0), d = hash((i + vec2(1.0, 1.0)) * 7.0);
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  // 24 fps film: weave, grain and dirt change per frame, not per display refresh.
  float frame = floor(uTime * 24.0);
  vec2 weave = (vec2(hash(vec2(frame, 17.0)), hash(vec2(frame, 91.0))) - 0.5) * uWeave / uRes;
  weave.y += sin(uTime * 0.9) * 0.35 / uRes.y;
  vec2 st = uv + weave;

  vec2 d = st - 0.5;
  float r2 = dot(d, d);
  vec2 ca = d * r2 * 0.012;
  vec3 col = vec3(
    texture2D(inputBuffer, st + ca).r,
    texture2D(inputBuffer, st).g,
    texture2D(inputBuffer, st - ca).b
  );

  // Grade: a touch of saturation and contrast, then split-tone shadows and highlights.
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(lum), col, 1.04);
  col = pow(max(col, 0.0), vec3(uContrast));
  float l2 = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col += uShadow * (1.0 - smoothstep(0.0, 0.35, l2)) * 0.035;
  col *= mix(vec3(1.0), uHigh, smoothstep(0.3, 1.0, l2));

  // Halation: film glows red-orange around the brightest highlights.
  col += vec3(0.9, 0.25, 0.08) * smoothstep(0.8, 2.6, lum) * 0.22;

  float vig = smoothstep(1.0, 0.28, length(d * vec2(1.0, 0.85)));
  col *= mix(0.3, 1.0, vig);

  // The projector lamp is never perfectly steady.
  col *= 1.0 + (hash(vec2(frame, 3.0)) - 0.5) * 0.018;

  // Grain: soft (clumped over ~1.6 px), mostly in the midtones, almost none in black.
  float g = vnoise(uv * uRes / 1.6 + vec2(frame * 37.0, frame * 11.0)) - 0.5;
  float mid = smoothstep(0.0, 0.18, l2) * (1.0 - smoothstep(0.5, 1.2, l2) * 0.6);
  col += g * uGrain * mid;

  // Dust and scratches: rare, a frame or two each — the print has been run before.
  if (hash(vec2(frame, 7.0)) < 0.18 * uDirt) {
    vec2 sp = vec2(hash(vec2(frame, 41.0)), hash(vec2(frame, 59.0)));
    vec2 q = (uv - sp) * vec2(uRes.x / uRes.y, 1.0);
    float r = 0.0015 + hash(vec2(frame, 83.0)) * 0.004;
    float dust = smoothstep(r, r * 0.3, length(q * vec2(1.0, 0.6 + hash(vec2(frame, 5.0)))));
    col = mix(col, vec3(0.02), dust * 0.8);
  }
  if (hash(vec2(floor(uTime * 3.0), 13.0)) > 1.0 - 0.06 * uDirt) {
    float x = hash(vec2(floor(uTime * 3.0), 29.0)) + sin(uTime * 7.0) * 0.002;
    float s = smoothstep(0.7 / uRes.x, 0.0, abs(uv.x - x)) * (0.5 + 0.5 * vnoise(vec2(uv.y * 40.0, frame)));
    col += s * 0.06;
  }

  // Lift the blacks towards the film's blue-black (#07080C) instead of pure 0.
  col = max(col, vec3(0.0024, 0.0026, 0.0042));

  // Film burn (the skills → contact cut): a hole melts open from a hot spot, orange at its rim.
  if (uBurn > 0.0) {
    vec2 bp = (uv - vec2(0.62, 0.55)) * vec2(uRes.x / uRes.y, 1.0);
    float n = vnoise(uv * 5.0 + uTime * 0.4) * 0.35 + vnoise(uv * 13.0) * 0.15;
    float edge = uBurn * 1.6 - (length(bp) + n);
    float hole = smoothstep(0.0, 0.06, edge);
    float rim = smoothstep(0.09, 0.0, abs(edge - 0.015)) * (1.0 - hole);
    col = mix(col, vec3(1.35, 1.2, 1.0), hole);
    col += vec3(1.6, 0.55, 0.1) * rim * 1.8;
    col += vec3(0.5, 0.12, 0.02) * smoothstep(-0.25, 0.0, edge) * (1.0 - hole);
  }

  col = mix(col, vec3(1.25, 1.12, 0.95), uFlash);
  outputColor = vec4(col, inputColor.a);
}
`

export class FilmEffect extends Effect {
  constructor() {
    super('FilmEffect', FILM_FRAGMENT, {
      blendFunction: BlendFunction.NORMAL,
      // Samples inputBuffer at offset UVs, so it cannot be merged with other convolutions.
      attributes: EffectAttribute.CONVOLUTION,
      uniforms: new Map<string, Uniform>([
        ['uTime', new Uniform(0)],
        ['uFlash', new Uniform(0)],
        ['uBurn', new Uniform(0)],
        ['uGrain', new Uniform(0.035)],
        ['uWeave', new Uniform(0.5)],
        ['uDirt', new Uniform(1)],
        ['uRes', new Uniform(new Vector2(1, 1))],
        ['uShadow', new Uniform(new Vector3(0.2, 0.3, 0.6))],
        ['uHigh', new Uniform(new Vector3(1.02, 1.0, 0.96))],
        ['uContrast', new Uniform(1.05)],
      ]),
    })
  }

  setSize(width: number, height: number) {
    ;(this.uniforms.get('uRes')!.value as Vector2).set(width, height)
  }
}

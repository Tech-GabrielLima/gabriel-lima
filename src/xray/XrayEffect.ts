import { BlendFunction, Effect, EffectAttribute } from 'postprocessing'
import { Texture, Uniform, Vector2, Vector3, Vector4 } from 'three'

// The X-ray pass (xray/xray.ts), after the film's own. Six looks, one per layer
// of the stack, and the way the frame peels from one to the next: the new
// layer burns through from where the visitor's light is, like the film burn
// between the Moon and the credits, with a hot edge. Between geometry and
// code the wireframe first turns into type (each cell picks a character by how
// much wire is in it), then the cells decode, one by one, into the real
// source. Plus the scan that opens it, and the one-off projection fault that
// tears the frame open by itself in the alley.

export const BEAMS = 10

const fragment = /* glsl */ `
uniform float uDepth;        // 0 pixel · 1 geometry · 2 shader · 3 network · 4 server · 5 silicon (fractions: mid-peel)
uniform float uOn;           // 0..1, the X-ray as a whole
uniform float uEnter;        // 0..1, the opening scan
uniform float uGlitch;       // 0..1, the projection fault
uniform float uTime;
uniform vec2 uRes;
uniform vec2 uOrigin;        // where the light is (uv): every peel starts there
uniform vec3 uLens;          // pixel loupe: centre (uv), radius (0 = off)
uniform float uGpu;          // 0..1, how busy the GPU is (pulses on the die)
uniform sampler2D tWire;
uniform sampler2D tAtlas;
uniform sampler2D tCode2;    // the film shader's source, live
uniform sampler2D tCode3;    // the live wire's source, with packets falling through it
uniform sampler2D tCode4;    // the server's Java
uniform vec2 uGrid;          // cells: cols, rows
uniform vec4 uBeams[${BEAMS}]; // packets: x (uv), head (0 top..1 bottom), length, strength

float h21(vec2 p) {
  uvec2 q = uvec2(ivec2(floor(p))) * uvec2(1597334673u, 3812015801u);
  uint n = (q.x ^ q.y) * 1597334673u;
  return float(n) * (1.0 / float(0xffffffffu));
}
float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y);
}
float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

vec3 palette(float k) {
  if (k < 0.5) return vec3(0.86, 0.82, 0.74);   // plain
  if (k < 1.5) return vec3(1.0, 0.70, 0.42);    // keyword
  if (k < 2.5) return vec3(0.45, 0.94, 0.90);   // number
  if (k < 3.5) return vec3(0.42, 0.40, 0.38);   // comment
  if (k < 4.5) return vec3(0.58, 0.95, 0.62);   // string
  if (k < 5.5) return vec3(1.0, 0.86, 0.55);    // live value
  if (k < 6.5) return vec3(0.55, 0.95, 1.0);    // packet
  return vec3(1.0, 1.0, 1.0);                   // hot
}

// --- cells ------------------------------------------------------------------
vec2 cellOf(vec2 uv) { return floor(vec2(uv.x, 1.0 - uv.y) * uGrid); }
vec2 inCell(vec2 uv) { return fract(vec2(uv.x, 1.0 - uv.y) * uGrid); }
vec2 cellUv(vec2 cell) { vec2 c = (cell + 0.5) / uGrid; return vec2(c.x, 1.0 - c.y); }

float glyph(float code, vec2 f) {
  float i = clamp(code - 32.0, 0.0, 95.0);
  vec2 a = vec2(mod(i, 16.0), floor(i / 16.0));
  // A little margin so neighbouring glyphs never bleed in.
  f = mix(vec2(0.06, 0.04), vec2(0.94, 0.96), f);
  return texture2D(tAtlas, vec2((a.x + f.x) / 16.0, 1.0 - (a.y + f.y) / 6.0)).r;
}

vec3 look_image(vec2 uv) { return texture2D(inputBuffer, uv).rgb; }

// 0 · the pixels themselves, with a loupe that shows them for what they are
vec3 look_pixel(vec2 uv) {
  vec3 col = look_image(uv);
  if (uLens.z <= 0.0) return col;
  vec2 asp = vec2(uRes.x / uRes.y, 1.0);
  float r = length((uv - uLens.xy) * asp);
  if (r > uLens.z + 0.004) return col;
  vec2 s = uLens.xy + (uv - uLens.xy) / 12.0;
  vec2 px = floor(s * uRes);
  vec3 c = texture2D(inputBuffer, (px + 0.5) / uRes).rgb;
  vec2 f = fract(s * uRes);
  float grid = max(step(f.x, 0.07), step(f.y, 0.07));
  c = mix(c, c * 0.25, grid);
  float ring = smoothstep(0.004, 0.0, abs(r - uLens.z));
  return mix(c, vec3(1.0, 0.72, 0.42), ring);
}

// 1 · the scene as triangles (hidden lines already removed), glowing a little
vec3 look_geometry(vec2 uv) {
  vec2 px = 1.5 / uRes;
  vec3 w = texture2D(tWire, uv).rgb;
  vec3 g = texture2D(tWire, uv + vec2(px.x, 0)).rgb + texture2D(tWire, uv - vec2(px.x, 0)).rgb
         + texture2D(tWire, uv + vec2(0, px.y)).rgb + texture2D(tWire, uv - vec2(0, px.y)).rgb;
  vec3 base = vec3(0.012, 0.02, 0.032) + look_image(uv) * 0.05;
  return base + w * vec3(0.55, 0.88, 1.0) * 1.3 + g * vec3(0.2, 0.45, 0.7) * 0.22;
}

// the wireframe turned into type: each cell's character is picked by how much wire it holds
vec3 look_ascii(vec2 uv) {
  vec2 cell = cellOf(uv);
  float l = lum(texture2D(tWire, cellUv(cell)).rgb) * 2.2 + lum(look_image(cellUv(cell))) * 0.4;
  float k = floor(clamp(l, 0.0, 0.999) * 9.0);
  float code = k < 1.0 ? 32.0 : k < 2.0 ? 46.0 : k < 3.0 ? 58.0 : k < 4.0 ? 45.0 : k < 5.0 ? 61.0 : k < 6.0 ? 43.0 : k < 7.0 ? 42.0 : k < 8.0 ? 35.0 : 64.0;
  return vec3(0.5, 0.88, 1.0) * glyph(code, inCell(uv)) * (0.4 + l * 0.8) + vec3(0.01, 0.015, 0.025);
}

vec3 look_code(sampler2D grid, vec2 uv) {
  vec2 cell = cellOf(uv);
  vec4 t = texture2D(grid, (cell + 0.5) / uGrid);
  vec3 bg = vec3(0.014, 0.012, 0.02);
  if (t.a < 0.5) return bg;
  return bg + palette(t.g * 255.0) * glyph(t.r * 255.0, inCell(uv)) * (0.25 + t.b * 1.1);
}

// the packets, as light falling through the code
vec3 beams(vec2 uv) {
  vec3 add = vec3(0.0);
  float y = 1.0 - uv.y;
  for (int i = 0; i < ${BEAMS}; i++) {
    vec4 b = uBeams[i];
    if (b.w <= 0.0) continue;
    float dx = abs(uv.x - b.x) * uRes.x;
    float along = (y - (b.y - b.z)) / b.z;           // 0 at the tail, 1 at the head
    if (along < 0.0 || along > 1.08) continue;
    float body = pow(clamp(along, 0.0, 1.0), 2.2) * exp(-dx / 5.0);
    float head = exp(-abs(y - b.y) * uRes.y / 6.0) * exp(-dx / 14.0);
    add += (vec3(0.35, 0.8, 1.0) * body * 0.7 + vec3(0.8, 0.97, 1.0) * head * 1.4) * b.w;
  }
  return add;
}

// 5 · the chip: blocks of memory and logic, gold wiring, pulses at the GPU's pace
vec3 look_silicon(vec2 uv) {
  vec2 asp = vec2(uRes.x / uRes.y, 1.0);
  vec2 p = uv * asp * 9.0 + vec2(0.3, 0.1);
  vec2 c = floor(p), f = fract(p);
  float h = h21(c * 3.1);
  vec3 col = vec3(0.035, 0.04, 0.055) + vec3(0.02, 0.012, 0.03) * vn(uv * 60.0);
  float speed = 0.4 + uGpu * 3.0;
  if (h < 0.34) {
    // SRAM: a fine lattice of cells
    vec2 g = fract(f * 14.0);
    float line = max(step(g.x, 0.14), step(g.y, 0.14));
    col += vec3(0.32, 0.24, 0.14) * line * 0.55;
    float lit = step(0.93, h21(floor(f * 14.0) + c * 17.0 + floor(uTime * speed * 4.0)));
    col += vec3(1.0, 0.75, 0.4) * lit * 0.35 * (1.0 - line);
  } else if (h < 0.72) {
    // logic: horizontal lanes of wiring, pulses running along them
    float lanes = 7.0 + floor(h * 10.0);
    float ly = fract(f.y * lanes);
    float lane = floor(f.y * lanes);
    float wire = smoothstep(0.16, 0.0, abs(ly - 0.5) - 0.12) * step(0.35, h21(c + lane * 13.0));
    float dir = h21(c + lane) > 0.5 ? 1.0 : -1.0;
    float pulse = smoothstep(0.06, 0.0, abs(fract(f.x * 1.5 - uTime * speed * dir * (0.4 + h21(c - lane))) - 0.5) - 0.02);
    col += vec3(0.62, 0.48, 0.25) * wire * 0.6 + vec3(0.6, 0.95, 1.0) * wire * pulse * 1.3;
  } else {
    // analogue / pads: big squares with vias
    vec2 g = fract(f * 3.0);
    float pad = step(0.12, g.x) * step(g.x, 0.88) * step(0.12, g.y) * step(g.y, 0.88);
    col += vec3(0.55, 0.45, 0.28) * pad * 0.35;
    float via = smoothstep(0.12, 0.08, length(g - 0.5));
    col += vec3(0.9, 0.8, 0.6) * via * 0.45;
  }
  float edge = max(step(f.x, 0.02), step(f.y, 0.02));
  col += vec3(0.75, 0.58, 0.3) * edge * 0.45;
  // Thin-film interference: the die catches the light in rainbow bands.
  col += (0.5 + 0.5 * cos(6.283 * (uv.x * 0.9 + uv.y * 0.6 + vec3(0.0, 0.33, 0.67)))) * 0.05;
  // The light still leads: brighter where it points.
  vec2 d = (uv - uOrigin) * asp;
  col *= 0.65 + 0.8 * exp(-dot(d, d) * 3.0);
  return col;
}

vec3 layer(int k, vec2 uv) {
  if (k <= 0) return look_pixel(uv);
  if (k == 1) return look_geometry(uv);
  if (k == 2) return look_code(tCode2, uv);
  if (k == 3) return look_code(tCode3, uv) * 0.75 + beams(uv);
  if (k == 4) return look_code(tCode4, uv) + beams(uv) * 0.35;
  return look_silicon(uv);
}

// The peel: from layer k to k+1 as t goes 0..1, burning out from the light.
vec3 peel(int k, float t, vec2 uv) {
  vec3 a = layer(k, uv);
  if (t <= 0.0) return a;
  vec2 asp = vec2(uRes.x / uRes.y, 1.0);
  float n = vn(uv * 5.0 + uTime * 0.35) * 0.28 + vn(uv * 21.0 - uTime * 0.2) * 0.09;
  float edge = t * 1.95 - (length((uv - uOrigin) * asp) + n);
  float fresh = smoothstep(0.0, 0.012, edge);
  vec3 b;
  if (k == 1 && fresh > 0.0) {
    // Geometry → code: the wire becomes type first, then each cell decodes into the source.
    float decode = clamp(edge * 2.4 - h21(cellOf(uv) * 1.7) * 0.9, 0.0, 1.0);
    b = mix(look_ascii(uv), layer(2, uv), step(0.5, decode));
  } else {
    b = layer(k + 1, uv);
  }
  vec3 col = mix(a, b, fresh);
  // The hot edge: film-burn orange out of the picture, X-ray cyan deeper down.
  vec3 hot = k == 0 ? vec3(1.6, 0.75, 0.25) : vec3(0.55, 0.95, 1.2);
  float rim = exp(-abs(edge) * 140.0) * (1.0 - fresh * 0.5) * (1.0 - smoothstep(0.9, 1.0, t));
  col += hot * rim * 0.85;
  // Just inside the edge the new layer is still warm, cooling as the burn moves on.
  col += hot * exp(-max(edge, 0.0) * 28.0) * fresh * 0.14 * (1.0 - t);
  return col;
}

// The one-off projection fault: the print jumps, tears into bands, and for a moment
// some of the bands show what is underneath.
vec3 fault(vec3 col, vec2 uv) {
  float g = uGlitch;
  float frame = floor(uTime * 24.0);
  float slip = step(0.72, h21(vec2(frame, 4.0))) * (h21(vec2(frame, 9.0)) - 0.5) * 0.12 * g;
  vec2 st = vec2(uv.x, fract(uv.y + slip));
  float rows = mix(6.0, 30.0, h21(vec2(floor(uTime * 16.0), 3.0)));
  float band = floor((1.0 - st.y) * rows);
  float bh = h21(vec2(band, floor(uTime * 20.0)));
  st.x += (bh - 0.5) * 0.08 * g * step(0.5, bh);
  float ca = 0.006 * g;
  vec3 torn = vec3(texture2D(inputBuffer, st + vec2(ca, 0)).r, texture2D(inputBuffer, st).g, texture2D(inputBuffer, st - vec2(ca, 0)).b);
  float kind = h21(vec2(band * 1.3, floor(uTime * 11.0) + 7.0));
  if (kind > 1.0 - 0.32 * g) torn = look_geometry(st) * 1.2;
  else if (kind > 1.0 - 0.5 * g) torn = look_code(tCode2, st) * 1.3;
  torn *= 1.0 + (h21(vec2(frame, 1.0)) - 0.5) * 0.7 * g;
  // A bright scratch rides down the gate.
  torn += vec3(0.9, 0.95, 1.0) * smoothstep(2.0 / uRes.x, 0.0, abs(uv.x - h21(vec2(frame, 21.0)))) * 0.5 * g;
  return mix(col, torn, smoothstep(0.02, 0.2, g));
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  if (uOn <= 0.0 && uGlitch <= 0.0) { outputColor = inputColor; return; }
  vec3 col = inputColor.rgb;
  if (uOn > 0.0) {
    float d = clamp(uDepth, 0.0, 5.0);
    int k = int(floor(d));
    vec3 x = k >= 5 ? layer(5, uv) : peel(k, d - float(k), uv);
    // The opening scan: a bar of cold light sweeps down, and the cells the frame is made of show for an instant.
    float y = 1.0 - uv.y;
    float bar = exp(-abs(y - uEnter * 1.1) * uRes.y / 9.0) * (1.0 - uEnter);
    vec2 f = inCell(uv);
    float cells = max(step(f.x, 0.05), step(f.y, 0.05)) * step(y, uEnter * 1.1) * (1.0 - uEnter) * 0.35;
    x += vec3(0.5, 0.9, 1.1) * (bar * 1.2 + cells * 0.25);
    col = mix(col, x, uOn);
  }
  if (uGlitch > 0.0) col = fault(col, uv);
  outputColor = vec4(col, inputColor.a);
}
`

export class XrayEffect extends Effect {
  constructor() {
    const beams = Array.from({ length: BEAMS }, () => new Vector4(0, 0, 0, 0))
    super('XrayEffect', fragment, {
      blendFunction: BlendFunction.NORMAL,
      // Samples its input at other pixels (the loupe, the fault's tearing), like the film pass.
      attributes: EffectAttribute.CONVOLUTION,
      uniforms: new Map<string, Uniform>([
        ['uDepth', new Uniform(0)],
        ['uOn', new Uniform(0)],
        ['uEnter', new Uniform(1)],
        ['uGlitch', new Uniform(0)],
        ['uTime', new Uniform(0)],
        ['uRes', new Uniform(new Vector2(1, 1))],
        ['uOrigin', new Uniform(new Vector2(0.5, 0.5))],
        ['uLens', new Uniform(new Vector3(0.5, 0.5, 0))],
        ['uGpu', new Uniform(0.2)],
        ['tWire', new Uniform(null as Texture | null)],
        ['tAtlas', new Uniform(null as Texture | null)],
        ['tCode2', new Uniform(null as Texture | null)],
        ['tCode3', new Uniform(null as Texture | null)],
        ['tCode4', new Uniform(null as Texture | null)],
        ['uGrid', new Uniform(new Vector2(1, 1))],
        ['uBeams', new Uniform(beams)],
      ]),
    })
  }

  setSize(width: number, height: number) {
    ;(this.uniforms.get('uRes')!.value as Vector2).set(width, height)
  }
}

/** The one instance: Post.tsx composes it, XrayStage.tsx drives it. */
export const xrayEffect = new XrayEffect()

// A tiny character-level GPT for the NABLA room (ROTEIRO §0.4.5, frame 29),
// trained offline by ./llm/train.py (numpy, from scratch: forward, backward,
// AdamW) on ~30 KB of text about this cinema, then stored as int8 with one
// scale per row in public/data/nano-cinema.bin. This file is its inference:
// the same forward pass as train.py, one character at a time, with a cache of
// keys and values so each new character costs one position, not the window.
//
// It's small (350k parameters, 3 layers) and it memorised much of its corpus:
// what it writes is its training text, remixed. The room says so.

interface Header {
  cfg: { n_layer: number; n_head: number; d: number; ctx: number }
  vocab: string
  tensors: { name: string; shape: number[]; q?: number; s?: number; f?: number; axis?: number }[]
  n32: number
  n8: number
  params: number
}

export interface Model {
  cfg: Header['cfg']
  vocab: string[]
  stoi: Map<string, number>
  w: Record<string, Float32Array>
  params: number
}

let loading: Promise<Model> | null = null

export function loadModel(): Promise<Model> {
  loading ??= (async () => {
    const buf = await (await fetch('/data/nano-cinema.bin')).arrayBuffer()
    const n = new DataView(buf).getUint32(0, true)
    const h = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, n))) as Header
    const f32 = new Float32Array(buf, 4 + n, h.n32)
    const i8 = new Int8Array(buf, 4 + n + 4 * h.n32, h.n8)
    const w: Record<string, Float32Array> = {}
    for (const t of h.tensors) {
      const size = t.shape.reduce((a, b) => a * b, 1)
      if (t.f !== undefined) {
        w[t.name] = f32.slice(t.f, t.f + size)
        continue
      }
      const [rows, cols] = t.shape
      const out = new Float32Array(size)
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) {
          // wte has one scale per row (a token); the other matrices, one per column (an output).
          const s = t.axis === 0 ? f32[t.s! + r] : f32[t.s! + c]
          out[r * cols + c] = i8[t.q! + r * cols + c] * s
        }
      w[t.name] = out
    }
    const vocab = [...h.vocab]
    return { cfg: h.cfg, vocab, stoi: new Map(vocab.map((c, i) => [c, i])), w, params: h.params }
  })()
  return loading
}

function layerNorm(x: Float32Array, g: Float32Array, b: Float32Array) {
  const d = x.length
  let mu = 0
  for (let i = 0; i < d; i++) mu += x[i]
  mu /= d
  let v = 0
  for (let i = 0; i < d; i++) v += (x[i] - mu) ** 2
  const rs = 1 / Math.sqrt(v / d + 1e-5)
  const out = new Float32Array(d)
  for (let i = 0; i < d; i++) out[i] = (x[i] - mu) * rs * g[i] + b[i]
  return out
}

/** y = x @ W + b, with W stored input-major (rows = inputs), as in train.py. */
function linear(x: Float32Array, W: Float32Array, b: Float32Array, outDim: number) {
  const y = b.slice(0, outDim)
  for (let i = 0; i < x.length; i++) {
    const xi = x[i]
    if (xi === 0) continue
    const row = i * outDim
    for (let o = 0; o < outDim; o++) y[o] += xi * W[row + o]
  }
  return y
}

const gelu = (x: number) => 0.5 * x * (1 + Math.tanh(Math.sqrt(2 / Math.PI) * (x + 0.044715 * x * x * x)))

/** One sequence being written: its cached keys and values per layer. */
class Stream {
  private m: Model
  private k: Float32Array[][] = []
  private v: Float32Array[][] = []
  pos = 0
  constructor(m: Model) {
    this.m = m
    this.reset()
  }
  reset() {
    this.k = Array.from({ length: this.m.cfg.n_layer }, () => [])
    this.v = Array.from({ length: this.m.cfg.n_layer }, () => [])
    this.pos = 0
  }
  /** Feeds one token at the next position → the logits for the one after it. */
  step(tok: number): Float32Array {
    const { d, n_head: H, n_layer: L } = this.m.cfg
    const { w } = this.m
    const hd = d / H
    const x = new Float32Array(d)
    for (let i = 0; i < d; i++) x[i] = w.wte[tok * d + i] + w.wpe[this.pos * d + i]
    for (let l = 0; l < L; l++) {
      const h = layerNorm(x, w[`${l}.ln1.g`], w[`${l}.ln1.b`])
      const qkv = linear(h, w[`${l}.qkv.w`], w[`${l}.qkv.b`], 3 * d)
      this.k[l].push(qkv.slice(d, 2 * d))
      this.v[l].push(qkv.slice(2 * d, 3 * d))
      const y = new Float32Array(d)
      const T = this.k[l].length
      for (let hh = 0; hh < H; hh++) {
        const off = hh * hd
        const sc = new Float32Array(T)
        let max = -Infinity
        for (let t = 0; t < T; t++) {
          let s = 0
          const kt = this.k[l][t]
          for (let i = 0; i < hd; i++) s += qkv[off + i] * kt[off + i]
          sc[t] = s / Math.sqrt(hd)
          if (sc[t] > max) max = sc[t]
        }
        let sum = 0
        for (let t = 0; t < T; t++) sum += sc[t] = Math.exp(sc[t] - max)
        for (let t = 0; t < T; t++) {
          const p = sc[t] / sum
          const vt = this.v[l][t]
          for (let i = 0; i < hd; i++) y[off + i] += p * vt[off + i]
        }
      }
      const o = linear(y, w[`${l}.o.w`], w[`${l}.o.b`], d)
      for (let i = 0; i < d; i++) x[i] += o[i]
      const h2 = layerNorm(x, w[`${l}.ln2.g`], w[`${l}.ln2.b`])
      const u = linear(h2, w[`${l}.fc.w`], w[`${l}.fc.b`], 4 * d)
      for (let i = 0; i < u.length; i++) u[i] = gelu(u[i])
      const pr = linear(u, w[`${l}.pr.w`], w[`${l}.pr.b`], d)
      for (let i = 0; i < d; i++) x[i] += pr[i]
    }
    const xf = layerNorm(x, w['lnf.g'], w['lnf.b'])
    // The output head is the embedding, transposed (tied weights).
    const V = this.m.vocab.length
    const logits = new Float32Array(V)
    for (let t = 0; t < V; t++) {
      let s = 0
      for (let i = 0; i < d; i++) s += xf[i] * w.wte[t * d + i]
      logits[t] = s
    }
    this.pos++
    return logits
  }
}

function sample(logits: Float32Array, temp: number) {
  let max = -Infinity
  for (const v of logits) if (v > max) max = v
  const p = logits.map((v) => Math.exp((v - max) / temp))
  let r = Math.random() * p.reduce((a, b) => a + b, 0)
  for (let i = 0; i < p.length; i++) if ((r -= p[i]) <= 0) return i
  return p.length - 1
}

/**
 * Writes `n` characters after `prompt`, calling `onChar` as each one comes.
 * Yields to the page between characters. Resolves with characters per second.
 */
export async function write(m: Model, prompt: string, n: number, onChar: (c: string) => void, opts: { temp?: number; stop?: () => boolean } = {}) {
  const temp = opts.temp ?? 0.7
  const s = new Stream(m)
  const ids = [...prompt].map((c) => m.stoi.get(c) ?? m.stoi.get(' ') ?? 0)
  let logits: Float32Array = new Float32Array(0)
  const prefill = (from: number[]) => {
    s.reset()
    for (const t of from) logits = s.step(t)
  }
  prefill(ids)
  const t0 = performance.now()
  for (let i = 0; i < n; i++) {
    if (opts.stop?.()) break
    // Past the window, start over on its last half (positions only go up to ctx).
    if (s.pos >= m.cfg.ctx) prefill(ids.slice(-Math.floor(m.cfg.ctx / 2)))
    const next = sample(logits, temp)
    ids.push(next)
    onChar(m.vocab[next])
    logits = s.step(next)
    if (i % 4 === 3) await new Promise((r) => setTimeout(r, 0))
  }
  return (ids.length - [...prompt].length) / ((performance.now() - t0) / 1000)
}

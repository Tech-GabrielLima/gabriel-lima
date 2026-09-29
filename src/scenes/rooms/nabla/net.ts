// The NABLA room's network: nabla's own MLP for the 8×8 digits
// (examples/train_mlp.py: Linear(64→128) → ReLU → Linear(128→64) → ReLU →
// Linear(64→10)), with weights trained for this room offline on the same
// dataset (scikit-learn's digits, 80/20 split) and shipped as int8 in
// public/data/nabla-mlp.json. Forward and backward are written out here by
// hand, reverse mode, the way nabla's autograd does them, so the room can show
// every activation on the way in and every gradient on the way back, and take
// a real SGD step when the visitor teaches it.

export interface Sample {
  x: number[]
  y: number
}
interface Packed {
  s: number
  q: string
  shape: number[]
}
interface File {
  sizes: number[]
  W: Packed[]
  b: Packed[]
  acc: number
  test: number
  samples: Sample[]
}

const unpack = (p: Packed) => {
  const bin = atob(p.q)
  const out = new Float32Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = ((bin.charCodeAt(i) << 24) >> 24) * p.s
  return out
}

export interface Pass {
  /** Activations per layer: the input (scaled 0..1), both hidden layers after ReLU, the logits. */
  a: Float32Array[]
  probs: Float32Array
}
export interface Grads {
  /** dLoss/d(activation) per layer, input included. */
  da: Float32Array[]
  loss: number
}

export class Net {
  sizes: number[]
  W: Float32Array[]
  b: Float32Array[]
  acc: number
  test: number
  samples: Sample[]

  constructor(f: File) {
    this.sizes = f.sizes
    this.W = f.W.map(unpack)
    this.b = f.b.map(unpack)
    this.acc = f.acc
    this.test = f.test
    this.samples = f.samples
  }

  forward(x16: number[]): Pass {
    const a: Float32Array[] = [Float32Array.from(x16, (v) => v / 16)]
    for (let l = 0; l < 3; l++) {
      const n = this.sizes[l]
      const m = this.sizes[l + 1]
      const W = this.W[l]
      const out = Float32Array.from(this.b[l])
      const inp = a[l]
      for (let i = 0; i < n; i++) {
        const v = inp[i]
        if (v === 0) continue
        for (let j = 0; j < m; j++) out[j] += v * W[i * m + j]
      }
      if (l < 2) for (let j = 0; j < m; j++) out[j] = Math.max(0, out[j])
      a.push(out)
    }
    const z = a[3]
    const mx = Math.max(...z)
    const e = z.map((v) => Math.exp(v - mx))
    const s = e.reduce((p, q) => p + q, 0)
    return { a, probs: e.map((v) => v / s) }
  }

  /** Cross-entropy against `label`, back through every layer; with lr > 0 it also takes the SGD step. */
  backward(p: Pass, label: number, lr = 0): Grads {
    const da: Float32Array[] = new Array(4)
    let g = Float32Array.from(p.probs)
    const loss = -Math.log(Math.max(1e-9, p.probs[label]))
    g[label] -= 1
    da[3] = g
    for (let l = 2; l >= 0; l--) {
      const n = this.sizes[l]
      const m = this.sizes[l + 1]
      const W = this.W[l]
      const prev = new Float32Array(n)
      for (let i = 0; i < n; i++) {
        let s = 0
        for (let j = 0; j < m; j++) s += W[i * m + j] * g[j]
        // Through the ReLU of the layer below (the input has none).
        prev[i] = l > 0 && p.a[l][i] <= 0 ? 0 : s
      }
      if (lr > 0) {
        const inp = p.a[l]
        for (let i = 0; i < n; i++) {
          const v = inp[i]
          if (v !== 0) for (let j = 0; j < m; j++) W[i * m + j] -= lr * v * g[j]
        }
        for (let j = 0; j < m; j++) this.b[l][j] -= lr * g[j]
      }
      da[l] = prev
      g = prev
    }
    return { da, loss }
  }
}

let loading: Promise<Net> | null = null
/** The network, loaded once per page. */
export const loadNet = () => (loading ??= fetch('/data/nabla-mlp.json').then((r) => r.json() as Promise<File>).then((f) => new Net(f)))

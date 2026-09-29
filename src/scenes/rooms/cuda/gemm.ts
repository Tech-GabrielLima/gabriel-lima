// The five GEMM versions of cuda-kernels-from-scratch, ported to WGSL and
// measured on the visitor's own GPU (ROTEIRO §0.4.5, frame 28). Same ideas,
// different silicon: WebGPU has no Tensor Cores, so v5 keeps their recipe
// (FP16 in, FP32 accumulate) on top of v4's register blocking, when the GPU
// exposes shader-f16; without it, v5 runs the same kernel in FP32 and says so.
// Every result is checked against the CPU before it's shown.

export const N = 1024

const naive = (rowExpr: string, colExpr: string) => /* wgsl */ `
@group(0) @binding(0) var<storage, read> A: array<f32>;
@group(0) @binding(1) var<storage, read> B: array<f32>;
@group(0) @binding(2) var<storage, read_write> C: array<f32>;
@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) g: vec3u) {
  let n = ${N}u;
  let row = ${rowExpr};
  let col = ${colExpr};
  var acc = 0.0;
  for (var k = 0u; k < n; k++) { acc += A[row * n + k] * B[k * n + col]; }
  C[row * n + col] = acc;
}`

// v1: neighbouring threads (x) walk down rows: strided reads and writes.
const V1 = naive('g.x', 'g.y')
// v2: neighbouring threads walk along a row: coalesced.
const V2 = naive('g.y', 'g.x')

// v3: a 16×16 tile of A and of B in workgroup memory, reused by every thread.
const V3 = /* wgsl */ `
@group(0) @binding(0) var<storage, read> A: array<f32>;
@group(0) @binding(1) var<storage, read> B: array<f32>;
@group(0) @binding(2) var<storage, read_write> C: array<f32>;
var<workgroup> As: array<f32, 256>;
var<workgroup> Bs: array<f32, 256>;
@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) g: vec3u, @builtin(local_invocation_id) l: vec3u) {
  let n = ${N}u;
  let row = g.y;
  let col = g.x;
  var acc = 0.0;
  for (var t = 0u; t < n; t += 16u) {
    As[l.y * 16u + l.x] = A[row * n + t + l.x];
    Bs[l.y * 16u + l.x] = B[(t + l.y) * n + col];
    workgroupBarrier();
    for (var k = 0u; k < 16u; k++) { acc += As[l.y * 16u + k] * Bs[k * 16u + l.x]; }
    workgroupBarrier();
  }
  C[row * n + col] = acc;
}`

// v4/v5: a 64×64 block per workgroup, a 4×4 micro-tile per thread in registers.
const blocked = (t: 'f32' | 'f16') => /* wgsl */ `
${t === 'f16' ? 'enable f16;' : ''}
@group(0) @binding(0) var<storage, read> A: array<${t}>;
@group(0) @binding(1) var<storage, read> B: array<${t}>;
@group(0) @binding(2) var<storage, read_write> C: array<f32>;
var<workgroup> As: array<${t}, 1024>;
var<workgroup> Bs: array<${t}, 1024>;
@compute @workgroup_size(16, 16)
fn main(@builtin(workgroup_id) w: vec3u, @builtin(local_invocation_id) l: vec3u, @builtin(local_invocation_index) li: u32) {
  let n = ${N}u;
  let row0 = w.y * 64u;
  let col0 = w.x * 64u;
  var acc: array<f32, 16>;
  for (var k0 = 0u; k0 < n; k0 += 16u) {
    for (var i = 0u; i < 4u; i++) {
      let e = li + i * 256u;
      As[(e % 16u) * 64u + e / 16u] = A[(row0 + e / 16u) * n + k0 + e % 16u];
      Bs[(e / 64u) * 64u + e % 64u] = B[(k0 + e / 64u) * n + col0 + e % 64u];
    }
    workgroupBarrier();
    for (var k = 0u; k < 16u; k++) {
      var a: array<f32, 4>;
      var b: array<f32, 4>;
      for (var i = 0u; i < 4u; i++) {
        a[i] = f32(As[k * 64u + l.y * 4u + i]);
        b[i] = f32(Bs[k * 64u + l.x * 4u + i]);
      }
      for (var i = 0u; i < 4u; i++) {
        for (var j = 0u; j < 4u; j++) { acc[i * 4u + j] += a[i] * b[j]; }
      }
    }
    workgroupBarrier();
  }
  for (var i = 0u; i < 4u; i++) {
    for (var j = 0u; j < 4u; j++) { C[(row0 + l.y * 4u + i) * n + col0 + l.x * 4u + j] = acc[i * 4u + j]; }
  }
}`

export interface Measure {
  id: string
  gflops: number
  ms: number
  ok: boolean
  /** The largest relative error over the checked entries. */
  err: number
  note?: string
}

export interface Gpu {
  device: GPUDevice
  f16: boolean
  name: string
}

let gpu: Promise<Gpu | string> | null = null
export function getGpu() {
  gpu ??= (async () => {
    if (!('gpu' in navigator)) return 'no-webgpu'
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' })
    if (!adapter) return 'no-adapter'
    const f16 = adapter.features.has('shader-f16')
    const device = await adapter.requestDevice({ requiredFeatures: f16 ? ['shader-f16'] : [] })
    const info = adapter.info
    const name = [info?.vendor, info?.architecture, info?.description].filter(Boolean).join(' · ') || 'GPU'
    return { device, f16, name }
  })()
  return gpu
}

function toHalf(x: number) {
  const f = new Float32Array([x])
  const i = new Uint32Array(f.buffer)[0]
  const s = (i >>> 16) & 0x8000
  const e = ((i >>> 23) & 0xff) - 127 + 15
  const m = i & 0x7fffff
  if (e <= 0) return s
  if (e >= 31) return s | 0x7c00
  return s | ((e << 10) + ((m + 0x1000) >>> 13))
}

/** Runs the five versions in order; `on` is told each result as it lands. */
export async function measureAll(on: (i: number, m: Measure | null) => void): Promise<Measure[] | string> {
  const g = await getGpu()
  if (typeof g === 'string') return g
  const { device, f16 } = g
  const n = N
  const a = new Float32Array(n * n).map(() => Math.random() * 2 - 1)
  const b = new Float32Array(n * n).map(() => Math.random() * 2 - 1)
  const buf = (data: ArrayBufferView, usage: number) => {
    const x = device.createBuffer({ size: data.byteLength, usage })
    device.queue.writeBuffer(x, 0, data)
    return x
  }
  const S = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
  const A = buf(a, S)
  const B = buf(b, S)
  const half = (x: Float32Array) => {
    const h = new Uint16Array(x.length)
    for (let i = 0; i < x.length; i++) h[i] = toHalf(x[i])
    return h
  }
  const A16 = f16 ? buf(half(a), S) : A
  const B16 = f16 ? buf(half(b), S) : B
  const C = device.createBuffer({ size: n * n * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC })
  const read = device.createBuffer({ size: n * n * 4, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST })

  // The entries checked against the CPU.
  const probes = Array.from({ length: 48 }, () => [Math.floor(Math.random() * n), Math.floor(Math.random() * n)])
  const want = probes.map(([r, c]) => {
    let s = 0
    for (let k = 0; k < n; k++) s += a[r * n + k] * b[k * n + c]
    return s
  })

  const kinds = [
    { id: 'v1', code: V1, groups: [n / 16, n / 16], half: false },
    { id: 'v2', code: V2, groups: [n / 16, n / 16], half: false },
    { id: 'v3', code: V3, groups: [n / 16, n / 16], half: false },
    { id: 'v4', code: blocked('f32'), groups: [n / 64, n / 64], half: false },
    { id: 'v5', code: blocked(f16 ? 'f16' : 'f32'), groups: [n / 64, n / 64], half: f16 },
  ]
  const out: Measure[] = []
  for (let i = 0; i < kinds.length; i++) {
    on(i, null)
    const k = kinds[i]
    const module = device.createShaderModule({ code: k.code })
    const pipeline = await device.createComputePipelineAsync({ layout: 'auto', compute: { module, entryPoint: 'main' } })
    const bind = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: k.half ? A16 : A } },
        { binding: 1, resource: { buffer: k.half ? B16 : B } },
        { binding: 2, resource: { buffer: C } },
      ],
    })
    const run = async (times: number) => {
      const enc = device.createCommandEncoder()
      for (let r = 0; r < times; r++) {
        const pass = enc.beginComputePass()
        pass.setPipeline(pipeline)
        pass.setBindGroup(0, bind)
        pass.dispatchWorkgroups(k.groups[0], k.groups[1])
        pass.end()
      }
      const t0 = performance.now()
      device.queue.submit([enc.finish()])
      await device.queue.onSubmittedWorkDone()
      return performance.now() - t0
    }
    const once = await run(1) // warm-up, and a size for the real run
    const times = Math.max(3, Math.min(40, Math.round(600 / Math.max(once, 1))))
    const ms = (await run(times)) / times

    const enc = device.createCommandEncoder()
    enc.copyBufferToBuffer(C, 0, read, 0, n * n * 4)
    device.queue.submit([enc.finish()])
    await read.mapAsync(GPUMapMode.READ)
    const c = new Float32Array(read.getMappedRange().slice(0))
    read.unmap()
    let err = 0
    probes.forEach(([r, col], j) => (err = Math.max(err, Math.abs(c[r * n + col] - want[j]) / Math.max(1, Math.abs(want[j])))))
    const m: Measure = { id: k.id, ms, gflops: (2 * n ** 3) / (ms * 1e6), err, ok: err < (k.half ? 3e-2 : 1e-3), note: k.id === 'v5' && !f16 ? 'fp32' : undefined }
    out.push(m)
    on(i, m)
  }
  ;[A, B, C, read].forEach((x) => x.destroy())
  if (f16) [A16, B16].forEach((x) => x.destroy())
  return out
}

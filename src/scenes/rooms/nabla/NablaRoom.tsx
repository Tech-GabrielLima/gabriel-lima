import { Billboard, Text } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { use, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, InstancedMesh, LineSegments, MathUtils, Object3D } from 'three'
import { sfx } from '../../../film/audio'
import { useFilm } from '../../../film/store'
import { FONT_MONO, FONT_SERIF } from '../../shared'
import { RoomCamera, v3, type Shot } from '../shared'
import { loadNet, type Grads, type Pass } from './net'
import { useNablaRoom } from './state'

// SALA · NABLA (ROTEIRO §0.3). Through the NABLA door: nabla's MLP for the
// 8×8 digits (./net.ts), laid out in the dark, four sheets of neurons from
// the input to the ten digits, and running in the browser. The visitor draws
// a digit on the pad; the forward pass lights the network layer by layer, the
// strongest contributions drawn as the connections that carried them, until
// the ten outputs settle on an answer. Tell it what the digit really was, and
// the loss goes back through the same connections in pink, the gradient of
// every weight on the way (reverse mode, as nabla does it), and the step it
// takes changes the answer.

const LAYERS = [
  { n: 64, pos: (i: number) => v3(-15, 1.6 + (7 - Math.floor(i / 8)) * 1, ((i % 8) - 3.5) * 1) },
  { n: 128, pos: (i: number) => v3(-5, 0.9 + (15 - Math.floor(i / 8)) * 0.62, ((i % 8) - 3.5) * 0.9) },
  { n: 64, pos: (i: number) => v3(5, 1.6 + (7 - Math.floor(i / 8)) * 1, ((i % 8) - 3.5) * 1) },
  { n: 10, pos: (i: number) => v3(14, 1.2 + (9 - i) * 0.9, 0) },
]
const POS = LAYERS.map((L) => Array.from({ length: L.n }, (_, i) => L.pos(i)))
const OFFSET = [0, 64, 192, 256]
const NEURONS = 266
/** Connections drawn per pair of layers: the strongest few of thousands. */
const K = 200
const STEP = 0.38
const PINK = new Color('#ff4f9a')
const WARM = new Color('#ffd9a0')
const COLD = new Color('#6bb8ff')

const SHOTS: Shot[] = [
  [v3(6, 9, 34), v3(3.5, 5.5, 0)],
  [v3(-24, 6, 12), v3(-12, 5, 0)],
  [v3(0, 36, 8), v3(0, 0, 0)],
  [v3(24, 7, 12), v3(14, 5.5, 0)],
]

type Edge = { l: number; i: number; j: number; v: number }

/** The K strongest edges of each layer pair: forward, activation × weight; backward, the weight's gradient. */
function strongest(net: { sizes: number[]; W: Float32Array[] }, p: Pass, g: Grads | null): Edge[] {
  const out: Edge[] = []
  for (let l = 0; l < 3; l++) {
    const n = net.sizes[l]
    const m = net.sizes[l + 1]
    const W = net.W[l]
    const cand: Edge[] = []
    for (let i = 0; i < n; i++) {
      const a = p.a[l][i]
      if (a === 0) continue
      for (let j = 0; j < m; j++) {
        const v = g ? a * g.da[l + 1][j] : a * W[i * m + j]
        if (v !== 0) cand.push({ l, i, j, v })
      }
    }
    cand.sort((x, y) => Math.abs(y.v) - Math.abs(x.v))
    out.push(...cand.slice(0, K))
  }
  return out
}

export default function NablaRoom() {
  const net = use(loadNet())
  const lang = useFilm((s) => s.lang)
  const pt = lang === 'pt'
  const neurons = useRef<InstancedMesh>(null!)
  const bars = useRef<InstancedMesh>(null!)
  const o = useMemo(() => new Object3D(), [])
  const c = useMemo(() => new Color(), [])
  const [pred, setPred] = useState<{ digit: number; p: number } | null>(null)

  const lines = useMemo(() => {
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array(K * 3 * 2 * 3), 3))
    g.setAttribute('color', new BufferAttribute(new Float32Array(K * 3 * 2 * 3), 3))
    g.setDrawRange(0, 0)
    return g
  }, [])
  const lineMat = useRef<LineSegments>(null!)

  const st = useRef({
    rev: -1,
    teach: 0,
    pass: null as Pass | null,
    grads: null as Grads | null,
    edges: [] as Edge[],
    fwdAt: -99,
    bwdAt: -99,
    max: [1, 1, 1, 1] as number[],
    gmax: [1, 1, 1, 1] as number[],
  })

  useLayoutEffect(() => {
    useNablaRoom.setState({ samples: net.samples, acc: net.acc, test: net.test })
    // The room opens on a real digit from the test set.
    const first = net.samples[3]
    useNablaRoom.setState((s) => ({ x: first.x.slice(), rev: s.rev + 1 }))
  }, [net])

  const layEdges = (edges: Edge[], back: boolean) => {
    const pos = lines.getAttribute('position') as BufferAttribute
    edges.forEach((e, k) => {
      const a = POS[e.l][e.i]
      const b = POS[e.l + 1][e.j]
      pos.setXYZ(k * 2, a.x, a.y, a.z)
      pos.setXYZ(k * 2 + 1, b.x, b.y, b.z)
    })
    pos.needsUpdate = true
    lines.setDrawRange(0, edges.length * 2)
    void back
  }

  useFrame(() => {
    const now = performance.now() / 1000
    const s = st.current
    const room = useNablaRoom.getState()

    // The pad changed: a forward pass.
    if (room.rev !== s.rev) {
      s.rev = room.rev
      s.pass = net.forward(room.x)
      s.grads = null
      s.edges = strongest(net, s.pass, null)
      layEdges(s.edges, false)
      s.max = s.pass.a.map((a) => Math.max(1e-6, ...Array.from(a, Math.abs)))
      s.fwdAt = now
      const probs = Array.from(s.pass.probs)
      const digit = probs.indexOf(Math.max(...probs))
      setPred({ digit, p: probs[digit] })
      useNablaRoom.setState({ pred: { digit, p: probs[digit], probs } })
    }
    // The visitor tells it the answer: the loss goes back, and the SGD step is taken.
    if (room.teach.n !== s.teach && s.pass) {
      s.teach = room.teach.n
      const before = s.pass
      s.grads = net.backward(before, room.teach.label, 0.012)
      s.edges = strongest(net, before, s.grads)
      layEdges(s.edges, true)
      s.gmax = s.grads.da.map((a) => Math.max(1e-9, ...Array.from(a, Math.abs)))
      s.bwdAt = now
      sfx('click', undefined, 0.5)
      // After the wave has gone back, the new weights answer again.
      const loss = s.grads.loss
      setTimeout(() => {
        const p = net.forward(useNablaRoom.getState().x)
        s.pass = p
        const probs = Array.from(p.probs)
        const digit = probs.indexOf(Math.max(...probs))
        setPred({ digit, p: probs[digit] })
        const after = -Math.log(Math.max(1e-9, probs[room.teach.label]))
        useNablaRoom.setState({
          pred: { digit, p: probs[digit], probs },
          loss: after,
          note: pt ? `perda ${loss.toFixed(3)} → ${after.toFixed(3)} depois de um passo de SGD; agora diz ${digit} (${Math.round(probs[digit] * 100)}%)` : `loss ${loss.toFixed(3)} → ${after.toFixed(3)} after one SGD step; now it says ${digit} (${Math.round(probs[digit] * 100)}%)`,
        })
        s.fwdAt = performance.now() / 1000
        s.grads = null
        s.edges = strongest(net, p, null)
        layEdges(s.edges, false)
        s.max = p.a.map((a) => Math.max(1e-6, ...Array.from(a, Math.abs)))
      }, STEP * 4 * 1000 + 250)
    }

    const p = s.pass
    const f = (now - s.fwdAt) / STEP
    const b = (now - s.bwdAt) / STEP
    const backward = !!s.grads && b < 5
    // Neurons: lit by their activation as the forward wave reaches their layer; pink with their gradient on the way back.
    for (let l = 0; l < 4; l++) {
      const reach = MathUtils.smoothstep(f - l, 0, 1)
      const breach = backward ? MathUtils.smoothstep(b - (3 - l), 0, 1) * Math.max(0, 1 - (b - (3 - l)) / 2.5) : 0
      for (let i = 0; i < LAYERS[l].n; i++) {
        const k = OFFSET[l] + i
        const act = p ? Math.abs(p.a[l][i]) / s.max[l] : 0
        const gr = s.grads ? Math.abs(s.grads.da[l][i]) / s.gmax[l] : 0
        const pp = POS[l][i]
        o.position.copy(pp)
        o.scale.setScalar((l === 1 ? 0.2 : 0.26) * (1 + act * reach * 0.6 + gr * breach))
        o.updateMatrix()
        neurons.current.setMatrixAt(k, o.matrix)
        c.set('#15161c').lerp(WARM, act * reach).multiplyScalar(1 + act * reach * 1.8)
        if (breach > 0) c.lerp(PINK, Math.min(1, gr * breach * 1.5)).multiplyScalar(1 + gr * breach * 1.5)
        neurons.current.setColorAt(k, c)
      }
    }
    neurons.current.instanceMatrix.needsUpdate = true
    neurons.current.instanceColor!.needsUpdate = true

    // Connections: each pair lights as the wave crosses it, then stays faintly on.
    const col = lines.getAttribute('color') as BufferAttribute
    const emax = [0, 0, 0]
    for (const e of s.edges) emax[e.l] = Math.max(emax[e.l], Math.abs(e.v))
    s.edges.forEach((e, k) => {
      const w = Math.abs(e.v) / (emax[e.l] || 1)
      let on: number
      let tone: Color
      if (backward) {
        const x = b - (2 - e.l)
        on = MathUtils.smoothstep(x, 0, 1) * (x < 2 ? 1 : Math.max(0.25, 1 - (x - 2) / 2))
        tone = PINK
      } else {
        const x = f - e.l
        on = MathUtils.smoothstep(x, 0, 1) * (x < 1.4 ? 1 : 0.35)
        tone = e.v > 0 ? WARM : COLD
      }
      c.copy(tone).multiplyScalar(on * (0.15 + w * 1.3))
      col.setXYZ(k * 2, c.r, c.g, c.b)
      col.setXYZ(k * 2 + 1, c.r, c.g, c.b)
    })
    col.needsUpdate = true

    // The ten answers: a bar each, growing with its probability once the wave arrives.
    const probs = useNablaRoom.getState().pred?.probs
    for (let i = 0; i < 10; i++) {
      const pr = probs ? probs[i] * MathUtils.smoothstep(f - 3, 0, 1) : 0
      const pp = POS[3][i]
      o.position.set(pp.x + 0.8 + pr * 2, pp.y, pp.z)
      o.scale.set(Math.max(0.001, pr * 4), 0.5, 0.5)
      o.updateMatrix()
      bars.current.setMatrixAt(i, o.matrix)
      bars.current.setColorAt(i, c.copy(pred?.digit === i ? WARM : COLD).multiplyScalar(pred?.digit === i ? 1.8 : 0.7))
    }
    bars.current.instanceMatrix.needsUpdate = true
    bars.current.instanceColor!.needsUpdate = true
  })

  const names = pt ? ['entrada 8×8', 'oculta · 128', 'oculta · 64', 'saída · 10'] : ['input 8×8', 'hidden · 128', 'hidden · 64', 'output · 10']

  return (
    <>
      <color attach="background" args={['#040408']} />
      <fog attach="fog" args={['#040408', 40, 110]} />
      <RoomCamera shots={SHOTS} fov={46} minDistance={4} maxDistance={90} portrait={2.3} />
      <gridHelper args={[80, 40, '#1c1a26', '#101018']} position={[0, -2.2, 0]} />

      <instancedMesh ref={neurons} args={[undefined, undefined, NEURONS]} frustumCulled={false}>
        <sphereGeometry args={[1, 14, 10]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <lineSegments ref={lineMat} geometry={lines} frustumCulled={false}>
        <lineBasicMaterial vertexColors toneMapped={false} transparent blending={AdditiveBlending} depthWrite={false} />
      </lineSegments>
      <instancedMesh ref={bars} args={[undefined, undefined, 10]} frustumCulled={false}>
        <boxGeometry />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>

      {POS[3].map((p, i) => (
        <Text key={i} font={FONT_MONO} fontSize={0.5} position={[p.x - 0.8, p.y, p.z]} anchorX="right" anchorY="middle" color="#b8b0c8">
          {String(i)}
        </Text>
      ))}
      {LAYERS.map((_, l) => (
        <Billboard key={l} position={[POS[l][0].x, l === 1 ? 11.6 : 10.4, 0]}>
          <Text font={FONT_MONO} fontSize={0.42} letterSpacing={0.18} anchorX="center" color="#8a86a0">
            {names[l].toUpperCase()}
          </Text>
        </Billboard>
      ))}
      {pred && (
        <Billboard position={[20.5, 5.8, 0]}>
          <Text font={FONT_SERIF} fontSize={5} anchorX="center" anchorY="middle">
            {String(pred.digit)}
            <meshBasicMaterial color={new Color('#ffd9a0').multiplyScalar(1.6)} toneMapped={false} />
          </Text>
          <Text font={FONT_MONO} fontSize={0.45} letterSpacing={0.15} anchorX="center" anchorY="top" position={[0, -2.8, 0]}>
            {`${Math.round(pred.p * 100)}% ${pt ? 'de certeza' : 'sure'}`}
            <meshBasicMaterial color="#b8b0c8" toneMapped={false} />
          </Text>
        </Billboard>
      )}

      {/* What the repository states, as plaques in the dark. */}
      <Billboard position={[20.5, 1.6, 0]}>
        <Text font={FONT_SERIF} fontSize={0.9} anchorX="center">
          {'∇ nabla'}
          <meshBasicMaterial color={new Color('#ff4f9a').multiplyScalar(1.4)} toneMapped={false} />
        </Text>
        <Text font={FONT_MONO} fontSize={0.24} anchorX="center" anchorY="top" position={[0, -0.6, 0]} textAlign="center" maxWidth={11}>
          {pt
            ? `autograd reverso escrito do zero · 21/21 operações passam no gradient check · ∇ ≈ 1e-7 vs PyTorch\nesta rede: MLP 64→128→64→10, ${(net.acc * 100).toFixed(1).replace('.', ',')}% em ${net.test} dígitos de teste (o README cita 98,6%)`
            : `reverse-mode autograd written from scratch · 21/21 ops pass the gradient check · ∇ ≈ 1e-7 vs PyTorch\nthis network: MLP 64→128→64→10, ${(net.acc * 100).toFixed(1)}% on ${net.test} test digits (the README states 98.6%)`}
          <meshBasicMaterial color="#9a96b0" toneMapped={false} />
        </Text>
      </Billboard>
      <Billboard position={[20.5, -1.4, 0]}>
        <Text font={FONT_MONO} fontSize={0.22} anchorX="center" textAlign="center" maxWidth={11}>
          {pt ? 'nano-llm · GPT-2 124M · KV-cache: 10,0 → 39,1 tok/s (3,9×) · INT8: 498 → 243 MB' : 'nano-llm · GPT-2 124M · KV-cache: 10.0 → 39.1 tok/s (3.9×) · INT8: 498 → 243 MB'}
          <meshBasicMaterial color="#6f6b85" toneMapped={false} />
        </Text>
      </Billboard>
    </>
  )
}


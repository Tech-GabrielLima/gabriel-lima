import { useCallback, useMemo, useRef, useState } from 'react'
import { findFrame } from '../cinema/progress'
import { usherSays } from '../cinema/usher'
import type { Lang } from '../film/store'
import { RaftCore, type Msg } from '../scenes/rooms/raft/tabraft'
import { L, useLoop, useOnScreen } from './common'
import './machine.css'

// The Chaos Panel (ROTEIRO §0.4.6, frame 42): five nodes of the same Raft
// core the raft room's tabs run (scenes/rooms/raft/tabraft.ts), on a network
// this panel owns. Latency, packet loss and a partition are real to the
// algorithm: messages are delayed, dropped, or never cross. A client keeps
// proposing entries. Split the cluster 3 | 2 and watch the majority carry on
// committing while the minority can't: that's the quorum.

const IDS = ['A', 'B', 'C', 'D', 'E']
const MAJORITY = new Set(['A', 'B', 'C'])

interface Net {
  nodes: Map<string, RaftCore>
  q: { at: number; m: Msg }[]
  latency: number
  loss: number
  split: boolean
  down: Set<string>
  sent: number
  dropped: number
  /** The majority's commit index when the split began, and whether the frame fired. */
  splitAt: number | null
  shown: boolean
}

function makeNet(): Net {
  const net: Net = { nodes: new Map(), q: [], latency: 30, loss: 0, split: false, down: new Set(), sent: 0, dropped: 0, splitAt: null, shown: false }
  const now = performance.now()
  for (const id of IDS) {
    const n = new RaftCore(id, (m) => {
      net.sent++
      // The network decides: dead nodes, the partition, and lost packets.
      const crosses = net.split && MAJORITY.has(m.from) !== MAJORITY.has(m.to)
      if (net.down.has(m.to) || crosses || Math.random() < net.loss) {
        net.dropped++
        return
      }
      net.q.push({ at: performance.now() + net.latency * (0.6 + Math.random() * 0.8), m })
    })
    n.setPeers(IDS, now)
    n.restart(now)
    net.nodes.set(id, n)
  }
  return net
}

const RING = IDS.map((_, i) => {
  const a = -Math.PI / 2 + (i * 2 * Math.PI) / IDS.length
  return { x: 300 + Math.cos(a) * 118, y: 150 + Math.sin(a) * 110 }
})

export function Chaos({ lang }: { lang: Lang }) {
  const net = useMemo(makeNet, [])
  const box = useRef<HTMLDivElement>(null)
  const on = useOnScreen(box)
  const [, setV] = useState(0)
  const seq = useRef(0)

  const beat = useCallback(() => {
    const now = performance.now()
    // deliver what's due
    const due = net.q.filter((x) => x.at <= now)
    net.q = net.q.filter((x) => x.at > now)
    for (const { m } of due) if (!net.down.has(m.to)) net.nodes.get(m.to)!.receive(m, now)
    for (const [id, n] of net.nodes) if (!net.down.has(id)) n.tick(now)
    // a client, asking every ~400 ms, on whichever live node it reaches
    if (++seq.current % 8 === 0) {
      const live = IDS.filter((i) => !net.down.has(i))
      if (live.length) net.nodes.get(live[Math.floor(Math.random() * live.length)])!.propose(`set k${seq.current} ${seq.current}`, now)
    }
    // the frame: split, and the majority committed on while the minority couldn't
    if (net.split && net.splitAt !== null && !net.shown) {
      const maj = Math.max(...[...MAJORITY].map((i) => net.nodes.get(i)!.commit))
      if (maj >= net.splitAt + 3) {
        net.shown = true
        findFrame('chaos')
        usherSays(L(lang, 'Three against two. The three win: that’s what a quorum is.', 'Três contra dois. Os três vencem: isso é quórum.'), true)
      }
    }
    setV((v) => v + 1)
  }, [net, lang])
  useLoop(on, 50, beat)

  const toggleSplit = () => {
    net.split = !net.split
    net.splitAt = net.split ? Math.max(...[...MAJORITY].map((i) => net.nodes.get(i)!.commit)) : null
    net.shown = false
  }
  const toggleNode = (id: string) => {
    if (net.down.has(id)) {
      net.down.delete(id)
      net.nodes.get(id)!.restart(performance.now())
    } else net.down.add(id)
  }

  const nodes = IDS.map((id) => ({ id, n: net.nodes.get(id)! }))
  const maj = Math.max(...[...MAJORITY].map((i) => net.nodes.get(i)!.commit))
  const min = Math.max(net.nodes.get('D')!.commit, net.nodes.get('E')!.commit)
  return (
    <div className="panel chaos" ref={box}>
      <svg className="ch-room" viewBox="0 0 600 300" role="img" aria-label={L(lang, 'A five-node Raft cluster', 'Um cluster Raft de cinco nós')}>
        {net.split && <line className="ch-cut" x1={410} y1={10} x2={250} y2={290} />}
        {nodes.map(({ id }, i) =>
          nodes.slice(i + 1).map(({ id: o }, j) => {
            const a = RING[i]
            const b = RING[i + 1 + j]
            const cut = net.split && MAJORITY.has(id) !== MAJORITY.has(o)
            return <line key={id + o} className={`ch-link${cut ? ' cut' : ''}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
          }),
        )}
        {nodes.map(({ id, n }, i) => {
          const p = RING[i]
          const dead = net.down.has(id)
          return (
            <g key={id} className={`ch-node ${dead ? 'dead' : n.role}`} onClick={() => toggleNode(id)} role="button" tabIndex={0} aria-label={`${id}: ${dead ? 'down' : n.role}`}>
              <circle cx={p.x} cy={p.y} r={30} />
              <text x={p.x} y={p.y - 2} className="ch-id">
                {id}
              </text>
              <text x={p.x} y={p.y + 14} className="ch-meta">
                {dead ? L(lang, 'down', 'caído') : `t${n.term} · c${n.commit}`}
              </text>
            </g>
          )
        })}
      </svg>
      <div className="panel-side">
        <p className="panel-lead">{L(lang, 'Break the network. See what survives.', 'Quebre a rede. Veja o que sobrevive.')}</p>
        <label className="ch-ctl">
          {L(lang, 'latency', 'latência')} <b>{net.latency} ms</b>
          <input type="range" min={5} max={600} value={net.latency} onChange={(e) => (net.latency = Number(e.target.value))} />
        </label>
        <label className="ch-ctl">
          {L(lang, 'packet loss', 'perda de pacotes')} <b>{Math.round(net.loss * 100)}%</b>
          <input type="range" min={0} max={60} value={Math.round(net.loss * 100)} onChange={(e) => (net.loss = Number(e.target.value) / 100)} />
        </label>
        <button className={`ch-split${net.split ? ' on' : ''}`} onClick={toggleSplit}>
          {net.split ? L(lang, 'Heal the partition', 'Curar a partição') : L(lang, 'Partition: A B C | D E', 'Partição: A B C | D E')}
        </button>
        <dl className="mini-stats">
          <div>
            <dt>{L(lang, 'majority commit', 'commit da maioria')}</dt>
            <dd>{maj}</dd>
          </div>
          <div>
            <dt>{L(lang, 'minority commit', 'commit da minoria')}</dt>
            <dd>{min}</dd>
          </div>
          <div>
            <dt>{L(lang, 'messages', 'mensagens')}</dt>
            <dd>{net.sent.toLocaleString()}</dd>
          </div>
          <div>
            <dt>{L(lang, 'dropped', 'perdidas')}</dt>
            <dd>{net.dropped.toLocaleString()}</dd>
          </div>
        </dl>
        <p className="panel-note dim">
          {L(
            lang,
            'The same Raft core as the raft room’s tabs, five nodes in this page, on a network this panel controls. Click a node to crash it.',
            'O mesmo núcleo Raft das abas da sala raft, cinco nós nesta página, numa rede que este painel controla. Clique num nó para derrubá-lo.',
          )}
        </p>
      </div>
    </div>
  )
}

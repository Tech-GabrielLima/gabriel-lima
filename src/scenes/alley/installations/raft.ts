// A small, honest Raft leader-election simulation (Ongaro & Ousterhout §5.2) for
// the RAFT door: randomized election timeouts, RequestVote with one vote per
// term, heartbeats from the leader, and nodes the visitor can crash/restart.
// Log replication is out of scope — this shows the part you can see with lights.

export type Role = 'follower' | 'candidate' | 'leader' | 'down'

export interface Node {
  id: number
  role: Role
  term: number
  votedFor: number | null
  votes: Set<number>
  /** Seconds until this node gives up on the leader and runs for election. */
  timeout: number
  /** Leader only: seconds until the next heartbeat. */
  beat: number
}

/** A message in flight, drawn as a pulse of light travelling between lanterns. */
export interface Msg {
  from: number
  to: number
  kind: 'heartbeat' | 'vote?' | 'vote!'
  term: number
  /** 0..1 progress along the wire. */
  t: number
  granted?: boolean
}

const HEARTBEAT = 0.55
const LATENCY = 0.35 // seconds per hop, slow enough to watch
const timeout = () => 1.4 + Math.random() * 1.6

export class Cluster {
  nodes: Node[]
  msgs: Msg[] = []
  /** Bumped whenever something visible changes (for React re-renders of labels). */
  version = 0

  constructor(n = 5) {
    this.nodes = Array.from({ length: n }, (_, id) => ({
      id,
      role: 'follower' as Role,
      term: 0,
      votedFor: null,
      votes: new Set<number>(),
      timeout: timeout() * (0.5 + id * 0.15),
      beat: 0,
    }))
  }

  get leader() {
    return this.nodes.find((n) => n.role === 'leader') ?? null
  }

  /** Crash a node, or bring a crashed one back as a follower. */
  toggle(id: number) {
    const n = this.nodes[id]
    if (n.role === 'down') Object.assign(n, { role: 'follower', timeout: timeout(), votes: new Set() })
    else n.role = 'down'
    this.msgs = this.msgs.filter((m) => m.to !== id && m.from !== id)
    this.version++
  }

  private send(from: number, kind: Msg['kind'], term: number, to?: number, granted?: boolean) {
    for (const n of this.nodes) {
      if (n.id === from || (to !== undefined && n.id !== to)) continue
      this.msgs.push({ from, to: n.id, kind, term, t: 0, granted })
    }
  }

  private stepDown(n: Node, term: number) {
    if (term > n.term) {
      n.term = term
      n.votedFor = null
    }
    if (n.role !== 'follower') this.version++
    n.role = 'follower'
    n.timeout = timeout()
  }

  private deliver(m: Msg) {
    const n = this.nodes[m.to]
    if (n.role === 'down') return
    if (m.term > n.term) this.stepDown(n, m.term)
    if (m.kind === 'heartbeat' && m.term >= n.term) {
      if (n.role !== 'follower') this.stepDown(n, m.term)
      n.timeout = timeout()
    } else if (m.kind === 'vote?') {
      const grant = m.term >= n.term && (n.votedFor === null || n.votedFor === m.from)
      if (grant) {
        n.votedFor = m.from
        n.timeout = timeout()
      }
      this.send(n.id, 'vote!', n.term, m.from, grant)
    } else if (m.kind === 'vote!' && n.role === 'candidate' && m.term === n.term && m.granted) {
      n.votes.add(m.from)
      if (n.votes.size > this.nodes.length / 2) {
        n.role = 'leader'
        n.beat = 0
        this.version++
      }
    }
  }

  step(dt: number) {
    for (const m of this.msgs) m.t += dt / LATENCY
    const arrived = this.msgs.filter((m) => m.t >= 1)
    this.msgs = this.msgs.filter((m) => m.t < 1)
    for (const m of arrived) this.deliver(m)

    for (const n of this.nodes) {
      if (n.role === 'down') continue
      if (n.role === 'leader') {
        n.beat -= dt
        if (n.beat <= 0) {
          n.beat = HEARTBEAT
          this.send(n.id, 'heartbeat', n.term)
        }
        continue
      }
      n.timeout -= dt
      if (n.timeout <= 0) {
        // Election timeout: become a candidate for the next term and vote for yourself.
        n.role = 'candidate'
        n.term++
        n.votedFor = n.id
        n.votes = new Set([n.id])
        n.timeout = timeout()
        this.send(n.id, 'vote?', n.term)
        this.version++
      }
    }
  }
}

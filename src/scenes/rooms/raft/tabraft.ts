// A small Raft (Ongaro & Ousterhout, "In Search of an Understandable Consensus
// Algorithm", 2014), for the RAFT room's secret: the visitor's own browser tabs
// are the cluster. Only the core is here: no timers, no transport, no DOM. The
// worker (./tabs.worker.ts) feeds it the clock and the messages, and carries
// what it sends over a BroadcastChannel.
//
// What it does, as in the paper: terms; randomized election timeouts; one vote
// per term, only for a candidate whose log is at least as up to date
// (§5.4.1); AppendEntries with the consistency check on the previous entry,
// conflicting suffixes truncated (§5.3); a leader commits only entries of its
// own term by counting replicas (§5.4.2), and appends one on election so the
// older ones commit with it; any message with a newer term turns a node back
// into a follower.
//
// What it simplifies, and says so: the configuration is "the tabs that are
// alive" (the worker drops a tab when its Web Lock is released, i.e. the tab is
// gone), not joint consensus (§6); and "stable storage" is the worker's memory,
// which a crash button keeps but closing the tab doesn't (a reopened tab is a
// new node).

export type NodeId = string
export type Role = 'follower' | 'candidate' | 'leader'

export interface Entry {
  term: number
  cmd: string
}

export type Msg =
  | { t: 'vote'; term: number; from: NodeId; to: NodeId; lastIndex: number; lastTerm: number }
  | { t: 'voted'; term: number; from: NodeId; to: NodeId; granted: boolean }
  | { t: 'append'; term: number; from: NodeId; to: NodeId; prevIndex: number; prevTerm: number; entries: Entry[]; commit: number }
  | { t: 'appended'; term: number; from: NodeId; to: NodeId; ok: boolean; match: number }
  /** A client request sent on to the leader (only the leader appends). */
  | { t: 'propose'; term: number; from: NodeId; to: NodeId; cmd: string }

/** Heartbeat period, and the election timeout's range. The timeout is re-drawn every time it's reset. */
export const HEARTBEAT_MS = 150
export const ELECTION_MS: [number, number] = [900, 1800]
/** At most this many entries in one AppendEntries. */
const BATCH = 16

export class RaftCore {
  // Persistent state (Figure 2).
  term = 0
  votedFor: NodeId | null = null
  /** 1-based in the paper: log[i - 1] is entry i. */
  log: Entry[] = []
  // Volatile state.
  commit = 0
  role: Role = 'follower'
  leader: NodeId | null = null
  /** The other members of the configuration (never includes this node). */
  peers = new Set<NodeId>()
  private votes = new Set<NodeId>()
  private next = new Map<NodeId, number>()
  private match = new Map<NodeId, number>()
  private sentAt = new Map<NodeId, number>()
  private deadline = 0

  readonly id: NodeId
  private send: (m: Msg) => void
  private rand: () => number

  constructor(id: NodeId, send: (m: Msg) => void, rand: () => number = Math.random) {
    this.id = id
    this.send = send
    this.rand = rand
  }

  get lastIndex() {
    return this.log.length
  }
  get lastTerm() {
    return this.log.length ? this.log[this.log.length - 1].term : 0
  }
  private termAt(i: number) {
    return i <= 0 ? 0 : (this.log[i - 1]?.term ?? -1)
  }
  /** A majority of the whole configuration, this node included. */
  private get quorum() {
    return Math.floor((this.peers.size + 1) / 2) + 1
  }

  private resetTimer(now: number) {
    const [a, b] = ELECTION_MS
    this.deadline = now + a + this.rand() * (b - a)
  }

  /** Back to a (fresh) follower, e.g. after a crash: the persistent state stays. */
  restart(now: number) {
    this.role = 'follower'
    this.leader = null
    this.commit = 0
    this.votes.clear()
    this.resetTimer(now)
  }

  private stepDown(term: number, now: number) {
    if (term > this.term) {
      this.term = term
      this.votedFor = null
    }
    if (this.role !== 'follower') this.role = 'follower'
    this.resetTimer(now)
  }

  setPeers(ids: Iterable<NodeId>, now: number) {
    const next = new Set([...ids].filter((p) => p !== this.id))
    for (const p of this.peers) if (!next.has(p)) (this.next.delete(p), this.match.delete(p), this.sentAt.delete(p), this.votes.delete(p))
    for (const p of next) if (!this.peers.has(p) && this.role === 'leader') (this.next.set(p, this.lastIndex + 1), this.match.set(p, 0))
    this.peers = next
    if (this.leader && this.leader !== this.id && !next.has(this.leader)) this.leader = null
    // A smaller configuration can make a quorum out of what's already there.
    if (this.role === 'candidate' && this.votes.size >= this.quorum) this.becomeLeader(now)
    if (this.role === 'leader') this.advanceCommit()
  }

  tick(now: number) {
    if (this.role === 'leader') {
      for (const p of this.peers) if (now - (this.sentAt.get(p) ?? -1e9) >= HEARTBEAT_MS) this.replicate(p, now)
      return
    }
    if (this.deadline === 0) this.resetTimer(now)
    if (now >= this.deadline) this.campaign(now)
  }

  private campaign(now: number) {
    this.term++
    this.role = 'candidate'
    this.votedFor = this.id
    this.leader = null
    this.votes = new Set([this.id])
    this.resetTimer(now)
    if (this.votes.size >= this.quorum) return this.becomeLeader(now)
    for (const p of this.peers) this.send({ t: 'vote', term: this.term, from: this.id, to: p, lastIndex: this.lastIndex, lastTerm: this.lastTerm })
  }

  private becomeLeader(now: number) {
    this.role = 'leader'
    this.leader = this.id
    for (const p of this.peers) (this.next.set(p, this.lastIndex + 1), this.match.set(p, 0), this.sentAt.delete(p))
    // An entry of its own term: committing it commits everything before it (§5.4.2, §8).
    this.log.push({ term: this.term, cmd: `leader ${this.id}` })
    this.advanceCommit()
    for (const p of this.peers) this.replicate(p, now)
  }

  private replicate(p: NodeId, now: number) {
    const next = this.next.get(p) ?? this.lastIndex + 1
    const prevIndex = next - 1
    this.sentAt.set(p, now)
    this.send({ t: 'append', term: this.term, from: this.id, to: p, prevIndex, prevTerm: this.termAt(prevIndex), entries: this.log.slice(prevIndex, prevIndex + BATCH), commit: this.commit })
  }

  private advanceCommit() {
    for (let n = this.lastIndex; n > this.commit; n--) {
      if (this.log[n - 1].term !== this.term) break
      let count = 1
      for (const p of this.peers) if ((this.match.get(p) ?? 0) >= n) count++
      if (count >= this.quorum) {
        this.commit = n
        break
      }
    }
  }

  /** A client's command. Returns false when there's no leader to take it. */
  propose(cmd: string, now: number): boolean {
    if (this.role === 'leader') {
      this.log.push({ term: this.term, cmd })
      this.advanceCommit()
      for (const p of this.peers) this.replicate(p, now)
      return true
    }
    if (!this.leader) return false
    this.send({ t: 'propose', term: this.term, from: this.id, to: this.leader, cmd })
    return true
  }

  receive(m: Msg, now: number) {
    if (m.to !== this.id) return
    // Only members count: a message from a tab already dropped from the configuration is ignored.
    if (!this.peers.has(m.from)) return
    if (m.term > this.term) this.stepDown(m.term, now)

    switch (m.t) {
      case 'vote': {
        const upToDate = m.lastTerm > this.lastTerm || (m.lastTerm === this.lastTerm && m.lastIndex >= this.lastIndex)
        const granted = m.term === this.term && (this.votedFor === null || this.votedFor === m.from) && upToDate
        if (granted) {
          this.votedFor = m.from
          this.resetTimer(now)
        }
        this.send({ t: 'voted', term: this.term, from: this.id, to: m.from, granted })
        break
      }
      case 'voted':
        if (this.role === 'candidate' && m.term === this.term && m.granted) {
          this.votes.add(m.from)
          if (this.votes.size >= this.quorum) this.becomeLeader(now)
        }
        break
      case 'append': {
        if (m.term < this.term) {
          this.send({ t: 'appended', term: this.term, from: this.id, to: m.from, ok: false, match: 0 })
          break
        }
        // A current leader: whatever this node was, it follows now.
        if (this.role !== 'follower') this.role = 'follower'
        this.leader = m.from
        this.resetTimer(now)
        if (m.prevIndex > this.lastIndex || this.termAt(m.prevIndex) !== m.prevTerm) {
          // Tell the leader where to look (a hint, so it needn't back off one entry at a time).
          this.send({ t: 'appended', term: this.term, from: this.id, to: m.from, ok: false, match: Math.min(m.prevIndex - 1, this.lastIndex) })
          break
        }
        m.entries.forEach((e, k) => {
          const i = m.prevIndex + 1 + k
          if (i <= this.lastIndex && this.termAt(i) !== e.term) this.log.length = i - 1
          if (i > this.lastIndex) this.log.push(e)
        })
        const last = m.prevIndex + m.entries.length
        if (m.commit > this.commit) this.commit = Math.min(m.commit, last)
        this.send({ t: 'appended', term: this.term, from: this.id, to: m.from, ok: true, match: last })
        break
      }
      case 'appended':
        if (this.role !== 'leader' || m.term !== this.term) break
        if (m.ok) {
          this.match.set(m.from, Math.max(this.match.get(m.from) ?? 0, m.match))
          this.next.set(m.from, m.match + 1)
          this.advanceCommit()
          // More to send: don't wait for the next heartbeat.
          if (m.match < this.lastIndex) this.replicate(m.from, now)
        } else {
          this.next.set(m.from, Math.max(1, Math.min((this.next.get(m.from) ?? 1) - 1, m.match + 1)))
          this.replicate(m.from, now)
        }
        break
      case 'propose':
        if (this.role === 'leader') this.propose(m.cmd, now)
        break
    }
  }
}

/** What a tab's worker tells its page, a few times a second. */
export interface TabNodeView {
  id: NodeId
  role: Role | 'down'
  term: number
  commit: number
  last: number
  leader: NodeId | null
}
export interface TabSnapshot {
  self: TabNodeView
  /** Every member this node knows of, itself included, as they last said. */
  nodes: TabNodeView[]
  /** The last committed commands, newest last. */
  log: { index: number; term: number; cmd: string }[]
  locks: boolean
}
export type Out = { t: 'state'; s: TabSnapshot }

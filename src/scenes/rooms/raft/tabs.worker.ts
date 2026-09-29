import { RaftCore, type Msg, type NodeId, type Out, type TabNodeView } from './tabraft'

// One tab's Raft node (./tabraft.ts), in a Web Worker: a hidden tab throttles
// its page's timers to once a second (and to once a minute after a while),
// which would make a hidden leader miss its heartbeats; a worker keeps its own
// clock. The tabs of the same site find each other over a BroadcastChannel,
// and every Raft message rides on it with a `to`.
//
// Who's in the cluster: each node holds a Web Lock named after itself for as
// long as it lives, and every other node queues up for that lock. The browser
// hands it over only when the holder is gone (tab closed, crashed, killed), so
// that's the moment it leaves the configuration: a failure detector that never
// guesses. A tab that goes silent for too long is dropped as well (a frozen
// tab, or a browser without Web Locks).

type In = { t: 'start'; id: NodeId } | { t: 'crash' } | { t: 'revive' } | { t: 'propose'; cmd: string } | { t: 'stop' }

type Wire = Msg | { t: 'hi'; from: NodeId; view: TabNodeView; ask?: boolean } | { t: 'bye'; from: NodeId }

const CHANNEL = 'sn.raft.tabs'
const LOCK = (id: NodeId) => `sn.raft.tab.${id}`
const HI_MS = 400
/** A member that hasn't been heard from for this long is dropped (the lock usually says it much sooner). */
const SILENT_MS = 4000

let core: RaftCore | null = null
let bc: BroadcastChannel | null = null
let crashed = false
let release: (() => void) | null = null
const seen = new Map<NodeId, { at: number; view: TabNodeView }>()
const watching = new Set<NodeId>()
let lastHi = 0
let lastPost = 0
/** The worker's own global (the app is typed against the DOM lib, not the worker one). */
const scope = self as unknown as { postMessage(m: Out): void; onmessage: ((e: MessageEvent<In>) => void) | null; close(): void }
const hasLocks = typeof navigator !== 'undefined' && !!navigator.locks

const now = () => performance.now()
const view = (): TabNodeView => ({ id: core!.id, role: crashed ? 'down' : core!.role, term: core!.term, commit: core!.commit, last: core!.lastIndex, leader: crashed ? null : core!.leader })

function post(force = false) {
  if (!core || (!force && now() - lastPost < 120)) return
  lastPost = now()
  const c = core
  const log = c.log.slice(Math.max(0, c.commit - 5), c.commit).map((e, k) => ({ index: Math.max(0, c.commit - 5) + k + 1, term: e.term, cmd: e.cmd }))
  const nodes = [view(), ...[...seen.values()].map((x) => x.view)]
  const out: Out = { t: 'state', s: { self: view(), nodes, log, locks: hasLocks } }
  scope.postMessage(out)
}

const wire = (m: Wire) => bc?.postMessage(m)

function members() {
  core?.setPeers(seen.keys(), now())
}

function drop(id: NodeId) {
  if (!seen.delete(id)) return
  members()
  post(true)
}

/** Queue for a peer's lock: it's granted the moment that tab is gone. */
function watch(id: NodeId) {
  if (!hasLocks || watching.has(id)) return
  watching.add(id)
  void navigator.locks.request(LOCK(id), () => {
    watching.delete(id)
    drop(id)
  })
}

/** Hold this node's own lock until it crashes or stops. Resolves once it's held. */
function hold(id: NodeId) {
  if (!hasLocks) return Promise.resolve()
  return new Promise<void>((held) => {
    void navigator.locks.request(LOCK(id), () => {
      held()
      return new Promise<void>((r) => (release = r))
    })
  })
}

function hi(ask = false) {
  lastHi = now()
  wire({ t: 'hi', from: core!.id, view: view(), ask })
}

function onWire(e: MessageEvent<Wire>) {
  const m = e.data
  if (!core || crashed || m.from === core.id) return
  if (m.t === 'bye') return drop(m.from)
  if (m.t === 'hi') {
    const fresh = !seen.has(m.from)
    seen.set(m.from, { at: now(), view: m.view })
    if (fresh) {
      watch(m.from)
      members()
      post(true)
    }
    if (m.ask) hi()
    return
  }
  const s = seen.get(m.from)
  if (s) s.at = now()
  core.receive(m, now())
}

function loop() {
  if (!core || crashed) return
  const t = now()
  for (const [id, s] of seen) if (t - s.at > SILENT_MS) drop(id)
  core.tick(t)
  if (t - lastHi > HI_MS) hi()
  post()
}

async function start(id: NodeId) {
  await hold(id)
  core = new RaftCore(id, (m) => wire(m))
  bc = new BroadcastChannel(CHANNEL)
  bc.onmessage = onWire
  // Ask who's there before the first election timeout can run out (it's never shorter than 900 ms).
  hi(true)
  setInterval(loop, 25)
  post(true)
}

scope.onmessage = (e) => {
  const m = e.data
  if (m.t === 'start') void start(m.id)
  if (!core) return
  if (m.t === 'crash' && !crashed) {
    // A crash, not a goodbye: it just stops answering, and its lock goes with it.
    crashed = true
    release?.()
    release = null
    seen.clear()
    post(true)
  } else if (m.t === 'revive' && crashed) {
    void hold(core.id).then(() => {
      crashed = false
      core!.restart(now())
      core!.setPeers([], now())
      hi(true)
      post(true)
    })
  } else if (m.t === 'propose' && !crashed) {
    core.propose(m.cmd, now())
  } else if (m.t === 'stop') {
    wire({ t: 'bye', from: core.id })
    release?.()
    scope.close()
  }
}

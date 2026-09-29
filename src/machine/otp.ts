// A small Erlang/OTP-style runtime in TypeScript, for the Boiler (ROTEIRO
// §0.4.6, frame 41). The plan was Elixir itself, in the browser, on Popcorn
// (AtomVM compiled to WebAssembly). It isn't here yet, for honest reasons:
// Popcorn's runtime needs SharedArrayBuffer, so the whole site would have to
// be cross-origin isolated (COOP/COEP), and its toolchain pins Elixir 1.17.3.
// So these are the semantics, reimplemented faithfully rather than faked:
//
// - processes are independent units with their own mailbox and state, run by
//   a round-robin scheduler that handles one message per process per step
//   (a "reduction"), so nothing happens instantly or synchronously by accident;
// - links are bidirectional; an exit signal kills a linked process unless it
//   traps exits, in which case it arrives as an {'EXIT', From, Reason} message;
//   `kill` is untrappable, and the process it kills exits with `killed`;
// - supervisors trap exits and restart children by strategy (one_for_one,
//   rest_for_one, one_for_all), in start order, stopping them in reverse;
// - restart intensity: more than `intensity` restarts within `period` seconds
//   and the supervisor stops all its children and exits with `shutdown`, which
//   its own supervisor sees as a crashed child: the failure escalates.

export type Strategy = 'one_for_one' | 'rest_for_one' | 'one_for_all'
export type Reason = 'normal' | 'kill' | 'killed' | 'shutdown'

type Msg = { tag: 'EXIT'; from: number; reason: Reason } | { tag: 'request'; id: number } | { tag: 'tick' }

export interface ChildSpec {
  id: string
  kind: 'worker' | 'supervisor'
  /** Only for supervisors. */
  strategy?: Strategy
  intensity?: number
  period?: number
  children?: ChildSpec[]
}

interface SupState {
  spec: ChildSpec
  parent: number | null
  /** Current pid per child id, in start order (null while a child is down). */
  children: { spec: ChildSpec; pid: number | null }[]
  /** When each recent restart happened (ms): the intensity window. */
  restarts: number[]
}

interface WorkerState {
  /** Work done since this incarnation started: lost on a crash, like any process state. */
  served: number
  pressure: number
}

export interface Proc {
  pid: number
  id: string
  kind: 'worker' | 'supervisor'
  mailbox: Msg[]
  links: Set<number>
  trapExit: boolean
  alive: boolean
  born: number
  sup?: SupState
  work?: WorkerState
}

export interface LogLine {
  at: number
  kind: 'crash' | 'restart' | 'giveup' | 'app' | 'info'
  text: string
}

const pidStr = (pid: number) => `<0.${pid}.0>`

export class Runtime {
  procs = new Map<number, Proc>()
  /** Registered names → pid, like Process.register/2 (each child id is registered). */
  names = new Map<string, number>()
  log: LogLine[] = []
  version = 0
  stats = { requests: 0, ok: 0, lost: 0, restarts: 0, giveups: 0 }
  /** The application's top supervisor, and when (if it died) the "heart" brings it back. */
  root: number | null = null
  rebootAt = 0
  private next = 80
  private reqId = 0
  private listeners = new Set<(sup: string) => void>()
  private readonly app: ChildSpec

  constructor(app: ChildSpec) {
    this.app = app
    this.boot()
  }

  onGiveUp(f: (sup: string) => void) {
    this.listeners.add(f)
    return () => void this.listeners.delete(f)
  }

  private say(kind: LogLine['kind'], text: string) {
    this.log.push({ at: Date.now(), kind, text })
    if (this.log.length > 60) this.log.shift()
  }

  private boot() {
    this.root = this.spawn(this.app, null)
    this.say('app', `application caldeira started at node@browser · ${pidStr(this.root)}`)
  }

  /* ------------------------------------------------------------ processes */

  private spawn(spec: ChildSpec, parent: number | null): number {
    const pid = this.next++
    const p: Proc = { pid, id: spec.id, kind: spec.kind, mailbox: [], links: new Set(), trapExit: spec.kind === 'supervisor', alive: true, born: performance.now() }
    this.procs.set(pid, p)
    this.names.set(spec.id, pid)
    if (parent !== null) this.link(parent, pid)
    if (spec.kind === 'worker') p.work = { served: 0, pressure: 0.2 + Math.random() * 0.2 }
    else {
      // A supervisor's init/1: start every child, in order, before anything else.
      p.sup = { spec, parent, children: [], restarts: [] }
      for (const c of spec.children ?? []) p.sup.children.push({ spec: c, pid: this.spawn(c, pid) })
    }
    return pid
  }

  private link(a: number, b: number) {
    this.procs.get(a)?.links.add(b)
    this.procs.get(b)?.links.add(a)
  }
  private unlink(a: number, b: number) {
    this.procs.get(a)?.links.delete(b)
    this.procs.get(b)?.links.delete(a)
  }

  send(pid: number, msg: Msg) {
    const p = this.procs.get(pid)
    if (p?.alive) p.mailbox.push(msg)
  }

  /** exit/2: an exit signal from `from` to `pid`. */
  exit(pid: number, reason: Reason, from = -1) {
    const p = this.procs.get(pid)
    if (!p?.alive) return
    if (reason === 'kill') return this.die(p, 'killed')
    if (p.trapExit) return void p.mailbox.push({ tag: 'EXIT', from, reason })
    if (reason !== 'normal') this.die(p, reason)
  }

  private die(p: Proc, reason: Reason) {
    p.alive = false
    this.procs.delete(p.pid)
    if (this.names.get(p.id) === p.pid) this.names.delete(p.id)
    // Whatever was still in its mailbox dies with it.
    for (const m of p.mailbox) if (m.tag === 'request') this.stats.lost++
    p.mailbox = []
    if (reason !== 'shutdown' && reason !== 'normal') this.say('crash', `** ${p.id} ${pidStr(p.pid)} terminating · reason: ${reason}`)
    // Its links hear about it: a linked supervisor as a message, a plain linked process by dying too.
    for (const l of [...p.links]) {
      this.unlink(p.pid, l)
      this.exit(l, reason, p.pid)
    }
    if (p.pid === this.root) {
      this.root = null
      this.rebootAt = performance.now() + 3000
      this.say('app', `application caldeira exited: shutdown · type: permanent`)
    }
  }

  /** How a supervisor stops a child: unlink first (so no EXIT comes back), then shut it down, children first. */
  private shutdown(pid: number, sup: number) {
    const p = this.procs.get(pid)
    if (!p) return
    this.unlink(sup, pid)
    if (p.sup) for (const c of [...p.sup.children].reverse()) if (c.pid !== null) this.shutdown(c.pid, pid)
    this.die(p, 'shutdown')
  }

  /* ------------------------------------------------------------ scheduler */

  /** One scheduler pass: every live process handles at most one message. */
  step() {
    const now = performance.now()
    if (this.root === null && now >= this.rebootAt) {
      // In a release, `heart` (or systemd) restarts a node whose application stopped.
      this.say('app', 'heart: restarting the node')
      this.boot()
    }
    for (const p of [...this.procs.values()]) {
      if (!p.alive) continue
      const m = p.mailbox.shift()
      if (!m) continue
      if (p.sup) this.supervise(p, m, now)
      else this.work(p, m)
    }
    this.version++
  }

  private work(p: Proc, m: Msg) {
    const w = p.work!
    if (m.tag === 'request') {
      w.served++
      this.stats.ok++
      w.pressure = Math.min(1, w.pressure + 0.05)
    } else if (m.tag === 'tick') w.pressure = Math.max(0.15, w.pressure - 0.03)
  }

  private supervise(p: Proc, m: Msg, now: number) {
    const s = p.sup!
    if (m.tag !== 'EXIT') return
    // Our own supervisor is going down: so do we, children first.
    if (m.from === s.parent) {
      for (const c of [...s.children].reverse()) if (c.pid !== null) this.shutdown(c.pid, p.pid)
      return this.die(p, m.reason)
    }
    const i = s.children.findIndex((c) => c.pid === m.from)
    if (i < 0) return
    s.children[i].pid = null
    this.say('crash', `=SUPERVISOR REPORT= ${s.spec.id} · child_terminated · ${s.children[i].spec.id} · reason: ${m.reason}`)
    // Restart intensity: more than `intensity` restarts in `period` seconds and it gives up.
    const period = (s.spec.period ?? 5) * 1000
    s.restarts = s.restarts.filter((t) => now - t <= period)
    s.restarts.push(now)
    if (s.restarts.length > (s.spec.intensity ?? 3)) {
      this.say('giveup', `=SUPERVISOR REPORT= ${s.spec.id} · reached_max_restart_intensity · shutting down`)
      this.stats.giveups++
      for (const c of [...s.children].reverse()) if (c.pid !== null) this.shutdown(c.pid, p.pid)
      s.children.forEach((c) => (c.pid = null))
      this.listeners.forEach((f) => f(s.spec.id))
      return this.die(p, 'shutdown')
    }
    const strategy = s.spec.strategy ?? 'one_for_one'
    // Which children go down with it, and come back: one_for_one only it; rest_for_one it and the ones
    // started after it; one_for_all everyone. Stopped in reverse start order, restarted in start order.
    const from = strategy === 'one_for_all' ? 0 : i
    const to = strategy === 'one_for_one' ? i : s.children.length - 1
    for (let j = to; j >= from; j--) {
      const c = s.children[j]
      if (c.pid !== null) this.shutdown(c.pid, p.pid)
      c.pid = null
    }
    for (let j = from; j <= to; j++) {
      const c = s.children[j]
      c.pid = this.spawn(c.spec, p.pid)
      this.stats.restarts++
      this.say('restart', `${s.spec.id} restarted ${c.spec.id} · ${pidStr(c.pid)}`)
    }
  }

  /* ------------------------------------------------------------ the outside world */

  /** A request to a registered worker, like GenServer.cast({:via, name}): it fails if nobody is there. */
  request(name: string) {
    this.stats.requests++
    const pid = this.names.get(name)
    if (pid === undefined) return void this.stats.lost++
    this.send(pid, { tag: 'request', id: this.reqId++ })
  }

  tick() {
    for (const p of this.procs.values()) if (p.work) this.send(p.pid, { tag: 'tick' })
  }

  /** Process.exit(pid, :kill), from the visitor's hand. */
  kill(pid: number) {
    this.exit(pid, 'kill')
  }

  /** The current incarnation of a child id, and how full its supervisor's restart window is. */
  lookup(id: string): Proc | undefined {
    const pid = this.names.get(id)
    return pid === undefined ? undefined : this.procs.get(pid)
  }

  /** Restarts left in the window, for a supervisor's gauge. */
  window(id: string): { used: number; max: number } | null {
    const p = this.lookup(id)
    if (!p?.sup) return null
    const now = performance.now()
    const period = (p.sup.spec.period ?? 5) * 1000
    return { used: p.sup.restarts.filter((t) => now - t <= period).length, max: p.sup.spec.intensity ?? 3 }
  }
}

export { pidStr }

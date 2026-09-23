import { create } from 'zustand'

// The live wire (ROTEIRO §0.1, phases 10–11). One Server-Sent Events stream
// from live/ (Gabriel's real raftkv cluster and matching engine, running on a
// server) shared by every visitor, plus a few POSTs to act on it. No three.js
// here: the lobby and Act III read this store too.
//
// The server runs on a free plan that sleeps when nobody is around and takes
// about a minute to wake: the site pings it the moment a visitor arrives, shows
// 'waking' meanwhile, and keeps trying. If it never comes, `status` goes
// 'offline' and every installation falls back to its local simulation, and says so.

export interface RaftNodeState {
  id: number
  up: boolean
  role: 'leader' | 'follower' | 'candidate'
  term: number
  commit: number
  last: number
}

export interface LiveState {
  t: number
  audience: number
  tickets: number
  raft: { nodes: RaftNodeState[]; leader: number; rpcs: number; claps: number; healAt: number[] }
  book: {
    bids: [number, number][]
    asks: [number, number][]
    last: [number, number, number, 'BUY' | 'SELL', number][]
    trades: number
    orders: number
    bestBid: number
    bestAsk: number
  }
  machine: { uptime: number; java: string; heapMb: number; threads: number; events: number; requests: number }
}

export type LiveStatus = 'off' | 'connecting' | 'waking' | 'live' | 'offline'

interface Live {
  status: LiveStatus
  state: LiveState | null
  /** Local clock minus server clock, to show server times honestly. */
  skew: number
}

export const useLive = create<Live>(() => ({ status: 'off', state: null, skew: 0 }))

const params = new URLSearchParams(location.search)
/** ?live=off forces the local simulations; ?live=<url> points at another server. */
const override = params.get('live')
const BASE: string | null =
  override === 'off' ? null : (override ?? import.meta.env.VITE_LIVE_URL ?? (import.meta.env.DEV ? 'http://localhost:8787' : null))

export const LIVE_URL = BASE

/** After this long without an answer, the server is taken to be asleep and waking. */
const WAKING_AFTER_MS = 4000
/** A free instance takes about a minute to wake; past this, give up and stay local. */
const GIVE_UP_MS = 100_000

/** Everyone who wants every raw frame as it arrives (the X-ray draws them falling). */
const frameListeners = new Set<(raw: string, state: LiveState) => void>()
export function onLiveFrame(fn: (raw: string, state: LiveState) => void) {
  frameListeners.add(fn)
  return () => void frameListeners.delete(fn)
}

let source: EventSource | null = null
let started = false
let timers: number[] = []
let woken = false

/**
 * Knocks on the server's door as early as possible (a plain GET it answers or
 * not; the point is that it starts waking up). Called when the page loads.
 */
export function wakeLive() {
  if (!BASE || woken) return
  woken = true
  fetch(`${BASE}/live/health`, { mode: 'no-cors', cache: 'no-store' }).catch(() => {})
}

/** Opens the stream once; every caller after the first is a no-op. */
export function connectLive() {
  if (started || useLive.getState().status === 'offline') return
  if (!BASE) {
    useLive.setState({ status: 'offline' })
    return
  }
  wakeLive()
  started = true
  useLive.setState({ status: 'connecting' })
  timers.push(window.setTimeout(() => useLive.getState().status === 'connecting' && useLive.setState({ status: 'waking' }), WAKING_AFTER_MS))
  timers.push(window.setTimeout(() => useLive.getState().status !== 'live' && offline(), GIVE_UP_MS))
  open()
}

function open() {
  const es = new EventSource(`${BASE}/live/events`)
  source = es
  es.addEventListener('state', (e) => {
    try {
      const raw = (e as MessageEvent).data as string
      const state = JSON.parse(raw) as LiveState
      frameListeners.forEach((fn) => fn(raw, state))
      // Through: the waking and give-up timers are done with.
      if (useLive.getState().status !== 'live') timers.splice(0).forEach(clearTimeout)
      useLive.setState({ status: 'live', state, skew: Date.now() - state.t })
    } catch {
      /* a malformed frame: wait for the next one */
    }
  })
  es.onerror = () => {
    if (useLive.getState().status === 'live') useLive.setState({ status: 'connecting' })
    // A proxy error while the server wakes closes the stream for good: open a new one ourselves.
    if (es.readyState === EventSource.CLOSED && source === es && useLive.getState().status !== 'offline') {
      timers.push(window.setTimeout(() => source === es && open(), 3000))
    }
  }
}

function offline() {
  timers.forEach(clearTimeout)
  timers = []
  source?.close()
  source = null
  useLive.setState({ status: 'offline' })
}

async function post<T>(path: string, body?: unknown): Promise<T | null> {
  if (!BASE || useLive.getState().status !== 'live') return null
  try {
    const r = await fetch(`${BASE}/live${path}`, {
      method: 'POST',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
    if (!r.ok) return null
    return (await r.json()) as T
  } catch {
    return null
  }
}

export const live = {
  ticket: () => post<{ n: number }>('/ticket'),
  toggleNode: (id: number) => post<LiveState['raft']>(`/raft/${id}/toggle`),
  clap: () => post<{ claps: number; index: number; leader: number }>('/raft/clap'),
  order: (o: { side: 'BUY' | 'SELL'; type: 'LIMIT' | 'MARKET'; price?: number; qty: number }) =>
    post<{ id: number; reports: { status: string; filled: number; remaining: number; lastPrice: number }[]; trades: [number, number][] }>('/order', {
      price: 0,
      ...o,
    }),
}

/** Ticks → a price as shown on the tape (the engine trades integer ticks of 0.01). */
export const px = (ticks: number) => (ticks / 100).toFixed(2)

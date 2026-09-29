import { create } from 'zustand'
import { FRAME_COUNT, frameById, type FrameId } from './frames'

// The spine of Part II (ROTEIRO §0.4.3). Progress is not a number: it is a log
// of events ("found frame X"), kept here and judged by the cinema's server
// (cinema/, a Durable Object in Rust), which replays it and answers with what
// really counts. Whatever the server doesn't accept goes away again, and a
// forgery (a made-up frame, an edited localStorage) is answered with "No." and
// stamps the ticket FALSIFICADO. Without a server the log stays local and is
// judged later.
//
// No three.js here: the lobby and Act III read this store too.

interface Pass {
  id: string
  n: number
  sig: string
}

interface Ev {
  seq: number
  id: FrameId
  at: number
}

export interface CinemaStats {
  visitors: number
  explorers: number
  completed: number
  fastest_ms: number | null
  last_completion: number | null
  frames: number
  built: number
}

interface ServerProgress {
  found: FrameId[]
  last_seq: number
  watched_ms: number
  forged: boolean
  completion: number | null
}

export type CinemaStatus = 'off' | 'connecting' | 'online' | 'offline'

interface Progress {
  status: CinemaStatus
  ticket: Pass | null
  /** Frames back in the reel: accepted by the server, plus the ones on their way to it. */
  found: FrameId[]
  pending: Ev[]
  seq: number
  forged: boolean
  completion: number | null
  stats: CinemaStats | null
  /** The last frame to come back (for the toast). */
  latest: { id: FrameId; at: number } | null
  /** When the server last refused something: the "No." */
  refused: { at: number; forged: boolean } | null
}

const params = new URLSearchParams(location.search)
/** ?cinema=off keeps everything local; ?cinema=<url> points at another server. */
const override = params.get('cinema')
const BASE: string | null =
  override === 'off' ? null : (override ?? import.meta.env.VITE_CINEMA_URL ?? (import.meta.env.DEV ? 'http://localhost:8788' : null))

/** The cinema's server, or null when it's off (the git card's proxy lives there too). */
export const cinemaBase = () => BASE

/** Heartbeat while the page is on screen; the server credits watched time from these. */
const BEAT_MS = 15_000

/* ---------------------------------------------------------------- storage */

// sn.ticket is who you are, sn.log is what you did. sn.progress is only a
// mirror for humans, and a bait: editing it is how most people try to cheat.
const read = <T,>(k: string): T | null => {
  try {
    const v = localStorage.getItem(`sn.${k}`)
    return v === null ? null : (JSON.parse(v) as T)
  } catch {
    return null
  }
}
const write = (k: string, v: unknown) => {
  try {
    localStorage.setItem(`sn.${k}`, JSON.stringify(v))
  } catch {
    /* private mode: the night is not remembered, which is fine */
  }
}

interface Log {
  seq: number
  /** Confirmed by the server. */
  confirmed: FrameId[]
  pending: Ev[]
}

const stored = read<Log>('log')
const log: Log = {
  seq: Number(stored?.seq) || 0,
  confirmed: Array.isArray(stored?.confirmed) ? stored.confirmed.filter((x) => typeof x === 'string') : [],
  pending: Array.isArray(stored?.pending) ? stored.pending.filter((e) => e && typeof e.id === 'string' && Number.isFinite(e.seq)) : [],
}
const mirror = (n: number) => `${n}/${FRAME_COUNT}`
/** The bait disagrees with the log it mirrors: somebody edited it by hand. */
const baitTouched = (() => {
  const b = read<string>('progress')
  return b !== null && b !== mirror(new Set([...log.confirmed, ...log.pending.map((e) => e.id)]).size)
})()

const union = (a: FrameId[], b: Ev[]) => [...new Set([...a, ...b.map((e) => e.id)])]

export const useProgress = create<Progress>(() => ({
  status: 'off',
  ticket: read<Pass>('ticket'),
  found: union(log.confirmed, log.pending),
  pending: log.pending,
  seq: log.seq,
  forged: false,
  completion: null,
  stats: null,
  latest: null,
  refused: null,
}))

function persist(confirmed: FrameId[]) {
  const s = useProgress.getState()
  write('log', { seq: s.seq, confirmed, pending: s.pending } satisfies Log)
  write('progress', mirror(s.found.length))
  if (s.ticket) write('ticket', s.ticket)
}

/* ---------------------------------------------------------------- the wire */

async function post<T>(path: string, body: unknown): Promise<{ status: number; data: T | null }> {
  if (!BASE) return { status: 0, data: null }
  try {
    // text/plain keeps it a "simple" request: no CORS preflight, and a beacon on the way out works too.
    const r = await fetch(`${BASE}${path}`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(body) })
    return { status: r.status, data: r.ok ? ((await r.json()) as T) : null }
  } catch {
    return { status: 0, data: null }
  }
}

/**
 * Takes the server's word for it: what it accepted stays, what it refused goes
 * away. Frames found "too soon" aren't refused, only not yet: they stay in the
 * queue and are asked about again on the next heartbeat.
 */
function apply(p: ServerProgress, stats: CinemaStats, rejected: { seq: number; reason: string; forged: boolean }[] = [], accepted: number[] = []) {
  const s = useProgress.getState()
  const gone = new Set([...accepted, ...rejected.filter((r) => r.reason !== 'too_soon').map((r) => r.seq)])
  const pending = s.pending.filter((e) => !gone.has(e.seq) && !p.found.includes(e.id))
  const forged = rejected.filter((r) => r.forged)
  useProgress.setState({
    status: 'online',
    found: union(p.found, pending),
    pending,
    seq: Math.max(s.seq, p.last_seq),
    forged: p.forged,
    completion: p.completion,
    stats,
    refused: forged.length ? { at: Date.now(), forged: true } : s.refused,
  })
  persist(p.found)
}

let visiting = false

async function visit() {
  if (visiting) return
  visiting = true
  useProgress.setState({ status: 'connecting' })
  const { data } = await post<{ ticket: Pass; returning: boolean; progress: ServerProgress; stats: CinemaStats }>('/v1/visit', {
    ticket: useProgress.getState().ticket,
  })
  visiting = false
  if (!data) {
    // Unreachable, or too many new tickets from here (429): stay local, the heartbeat tries again.
    useProgress.setState({ status: 'offline' })
    return
  }
  useProgress.setState({ ticket: data.ticket })
  // A different ticket than the one stored (it was forged, or lost): the old log belonged to nobody.
  const same = data.returning
  const claimed = same ? log.confirmed : []
  if (!same) useProgress.setState({ pending: useProgress.getState().pending.map((e, i) => ({ ...e, seq: i + 1 })), seq: useProgress.getState().pending.length })
  apply(data.progress, data.stats)
  // Frames this browser says the server accepted, that the server never did: edited by hand.
  const invented = claimed.some((id) => !data.progress.found.includes(id))
  if (same && (invented || baitTouched)) confess()
  if (useProgress.getState().pending.length) void sync(true)
}

/**
 * The log was edited by hand. The judge hears about it like about anything
 * else: as an event, one it has never heard of, so it answers the way it
 * answers every forgery.
 */
function confess() {
  const s = useProgress.getState()
  const seq = s.seq + 1
  useProgress.setState({ seq, pending: [...s.pending, { seq, id: 'localStorage', at: Date.now() }] })
}

let inflight = false

async function sync(visible: boolean) {
  const s = useProgress.getState()
  if (!BASE || inflight) return
  if (!s.ticket) return void visit()
  inflight = true
  const { status, data } = await post<{ accepted: number[]; rejected: { seq: number; reason: string; forged: boolean }[]; progress: ServerProgress; stats: CinemaStats; inbox?: { from_n: number; text: string }[] }>(
    '/v1/sync',
    { ticket: s.ticket, events: s.pending, visible },
  )
  inflight = false
  if (data) {
    // Notes from other visitors online: the usher hands them over.
    for (const m of data.inbox ?? []) usherNote(m.from_n, m.text)
    return apply(data.progress, data.stats, data.rejected, data.accepted)
  }
  if (status === 403) {
    // A ticket the server never signed: start over with a real one.
    useProgress.setState({ ticket: null, forged: true, refused: { at: Date.now(), forged: true } })
    return void visit()
  }
  if (status === 0) useProgress.setState({ status: 'offline' })
}

/** On the way out: one last heartbeat that survives the page closing. */
function beacon() {
  const s = useProgress.getState()
  if (!BASE || !s.ticket) return
  const body = new Blob([JSON.stringify({ ticket: s.ticket, events: s.pending, visible: false })], { type: 'text/plain' })
  navigator.sendBeacon?.(`${BASE}/v1/sync`, body)
}

/* ---------------------------------------------------------------- public */

let flushTimer = 0

/** A frame is back in the reel. Safe to call any number of times; only the first counts. */
export function findFrame(id: FrameId) {
  const f = frameById(id)
  const s = useProgress.getState()
  if (!f || s.found.includes(id)) return
  const seq = s.seq + 1
  useProgress.setState({ seq, pending: [...s.pending, { seq, id, at: Date.now() }], found: [...s.found, id], latest: { id, at: Date.now() } })
  persist(s.found.filter((x) => !s.pending.some((e) => e.id === x)))
  clearTimeout(flushTimer)
  flushTimer = window.setTimeout(() => void sync(!document.hidden), 600)
}

let started = false

/** Called once when the page loads: ticket, heartbeat, and the log's first judgement. */
export function startCinema() {
  if (started) return
  started = true
  if (!BASE) return useProgress.setState({ status: 'offline' })
  void visit()
  setInterval(() => {
    if (document.hidden) return
    if (useProgress.getState().status === 'offline' && !useProgress.getState().ticket) void visit()
    else void sync(true)
  }, BEAT_MS)
  // Only time on screen counts: going away closes the interval, coming back opens a new one.
  document.addEventListener('visibilitychange', () => void sync(!document.hidden))
  addEventListener('pagehide', beacon)
}

/** Frames found, for anything that wants to know (the player, the ticket, the credits). */
export const useFound = () => useProgress((s) => s.found)

/* ---------------------------------------------------------------- the house's numbers */

/**
 * One more person tried this (a fixed list on the server: dontclick, konami…).
 * → how many have, out of how many visitors, so the usher can say it.
 */
export async function countTry(key: string): Promise<{ n: number; visitors: number } | null> {
  const { data } = await post<{ n: number; visitors: number }>('/v1/count', { key })
  return data
}

async function get<T>(path: string): Promise<T | null> {
  if (!BASE) return null
  try {
    const r = await fetch(`${BASE}${path}`)
    return r.ok ? ((await r.json()) as T) : null
  } catch {
    return null
  }
}

/** The box office's drawer: ticket nº 1 and the last ones sold. */
export const fetchStubs = () => get<{ first: { n: number; created: number } | null; last: { n: number; created: number }[] }>('/v1/stubs')
export const fetchCounts = () => get<Record<string, number>>('/v1/counts')

/* ---------------------------------------------------------------- the others in the house */

let noteHandler: (from: number, text: string) => void = () => {}
/** Who shows a note passed by another visitor (set by the usher's overlay). */
export const onNote = (f: typeof noteHandler) => void (noteHandler = f)
const usherNote = (from: number, text: string) => noteHandler(from, text)

export const fetchOnline = () => get<{ online: number[] }>('/v1/online')

/** A note to someone online, in the house vocabulary → the sentence sent, or why not. */
export async function writeTo(to: number, words: string[]): Promise<{ ok: true; sent: string } | { ok: false; status: number }> {
  const t = useProgress.getState().ticket
  if (!t) return { ok: false, status: 0 }
  const { status, data } = await post<{ sent: string }>('/v1/write', { ticket: t, to, words })
  return data ? { ok: true, sent: data.sent } : { ok: false, status }
}

export interface CompletionRow {
  completion: number
  n: number
  ms: number
  at: number
}
export const fetchCompletions = () => get<{ completions: CompletionRow[]; avg_ms: number | null }>('/v1/completions')

export interface FilmFrame {
  act: 1 | 2 | 3
  t: number
  x: number
  y: number
  c: number
}
export const fetchFilm = () => get<{ frames: { n: number; completion: number; frame: FilmFrame }[] }>('/v1/film')
export async function addFilmFrame(frame: FilmFrame) {
  const t = useProgress.getState().ticket
  return t ? (await post<{ frame: number }>('/v1/film', { ticket: t, frame })).data : null
}
export interface Certificate {
  claim: string
  explorer: number
  completion: number
  ms: number
  frames: number
  sig: string
  code: string
  alg: string
}
export async function fetchCertificate() {
  const t = useProgress.getState().ticket
  return t ? (await post<Certificate>('/v1/certificate', { ticket: t })).data : null
}
export const fetchNotes = () => get<{ notes: { n: number; text: string; at: number }[] }>('/v1/notes')
export async function leaveNote(words: string[]) {
  const t = useProgress.getState().ticket
  return t ? (await post<{ note: string }>('/v1/notes', { ticket: t, words })).data : null
}

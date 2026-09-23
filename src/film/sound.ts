import { usePreload } from '../lobby/preload'
import { chapterAt, CHAPTERS, type ChapterId } from './chapters'
import { useFilm } from './store'

// The site's sound, shared by the three acts (ROTEIRO §6). No three.js here,
// so the lobby can start the music on its own opening. Recorded sounds live in
// public/audio (chosen by Gabriel from CC0 / CC-BY sources; credits in
// content/soundCredits.ts). The film's synthesised beds and effects
// (film/audio.ts) build on this context and hand over to the recordings as
// they arrive.

export type Track = 'lobby' | 'booth' | 'studio' | 'alley' | 'crossing' | 'moon' | 'credits'

/** The score per chapter, and how loud it sits under the scene (the Moon is meant to be nearly silent). */
const SCORE: Record<ChapterId, [Track, number]> = {
  countdown: ['booth', 0.7],
  booth: ['booth', 0.8],
  studio: ['studio', 0.55],
  alley: ['alley', 0.6],
  crossing: ['crossing', 0.8],
  moon: ['moon', 0.35],
  credits: ['credits', 1],
}
/** In the lobby and with the lights up: the foyer's jazz, kept low. */
const LOBBY_LEVEL = 0.55

let ctx: AudioContext | null = null
let master: GainNode
let musicBus: GainNode

export const audioContext = () => ctx
export const masterNode = () => master

/** Creates (or resumes) the audio context. Must first run inside a click or key press. */
export function ensureAudio() {
  if (!ctx) {
    ctx = new AudioContext()
    master = ctx.createGain()
    master.gain.value = 0
    // A touch of glue on the bus so bursts never clip.
    master.connect(ctx.createDynamicsCompressor()).connect(ctx.destination)
    musicBus = ctx.createGain()
    musicBus.connect(master)
    useFilm.subscribe(mixMusic)
    usePreload.subscribe(mixMusic)
    applyMaster()
    useFilm.subscribe(applyMaster)
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

function applyMaster() {
  if (!ctx) return
  master.gain.setTargetAtTime(useFilm.getState().sound ? 0.9 : 0, ctx.currentTime, 0.2)
}

/* ------------------------------------------------------------------ samples */

const buffers = new Map<string, Promise<AudioBuffer | null>>()

/** Fetches and decodes a sound from public/audio once; null if it can't be had (the synth stays). */
export function sample(name: string): Promise<AudioBuffer | null> {
  if (!buffers.has(name)) {
    const c = ensureAudio()
    buffers.set(
      name,
      fetch(`/audio/${name}.mp3`)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))
        .then((b) => c.decodeAudioData(b))
        .catch(() => null),
    )
  }
  return buffers.get(name)!
}

/** Plays a recorded one-shot, panned (-1..1). Resolves false if the recording isn't available. */
export async function playSample(name: string, pan = 0, vol = 1, rate = 1) {
  if (!ctx || !useFilm.getState().sound) return false
  const buf = await sample(name)
  if (!buf || !ctx) return false
  const src = ctx.createBufferSource()
  src.buffer = buf
  src.playbackRate.value = rate
  const g = ctx.createGain()
  g.gain.value = vol
  const p = ctx.createStereoPanner()
  p.pan.value = pan
  src.connect(g).connect(p).connect(master)
  src.start()
  return true
}

/**
 * A recording on an endless loop, joined by overlapping each pass with the next
 * and crossfading. That survives the silent padding MP3 and AAC decoders add at
 * the ends (Safari's especially), which a sample-accurate loop would click on.
 */
export class Loop {
  readonly out: GainNode
  private buf: AudioBuffer
  private xfade: number
  private next = 0
  private timer = 0
  private stopped = false

  constructor(buf: AudioBuffer, dest: AudioNode, xfade = 2) {
    this.buf = buf
    this.xfade = xfade
    this.out = ctx!.createGain()
    this.out.connect(dest)
    this.pass(ctx!.currentTime + 0.05, true)
  }

  private pass(at: number, first: boolean) {
    if (this.stopped || !ctx) return
    const src = ctx.createBufferSource()
    src.buffer = this.buf
    const g = ctx.createGain()
    const len = this.buf.duration
    const x = Math.min(this.xfade, len / 4)
    g.gain.setValueAtTime(first ? 1 : 0, at)
    if (!first) g.gain.linearRampToValueAtTime(1, at + x)
    g.gain.setValueAtTime(1, at + len - x)
    g.gain.linearRampToValueAtTime(0, at + len)
    src.connect(g).connect(this.out)
    src.start(at)
    src.stop(at + len + 0.05)
    this.next = at + len - x
    // Schedule the next pass a little ahead of time, in wall-clock time.
    this.timer = window.setTimeout(() => this.pass(this.next, false), Math.max(0, (this.next - ctx.currentTime - 1) * 1000))
  }

  stop(fade = 1.5) {
    if (!ctx) return
    this.stopped = true
    clearTimeout(this.timer)
    this.out.gain.setTargetAtTime(0, ctx.currentTime, fade / 3)
    setTimeout(() => this.out.disconnect(), fade * 1000 + 200)
  }
}

/* ------------------------------------------------------------------ the score */

let current: { track: Track; loop: Loop | null; level: number } | null = null
let pendingTrack: Track | null = null

/** Which track should be playing, and how loud, for where the visitor is right now. */
function wanted(): [Track, number] {
  if (usePreload.getState().act !== 'film') return ['lobby', LOBBY_LEVEL]
  return SCORE[chapterAt(useFilm.getState().time).id]
}

function mixMusic() {
  if (!ctx) return
  const [track, level] = wanted()
  if (current?.track === track) {
    // Same track: follow its level (and dip it while the film is paused).
    const l = level * (usePreload.getState().act === 'film' && !useFilm.getState().playing ? 0.5 : 1)
    if (current.loop && current.level !== l) {
      current.level = l
      current.loop.out.gain.setTargetAtTime(l, ctx.currentTime, 0.6)
    }
    return
  }
  if (pendingTrack === track) return
  pendingTrack = track
  void sample(`music-${track}`).then((buf) => {
    if (pendingTrack !== track || !ctx) return
    pendingTrack = null
    current?.loop?.stop(2.5)
    const loop = buf ? new Loop(buf, musicBus, 3) : null
    if (loop) {
      loop.out.gain.value = 0
      loop.out.gain.setTargetAtTime(level, ctx.currentTime, 0.9)
    }
    current = { track, loop, level }
    // The next chapter's score is fetched while this one plays.
    const i = CHAPTERS.findIndex((c) => c.id === chapterAt(useFilm.getState().time).id)
    const next = CHAPTERS[i + 1]
    if (next) setTimeout(() => void sample(`music-${SCORE[next.id][0]}`), 4000)
  })
}

/** The visitor chose sound in the lobby's opening: switch it on and start the foyer's music. */
export function startSound() {
  ensureAudio()
  if (!useFilm.getState().sound) useFilm.getState().toggleSound()
  mixMusic()
}

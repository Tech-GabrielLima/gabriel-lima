import { Camera, Vector3 } from 'three'
import { chapterAt, type ChapterId } from './chapters'
import { useFilm } from './store'
import { usePreload } from '../lobby/preload'
import { ensureAudio, Loop, masterNode, playSample, sample } from './sound'

// The film's sound (ROTEIRO §6). Continuous "beds" crossfade per chapter;
// one-shot effects are panned by where their source sits on screen. Each bed
// and effect has a recording (film/sound.ts, public/audio) that takes over once
// it has arrived; the Web Audio synthesis below is what plays until then, and
// what stays if a recording can't be had. The score lives in film/sound.ts.

type Bed = 'projector' | 'rain' | 'city' | 'neon' | 'sea' | 'breath'
export type Sfx = 'shutter' | 'shutterDown' | 'pop' | 'squeak' | 'scrape' | 'thunder' | 'zap' | 'beep' | 'click' | 'ring' | 'quack' | 'bell' | 'static' | 'curtain' | 'door'

/** Effects with a recording, and its level relative to the synthesised version. */
const RECORDED: Partial<Record<Sfx, [string, number]>> = {
  thunder: ['sfx-thunder', 0.9],
  ring: ['sfx-ring', 0.7],
  shutter: ['sfx-shutter', 0.8],
  shutterDown: ['sfx-shutter-down', 0.8],
  click: ['sfx-click', 0.8],
  static: ['sfx-static', 0.6],
  bell: ['sfx-bell', 0.6],
  zap: ['sfx-zap', 0.7],
  quack: ['sfx-quack', 0.9],
  curtain: ['sfx-curtain', 0.7],
  door: ['sfx-door', 0.8],
}
/** Recordings decoded and ready: an effect only uses its recording once it can play at once. */
const ready = new Set<string>()

/** Bed levels per chapter (0..1). */
const MIX: Record<ChapterId, Partial<Record<Bed, number>>> = {
  countdown: { projector: 0.7 },
  booth: { projector: 1 },
  studio: { rain: 0.45, city: 0.3 },
  alley: { rain: 1, city: 0.8 },
  crossing: { sea: 1 },
  moon: { breath: 1 },
  credits: { projector: 0.5 },
}

let ctx: AudioContext | null = null
let master: GainNode
let noise: AudioBuffer
const beds = {} as Record<Bed, GainNode>
/** Each bed's synthesised layer, faded out when its recording takes over. */
const synth = {} as Record<Bed, GainNode>
let rainRecorded = false
/** Scene-driven extra level per bed (e.g. neon buzz by distance), multiplied in. */
const extra: Partial<Record<Bed, number>> = { neon: 0 }
let projectorRate: AudioParam[] = []

function noiseBuffer(ac: AudioContext, seconds = 2) {
  const buf = ac.createBuffer(1, ac.sampleRate * seconds, ac.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  return buf
}

function loopNoise() {
  const s = ctx!.createBufferSource()
  s.buffer = noise
  s.loop = true
  s.start(0, Math.random() * 2)
  return s
}

function filter(type: BiquadFilterType, f: number, q = 0.7) {
  const b = ctx!.createBiquadFilter()
  b.type = type
  b.frequency.value = f
  b.Q.value = q
  return b
}

function gain(v: number) {
  const g = ctx!.createGain()
  g.gain.value = v
  return g
}

function buildBeds() {
  for (const name of ['projector', 'rain', 'city', 'neon', 'sea', 'breath'] as Bed[]) {
    beds[name] = gain(0)
    beds[name].connect(master)
    synth[name] = gain(1)
    synth[name].connect(beds[name])
  }

  // Projector: motor hum + band-passed noise gated by an 18 fps shutter.
  const hum = ctx!.createOscillator()
  hum.type = 'sawtooth'
  hum.frequency.value = 55
  hum.connect(filter('lowpass', 180)).connect(gain(0.05)).connect(synth.projector)
  hum.start()
  const gate = gain(0)
  const lfo = ctx!.createOscillator()
  lfo.type = 'square'
  lfo.frequency.value = 18
  lfo.connect(gain(0.045)).connect(gate.gain)
  loopNoise().connect(filter('bandpass', 2400, 1.2)).connect(gate).connect(synth.projector)
  lfo.start()
  projectorRate = [hum.frequency, lfo.frequency]
  const now = ctx!.currentTime
  hum.frequency.setValueAtTime(20, now)
  hum.frequency.exponentialRampToValueAtTime(55, now + 1.6)
  lfo.frequency.setValueAtTime(4, now)
  lfo.frequency.exponentialRampToValueAtTime(18, now + 1.6)

  // Rain: wide band noise on the pavement, plus a brighter hiss on the shutters.
  loopNoise().connect(filter('lowpass', 2600)).connect(filter('highpass', 350)).connect(gain(0.16)).connect(synth.rain)
  loopNoise().connect(filter('bandpass', 5200, 0.6)).connect(gain(0.035)).connect(synth.rain)

  // City: a distant low rumble of traffic.
  loopNoise().connect(filter('lowpass', 140)).connect(gain(0.22)).connect(synth.city)

  // Sea: low surf whose level swells slowly, like waves reaching the pilings.
  const swell = gain(0.12)
  const lfoSea = ctx!.createOscillator()
  lfoSea.frequency.value = 0.13
  lfoSea.connect(gain(0.09)).connect(swell.gain)
  lfoSea.start()
  loopNoise().connect(filter('lowpass', 520)).connect(swell).connect(synth.sea)
  loopNoise().connect(filter('bandpass', 1800, 0.5)).connect(gain(0.012)).connect(synth.sea)

  // Breathing inside a helmet: soft band-passed noise, in and out every ~4.5 s.
  const lungs = gain(0)
  const lfoBreath = ctx!.createOscillator()
  lfoBreath.frequency.value = 0.22
  lfoBreath.connect(gain(0.05)).connect(lungs.gain)
  lfoBreath.start()
  loopNoise().connect(filter('bandpass', 700, 0.8)).connect(lungs).connect(synth.breath)

  // Neon transformer buzz (120 Hz and its harmonics).
  for (const [f, v] of [
    [120, 0.03],
    [240, 0.02],
    [360, 0.008],
  ]) {
    const o = ctx!.createOscillator()
    o.type = 'sawtooth'
    o.frequency.value = f
    o.connect(filter('bandpass', f * 2, 2)).connect(gain(v)).connect(synth.neon)
    o.start()
  }
}

/** Beds whose recording has been asked for. Each is fetched only when a chapter first needs it (this one or the next). */
const recording = new Set<Bed>()
function wantRecording(name: Bed) {
  if (recording.has(name)) return
  recording.add(name)
  void sample(`amb-${name}`).then((buf) => {
    if (!buf || !ctx) return
    // The recording takes over from the synthesis.
    new Loop(buf, beds[name], 1.5)
    synth[name].gain.setTargetAtTime(0, ctx.currentTime, 0.4)
    if (name === 'rain') rainRecorded = true
  })
}

function mix() {
  if (!ctx) return
  const { sound, playing, time } = useFilm.getState()
  const levels = MIX[chapterAt(time).id]
  const ahead = MIX[chapterAt(time + 12).id]
  for (const name of Object.keys(beds) as Bed[]) if ((levels[name] ?? 0) > 0 || (ahead[name] ?? 0) > 0 || (name === 'neon' && (extra.neon ?? 0) > 0)) wantRecording(name)
  // Outside the film (lobby, Act III) its beds and effects are silent; the foyer's music plays instead (sound.ts).
  const outside = usePreload.getState().act !== 'film'
  master.gain.setTargetAtTime(sound && !outside ? 1 : 0, ctx.currentTime, 0.2)
  for (const name of Object.keys(beds) as Bed[]) {
    let v = levels[name] ?? 0
    if (name === 'neon') v = extra.neon ?? 0
    // The projector is a machine: pause the film and it winds down.
    if (name === 'projector' && !playing) v *= 0.15
    beds[name].gain.setTargetAtTime(v, ctx.currentTime, 0.6)
  }
  for (const p of projectorRate) p.setTargetAtTime(playing ? p.defaultValue : p.defaultValue * 0.4, ctx.currentTime, 0.4)
}

export function startAudio() {
  if (ctx) return
  ctx = ensureAudio()
  // The film's own bus, under the site's master (which also carries the score).
  master = gain(0)
  master.connect(masterNode())
  noise = noiseBuffer(ctx)
  buildBeds()
  for (const [name] of Object.values(RECORDED)) void sample(name).then((b) => b && ready.add(name))
  mix()
  useFilm.subscribe(mix)
  usePreload.subscribe(mix)
  // Drips: random ticks on the rain bed.
  const drip = () => {
    if (!ctx) return
    if (!rainRecorded && (MIX[chapterAt(useFilm.getState().time).id].rain ?? 0) > 0) tick(3000 + Math.random() * 2500, 0.02 + Math.random() * 0.03, (Math.random() - 0.5) * 1.6, beds.rain)
    setTimeout(drip, 120 + Math.random() * 600)
  }
  drip()
}

/** Scene-controlled level for a bed (0..1), e.g. the neon buzz by the camera's distance. */
export function setBedLevel(name: Bed, v: number) {
  if (Math.abs((extra[name] ?? 0) - v) < 0.01) return
  extra[name] = v
  mix()
}

function tick(freq: number, vol: number, pan: number, dest: AudioNode = master) {
  const t = ctx!.currentTime
  const s = ctx!.createBufferSource()
  s.buffer = noise
  const g = gain(0)
  g.gain.setValueAtTime(vol, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05)
  const p = ctx!.createStereoPanner()
  p.pan.value = pan
  s.connect(filter('bandpass', freq, 6)).connect(g).connect(p).connect(dest)
  s.start(t, Math.random())
  s.stop(t + 0.06)
}

/** One-shot effect. `pan` is -1 (left) .. 1 (right). */
export function sfx(kind: Sfx, pan = 0, vol = 1) {
  if (!ctx || !useFilm.getState().sound || usePreload.getState().act !== 'film') return
  const rec = RECORDED[kind]
  if (rec && ready.has(rec[0])) {
    void playSample(rec[0], Math.max(-1, Math.min(1, pan)), vol * rec[1])
    return
  }
  const t = ctx.currentTime
  const out = ctx.createStereoPanner()
  out.pan.value = Math.max(-1, Math.min(1, pan))
  out.connect(master)

  const burst = (dur: number, f: number, q: number, v: number, at = 0, lfoHz = 0) => {
    const s = ctx!.createBufferSource()
    s.buffer = noise
    const env = gain(0)
    env.gain.setValueAtTime(0, t + at)
    env.gain.linearRampToValueAtTime(v * vol, t + at + 0.02)
    env.gain.exponentialRampToValueAtTime(0.0001, t + at + dur)
    let node: AudioNode = s.connect(filter('bandpass', f, q))
    if (lfoHz) {
      // Amplitude-modulate for a rattle (steel slats hitting their rails).
      const am = gain(0.5)
      const o = ctx!.createOscillator()
      o.frequency.value = lfoHz
      o.connect(gain(0.5)).connect(am.gain)
      o.start(t + at)
      o.stop(t + at + dur)
      node = node.connect(am)
    }
    node.connect(env).connect(out)
    s.start(t + at, Math.random())
    s.stop(t + at + dur + 0.05)
  }
  const ping = (f: number, dur: number, v: number, at = 0) => {
    const o = ctx!.createOscillator()
    o.frequency.value = f
    const env = gain(0)
    env.gain.setValueAtTime(v * vol, t + at)
    env.gain.exponentialRampToValueAtTime(0.0001, t + at + dur)
    o.connect(env).connect(out)
    o.start(t + at)
    o.stop(t + at + dur)
  }

  switch (kind) {
    case 'beep':
      // The leader's "2-pop": one frame of 1 kHz.
      ping(1000, 1 / 24 + 0.01, 0.25)
      break
    case 'ring': {
      // An old bell phone: two tones hammered at 20 Hz, twice.
      for (const at of [0, 0.45]) {
        const am = gain(0)
        const hammer = ctx.createOscillator()
        hammer.type = 'square'
        hammer.frequency.value = 20
        hammer.connect(gain(0.5)).connect(am.gain)
        const env = gain(0)
        env.gain.setValueAtTime(0, t + at)
        env.gain.linearRampToValueAtTime(0.16 * vol, t + at + 0.02)
        env.gain.setValueAtTime(0.16 * vol, t + at + 0.36)
        env.gain.exponentialRampToValueAtTime(0.0001, t + at + 0.42)
        for (const f of [880, 960]) {
          const o = ctx.createOscillator()
          o.frequency.value = f
          o.connect(am)
          o.start(t + at)
          o.stop(t + at + 0.45)
        }
        am.connect(env).connect(out)
        hammer.start(t + at)
        hammer.stop(t + at + 0.45)
      }
      break
    }
    case 'static':
      // A radio tuning in: crackle and hiss, then a tone like a carrier.
      burst(1.4, 3200, 0.4, 0.22, 0, 37)
      burst(0.6, 1200, 1, 0.12, 0.3, 9)
      ping(1180, 0.5, 0.03, 0.9)
      break
    case 'bell':
      // A buoy's bell, far off: an inharmonic strike that rings out.
      for (const [f, v] of [
        [612, 0.08],
        [1340, 0.035],
        [2120, 0.02],
      ])
        ping(f, 2.4, v)
      break
    case 'quack':
      for (const at of [0, 0.2]) {
        const o = ctx.createOscillator()
        o.type = 'sawtooth'
        o.frequency.setValueAtTime(620, t + at)
        o.frequency.exponentialRampToValueAtTime(380, t + at + 0.15)
        const env = gain(0)
        env.gain.setValueAtTime(0.18 * vol, t + at)
        env.gain.exponentialRampToValueAtTime(0.0001, t + at + 0.17)
        o.connect(filter('bandpass', 1300, 3)).connect(env).connect(out)
        o.start(t + at)
        o.stop(t + at + 0.2)
      }
      for (let i = 0; i < 6; i++) burst(0.03, 2200 + Math.random() * 2000, 2, 0.25, 0.35 + i * 0.07)
      break
    case 'click':
      // A bakelite switch.
      burst(0.03, 2500, 2, 0.6)
      burst(0.05, 600, 1.5, 0.4, 0.015)
      break
    case 'shutter':
      burst(1.1, 1400, 0.8, 0.35, 0, 28)
      burst(0.25, 300, 1, 0.25, 1.0) // it clunks to a stop
      break
    case 'shutterDown':
      burst(0.8, 1100, 0.8, 0.3, 0, 34)
      burst(0.3, 160, 1, 0.5, 0.75)
      break
    case 'pop':
      burst(0.08, 3500, 0.7, 0.5)
      for (let i = 0; i < 4; i++) ping(3000 + Math.random() * 3000, 0.25 + Math.random() * 0.3, 0.05, 0.02 + i * 0.03)
      break
    case 'zap':
      burst(0.12, 6000, 1.5, 0.12)
      break
    case 'squeak': {
      const o = ctx.createOscillator()
      o.type = 'triangle'
      const env = gain(0)
      for (let i = 0; i < 3; i++) {
        const at = t + i * 0.11
        o.frequency.setValueAtTime(3200, at)
        o.frequency.exponentialRampToValueAtTime(4600, at + 0.05)
        env.gain.setValueAtTime(0.07 * vol, at)
        env.gain.exponentialRampToValueAtTime(0.0001, at + 0.08)
      }
      o.connect(env).connect(out)
      o.start(t)
      o.stop(t + 0.4)
      break
    }
    case 'scrape':
      burst(1.0, 700, 1.2, 0.35, 0, 11)
      break
    case 'thunder': {
      // A low roll: long, lowpassed, with a delayed second rumble.
      const s = ctx.createBufferSource()
      s.buffer = noiseBuffer(ctx, 5)
      const env = gain(0)
      env.gain.setValueAtTime(0, t)
      env.gain.linearRampToValueAtTime(0.9 * vol, t + 0.25)
      env.gain.exponentialRampToValueAtTime(0.25 * vol, t + 1.4)
      env.gain.linearRampToValueAtTime(0.6 * vol, t + 1.9)
      env.gain.exponentialRampToValueAtTime(0.0001, t + 4.8)
      s.connect(filter('lowpass', 110, 0.9)).connect(env).connect(out)
      s.start(t)
      break
    }
  }
}

const v = new Vector3()
/** Stereo position of a world point as seen by the camera (-1..1). */
export function panFor(p: Vector3, camera: Camera) {
  v.copy(p).project(camera)
  return Math.max(-1, Math.min(1, v.x)) * 0.8
}

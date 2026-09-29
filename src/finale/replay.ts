import type { ChapterId } from '../film/chapters'
import { chapterAt } from '../film/chapters'
import type { FilmFrame } from '../cinema/progress'
import type { Note, Recording, Sample } from './record'

// Drawing the visit as 8mm film (ROTEIRO §0.4.8): one frame of it from one
// sample of the recording. The acts as the house looked (the marquee, the
// film's own frames, the lights up), the visitor's light where it was, and
// the look of film: gate weave, grain, flicker, vignette. The collective
// film is drawn with the same function, one visitor per frame.

/** The trailer frames in public/lobby, by chapter (Lobby.tsx's FRAMES). */
const PICTURE: Record<ChapterId, number[]> = { countdown: [0], booth: [0], studio: [1], alley: [2, 3, 4], crossing: [5], moon: [6], credits: [7] }

const images: HTMLImageElement[] = []
export function loadPictures() {
  return Promise.all(
    Array.from({ length: 8 }, (_, i) => {
      const img = new Image()
      img.src = `/lobby/frame-${i}.webp`
      images[i] = img
      return img.decode().catch(() => {})
    }),
  )
}

const PALETTE = ['#ffb36b', '#3ef0e6', '#8fb8ff', '#7fd6c2', '#e9eef5', '#ff5a4f', '#ffd21f', '#d28bff']

let noise: HTMLCanvasElement | null = null
function grain() {
  if (noise) return noise
  noise = document.createElement('canvas')
  noise.width = noise.height = 128
  const g = noise.getContext('2d')!
  const d = g.createImageData(128, 128)
  for (let i = 0; i < d.data.length; i += 4) {
    const v = Math.random() * 255
    d.data[i] = d.data[i + 1] = d.data[i + 2] = v
    d.data[i + 3] = 34
  }
  g.putImageData(d, 0, 0)
  return noise
}

export interface Look {
  /** An intertitle over the frame (a frame found, the usher's line). */
  title?: string
  /** A small caption at the bottom (the time, the act). */
  caption?: string
  color?: string
}

/** One frame: where the visitor was (act, film time, the light). */
export function drawFrame(g: CanvasRenderingContext2D, w: number, h: number, s: Pick<Sample, 'act' | 'ft' | 'x' | 'y'> & { room?: string | null }, clock: number, look: Look = {}) {
  g.save()
  // Gate weave: the frame never sits still in the projector.
  g.translate(Math.sin(clock * 9.1) * 1.4, Math.cos(clock * 7.3) * 1.1)
  g.fillStyle = '#07080c'
  g.fillRect(-4, -4, w + 8, h + 8)
  if (s.act === 2) {
    const ch = chapterAt(s.ft).id
    const list = PICTURE[ch]
    const img = images[list[Math.floor(s.ft / 7) % list.length]]
    if (img?.complete && img.naturalWidth) {
      const k = Math.max(w / img.naturalWidth, h / img.naturalHeight)
      g.globalAlpha = 0.85
      g.drawImage(img, (w - img.naturalWidth * k) / 2, (h - img.naturalHeight * k) / 2, img.naturalWidth * k, img.naturalHeight * k)
      g.globalAlpha = 1
    }
  } else {
    // The lobby by night, or the house with its lights up.
    const bg = g.createRadialGradient(w / 2, h * 0.35, 10, w / 2, h * 0.4, w * 0.7)
    bg.addColorStop(0, s.act === 1 ? '#2a1c12' : '#3a2e22')
    bg.addColorStop(1, '#07080c')
    g.fillStyle = bg
    g.fillRect(0, 0, w, h)
    g.fillStyle = s.act === 1 ? 'rgba(255, 220, 180, 0.9)' : 'rgba(239, 230, 216, 0.75)'
    g.font = `${Math.round(h * 0.11)}px "Instrument Serif", Georgia, serif`
    g.textAlign = 'center'
    g.fillText(s.act === 1 ? 'Sessão Noturna' : 'Luzes acesas', w / 2, h * 0.44)
  }
  if (s.room) {
    g.fillStyle = 'rgba(62, 240, 230, 0.85)'
    g.font = `${Math.round(h * 0.04)}px "JetBrains Mono", monospace`
    g.textAlign = 'left'
    g.fillText(`▸ ${s.room}`, w * 0.05, h * 0.12)
  }
  // The visitor's light.
  const lx = ((s.x + 1) / 2) * w
  const ly = ((1 - s.y) / 2) * h
  const light = g.createRadialGradient(lx, ly, 0, lx, ly, h * 0.28)
  light.addColorStop(0, look.color ? `${look.color}66` : 'rgba(255, 214, 160, 0.45)')
  light.addColorStop(1, 'rgba(255, 214, 160, 0)')
  g.fillStyle = light
  g.fillRect(0, 0, w, h)
  if (look.title) {
    g.fillStyle = 'rgba(7, 8, 12, 0.72)'
    g.fillRect(w * 0.1, h * 0.36, w * 0.8, h * 0.24)
    g.strokeStyle = 'rgba(239, 230, 216, 0.6)'
    g.strokeRect(w * 0.12, h * 0.38, w * 0.76, h * 0.2)
    g.fillStyle = '#efe6d8'
    g.font = `italic ${Math.round(h * 0.06)}px "Instrument Serif", Georgia, serif`
    g.textAlign = 'center'
    wrap(g, look.title, w / 2, h * 0.49, w * 0.7, h * 0.07)
  }
  if (look.caption) {
    g.fillStyle = 'rgba(239, 230, 216, 0.7)'
    g.font = `${Math.round(h * 0.032)}px "JetBrains Mono", monospace`
    g.textAlign = 'left'
    g.fillText(look.caption, w * 0.04, h * 0.94)
  }
  g.restore()
  // Film: grain, flicker, vignette.
  const n = grain()
  const pat = g.createPattern(n, 'repeat')!
  g.save()
  g.translate(Math.random() * 128, Math.random() * 128)
  g.fillStyle = pat
  g.fillRect(-128, -128, w + 256, h + 256)
  g.restore()
  g.fillStyle = `rgba(255, 240, 220, ${0.02 + Math.random() * 0.03})`
  g.fillRect(0, 0, w, h)
  const v = g.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, w * 0.7)
  v.addColorStop(0, 'rgba(0,0,0,0)')
  v.addColorStop(1, 'rgba(0,0,0,0.75)')
  g.fillStyle = v
  g.fillRect(0, 0, w, h)
}

function wrap(g: CanvasRenderingContext2D, text: string, x: number, y: number, max: number, lh: number) {
  const words = text.split(' ')
  const lines: string[] = []
  let cur = ''
  for (const wd of words) {
    const test = cur ? `${cur} ${wd}` : wd
    if (g.measureText(test).width > max && cur) {
      lines.push(cur)
      cur = wd
    } else cur = test
  }
  lines.push(cur)
  lines.slice(0, 3).forEach((l, i) => g.fillText(l, x, y + (i - (Math.min(lines.length, 3) - 1) / 2) * lh))
}

/** The recording, sampled at a playback fraction 0..1. */
export function at(r: Recording, f: number): { s: Sample; note: Note | null } {
  const n = r.samples.length
  const s = r.samples[Math.min(n - 1, Math.max(0, Math.floor(f * n)))] ?? { t: 0, act: 1, ft: 0, x: 0, y: 0, room: null }
  const span = (r.samples[n - 1]?.t ?? 1) / 45
  const note = r.notes.find((x) => Math.abs(x.t - s.t) < span * 1.2) ?? null
  return { s, note }
}

/** A frame of the collective film. */
export function drawCollective(g: CanvasRenderingContext2D, w: number, h: number, f: FilmFrame, n: number, clock: number, pt: boolean) {
  drawFrame(g, w, h, { act: f.act, ft: f.t, x: f.x, y: f.y }, clock, { caption: `explorer #${n}${pt ? '' : ''}`, color: PALETTE[f.c % PALETTE.length] })
}

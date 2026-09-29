import { findFrame } from '../../cinema/progress'
import { resolvePath, type CardCtx } from '../cards'

// espectro FILE.wav: a spectrogram in the terminal (ROTEIRO §0.4.5, frame 34).
// For each slice of time, the energy at each frequency band (a Goertzel
// filter: a DFT evaluated at just the bins asked for), drawn with shades.
// Time runs left to right, pitch goes up the screen.

function pcm(wav: Uint8Array): { rate: number; x: Float32Array } | null {
  const v = new DataView(wav.buffer, wav.byteOffset, wav.byteLength)
  const tag = (o: number) => String.fromCharCode(...wav.subarray(o, o + 4))
  if (wav.length < 44 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return null
  let o = 12
  let rate = 8000
  let bits = 8
  let channels = 1
  while (o + 8 <= wav.length) {
    const id = tag(o)
    const size = v.getUint32(o + 4, true)
    if (id === 'fmt ') {
      channels = v.getUint16(o + 10, true)
      rate = v.getUint32(o + 12, true)
      bits = v.getUint16(o + 22, true)
    } else if (id === 'data') {
      const n = Math.floor(size / (bits / 8) / channels)
      const x = new Float32Array(n)
      for (let i = 0; i < n; i++) {
        const at = o + 8 + i * (bits / 8) * channels
        x[i] = bits === 8 ? (wav[at] - 128) / 128 : v.getInt16(at, true) / 32768
      }
      return { rate, x }
    }
    o += 8 + size + (size & 1)
  }
  return null
}

function goertzel(x: Float32Array, from: number, n: number, f: number, rate: number) {
  const w = (2 * Math.PI * f) / rate
  const k = 2 * Math.cos(w)
  let s1 = 0
  let s2 = 0
  for (let i = 0; i < n; i++) {
    // a Hann window, so the slices don't ring
    const win = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1))
    const s = x[from + i] * win + k * s1 - s2
    s2 = s1
    s1 = s
  }
  return Math.sqrt(s1 * s1 + s2 * s2 - k * s1 * s2)
}

const SHADES = [' ', '░', '▒', '▓', '█']

export async function espectro(c: CardCtx): Promise<number> {
  const file = c.args[0]
  if (!file) {
    c.out(c.pt ? 'uso: espectro ARQUIVO.wav\n' : 'usage: espectro FILE.wav\n')
    return 2
  }
  const path = resolvePath(c, file)
  const bytes = c.m.readFile(path)
  const sig = bytes && pcm(bytes)
  if (!sig) {
    c.out(`espectro: ${file}: ${c.pt ? 'não é um WAV que eu leia' : "not a WAV I can read"}\n`)
    return 1
  }
  const { rate, x } = sig
  const hop = Math.round(rate * 0.07)
  const win = hop
  const cols = Math.min(Math.floor((x.length - win) / hop), 60)
  // 7 bands from 3.4 kHz down, 360 Hz apart
  const bands = Array.from({ length: 7 }, (_, k) => 3400 - k * 360)
  const grid = bands.map((f) => Array.from({ length: cols }, (_, t) => goertzel(x, t * hop, win, f, rate)))
  const max = Math.max(1e-9, ...grid.flat())
  c.out(`\x1b[90m${path} · ${(x.length / rate).toFixed(2)} s · ${rate} Hz · ${c.pt ? 'volume quase zero' : 'volume near zero'}\x1b[0m\n`)
  grid.forEach((row, i) => {
    // two characters per slice: a terminal cell is twice as tall as it is wide
    const line = row.map((m) => SHADES[Math.min(4, Math.floor((m / max) * 5.5))].repeat(2)).join('')
    c.out(`\x1b[90m${String(bands[i]).padStart(4)}\x1b[0m \x1b[33m${line}\x1b[0m\n`)
  })
  c.out(`\x1b[90m  Hz  ${c.pt ? 'tempo' : 'time'} →\x1b[0m\n`)
  if (/silencio\.wav$/.test(path)) findFrame('spectrum')
  return 0
}

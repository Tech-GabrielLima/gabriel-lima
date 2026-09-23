import { CanvasTexture, SRGBColorSpace } from 'three'

// The laptop's screen (ROTEIRO, Cena 02): a real session of Gabriel's `flight`,
// typed out live — install, a crash, then flight explaining why it crashed.

const SCRIPT: { text: string; kind: 'cmd' | 'out' | 'err' | 'ok' | 'hint'; pause?: number }[] = [
  { text: '$ pip install pyflight', kind: 'cmd' },
  { text: 'Successfully installed pyflight', kind: 'ok', pause: 0.6 },
  { text: '$ python -m flight run app.py', kind: 'cmd' },
  { text: 'Traceback (most recent call last):', kind: 'err' },
  { text: '  File "app.py", line 26, in average', kind: 'err' },
  { text: 'ZeroDivisionError: division by zero', kind: 'err' },
  { text: '[flight] recorded flight-57275.flight', kind: 'hint', pause: 0.8 },
  { text: '$ python -m flight inspect flight-57275.flight', kind: 'cmd' },
  { text: 'exception : ZeroDivisionError', kind: 'out' },
  { text: 'why?      : len(orders) == 0', kind: 'out' },
  { text: '            orders ↔ load(day) returned []', kind: 'hint' },
  { text: 'fix       : guard empty days  ✓ replay passes', kind: 'ok', pause: 3 },
]

const COLORS = { cmd: '#e8f0e0', out: '#b8c8b0', err: '#ff7a6a', ok: '#7dffa8', hint: '#ffc46b' }

export function createTerminal() {
  const canvas = document.createElement('canvas')
  canvas.width = 640
  canvas.height = 400
  const g = canvas.getContext('2d')!
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  let last = ''

  /** Draws the session as it stands `t` seconds into the loop. */
  function draw(t: number) {
    const CPS = 26 // typing speed for commands
    const total = SCRIPT.reduce((s, l) => s + (l.kind === 'cmd' ? l.text.length / CPS + 0.3 : 0.15) + (l.pause ?? 0), 0)
    let time = t % total
    const lines: { text: string; kind: keyof typeof COLORS }[] = []
    for (const l of SCRIPT) {
      const dur = l.kind === 'cmd' ? l.text.length / CPS + 0.3 : 0.15
      if (time <= 0) break
      const shown = l.kind === 'cmd' ? l.text.slice(0, Math.max(0, Math.floor(Math.min(time, dur - 0.3) * CPS))) : l.text
      lines.push({ text: shown, kind: l.kind })
      time -= dur + (l.pause ?? 0)
    }
    const key = lines.map((l) => l.text).join('\n') + (Math.floor(t * 2) % 2)
    if (key === last) return
    last = key

    g.fillStyle = '#07100a'
    g.fillRect(0, 0, canvas.width, canvas.height)
    g.font = '20px "JetBrains Mono", monospace'
    g.textBaseline = 'top'
    const visible = lines.slice(-14)
    visible.forEach((l, i) => {
      g.fillStyle = COLORS[l.kind]
      g.fillText(l.text, 22, 46 + i * 24)
    })
    // Blinking block cursor after the last line.
    if (Math.floor(t * 2) % 2) {
      const lastLine = visible[visible.length - 1]
      const x = 22 + g.measureText(lastLine?.text ?? '').width + 4
      g.fillStyle = '#e8f0e0'
      g.fillRect(x, 46 + (visible.length - 1) * 24, 11, 20)
    }
    // Scanlines, for the CRT-ish glow.
    g.fillStyle = 'rgba(0,0,0,0.18)'
    for (let y = 0; y < canvas.height; y += 3) g.fillRect(0, y, canvas.width, 1)
    texture.needsUpdate = true
  }

  return { texture, draw }
}

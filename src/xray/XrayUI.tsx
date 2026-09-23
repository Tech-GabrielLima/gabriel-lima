import { useEffect, useRef, useState } from 'react'
import { cursor } from '../film/cursor'
import { useFilm } from '../film/store'
import { useLive } from '../live/live'
import { probe } from './probe'
import { closeXray, descend, LAYERS, press, release, setDepth, useXray, type Layer } from './xray'

// The X-ray's words and controls, over the picture. The picture is the show:
// each layer gets a title card that settles into a corner, a depth gauge runs
// down the right, and the numbers are real (xray/probe.ts).

type Card = { name: string; line: string }

const CARDS: Record<'en' | 'pt', Record<Layer, Card>> = {
  en: {
    pixel: { name: 'Pixel', line: 'All you see is this: little squares of colour, redrawn every frame.' },
    geometry: { name: 'Geometry', line: 'Under the light, the scene is only triangles.' },
    shader: { name: 'Shader', line: 'Every pixel runs through this program, millions of times a second.' },
    network: { name: 'Network', line: 'The packets the server is sending right now, to everyone here.' },
    server: { name: 'Server', line: 'The Java running the Raft cluster and the order book, now.' },
    silicon: { name: 'Silicon', line: 'And at the bottom of it all, the chip that drew this frame.' },
  },
  pt: {
    pixel: { name: 'Pixel', line: 'Tudo o que você vê é isto: quadradinhos de cor, redesenhados a cada quadro.' },
    geometry: { name: 'Geometria', line: 'Por baixo da luz, a cena é só triângulos.' },
    shader: { name: 'Shader', line: 'Cada pixel passa por este programa, milhões de vezes por segundo.' },
    network: { name: 'Rede', line: 'Os pacotes que o servidor está mandando agora, para todo mundo aqui.' },
    server: { name: 'Servidor', line: 'O Java rodando o cluster Raft e o livro de ofertas, agora.' },
    silicon: { name: 'Silício', line: 'E no fundo de tudo, o chip que desenhou este quadro.' },
  },
}

const nf = (lang: string) => new Intl.NumberFormat(lang === 'pt' ? 'pt-BR' : 'en-US')

/** The live number under each layer's title. */
function dataLine(layer: Layer, lang: 'en' | 'pt'): string {
  const pt = lang === 'pt'
  const n = nf(lang)
  const live = useLive.getState()
  switch (layer) {
    case 'pixel':
      return `${probe.width} × ${probe.height} ${pt ? 'pixels' : 'pixels'} · ${Math.round(probe.fps)} ${pt ? 'vezes por segundo' : 'times a second'} · ${n.format(Math.round((probe.width * probe.height * probe.fps) / 1e6))} M ${pt ? 'pixels/s' : 'pixels/s'}`
    case 'geometry':
      return `${n.format(probe.triangles)} ${pt ? 'triângulos' : 'triangles'} · ${probe.calls} ${pt ? 'chamadas de desenho' : 'draw calls'} · ${probe.geometries} ${pt ? 'geometrias' : 'geometries'} · ${probe.textures} ${pt ? 'texturas' : 'textures'}`
    case 'shader': {
      const l = probe.light
      return `${probe.programs} ${pt ? 'programas compilados' : 'compiled programs'}${l ? ` · ${pt ? 'sua luz' : 'your light'}: ${l.type} ${l.intensity.toFixed(1)} ${l.color}` : ''}`
    }
    case 'network':
      return live.status === 'live'
        ? `${probe.packetRate.toFixed(1)} ${pt ? 'pacotes/s' : 'packets/s'} · ${(probe.bytesRate / 1024).toFixed(1)} KB/s · ${n.format(probe.packets)} ${pt ? 'recebidos' : 'received'}`
        : pt
          ? 'o servidor está dormindo: nenhum pacote chegando agora'
          : 'the server is asleep: no packets arriving right now'
    case 'server': {
      const s = live.state
      if (live.status !== 'live' || !s) return pt ? 'o servidor está dormindo (plano gratuito): este é o código que ele roda' : 'the server is asleep (free plan): this is the code it runs'
      return `${s.machine.java} · ${s.machine.threads} threads · ${s.machine.heapMb} MB · ${pt ? 'líder' : 'leader'} N${s.raft.leader + 1} · ${n.format(s.raft.rpcs)} RPCs`
    }
    case 'silicon':
      return probe.gpuSupported && probe.gpuMs > 0
        ? `${probe.renderer} · ${probe.gpuMs.toFixed(2)} ms ${pt ? 'de GPU por quadro' : 'of GPU per frame'}`
        : `${probe.renderer} · ${pt ? 'o navegador esconde o relógio da GPU' : 'the browser hides the GPU clock'} · CPU ${probe.cpuMs.toFixed(1)} ms`
  }
}

/** R, the arrows, the wheel and Escape. Mounted with the film. */
export function useXrayKeys() {
  useEffect(() => {
    const typing = (e: Event) => !!(e.target as HTMLElement).closest?.('input, textarea, [contenteditable]')
    const down = (e: KeyboardEvent) => {
      if (typing(e) || !useFilm.getState().started) return
      if (e.code === 'KeyR' && !e.repeat && !e.metaKey && !e.ctrlKey) press()
      else if (!useXray.getState().on) return
      else if (e.key === 'Escape') closeXray()
      else if (e.key === 'ArrowDown') (e.preventDefault(), descend(1))
      else if (e.key === 'ArrowUp') (e.preventDefault(), descend(-1))
    }
    const up = (e: KeyboardEvent) => e.code === 'KeyR' && release()
    let last = 0
    const wheel = (e: WheelEvent) => {
      if (!useXray.getState().on) return
      e.preventDefault()
      if (performance.now() - last < 380 || Math.abs(e.deltaY) < 4) return
      last = performance.now()
      descend(Math.sign(e.deltaY))
    }
    addEventListener('keydown', down)
    addEventListener('keyup', up)
    addEventListener('blur', release)
    addEventListener('wheel', wheel, { passive: false, capture: true })
    return () => {
      removeEventListener('keydown', down)
      removeEventListener('keyup', up)
      removeEventListener('blur', release)
      removeEventListener('wheel', wheel, { capture: true })
    }
  }, [])
}

/** The player's button: hold to go down (on phones, the only way), tap to come back up. */
export function XrayButton() {
  const lang = useFilm((s) => s.lang)
  const on = useXray((s) => s.on)
  const hint = useXray((s) => s.hint)
  const pt = lang === 'pt'
  const touch = matchMedia('(pointer: coarse)').matches
  return (
    <span className="xr-btn-wrap">
      <button
        className={`pbtn chip xr-btn${on ? ' on' : ''}`}
        onPointerDown={(e) => (e.preventDefault(), press())}
        onPointerUp={release}
        onPointerLeave={release}
        onPointerCancel={release}
        onContextMenu={(e) => e.preventDefault()}
        aria-pressed={on}
        title={pt ? 'Raio-X: segure para descer pela pilha do site' : 'X-ray: hold to go down through the site’s stack'}
      >
        <span className="xr-dot" aria-hidden /> {pt ? 'Raio-X' : 'X-ray'}
      </button>
      {hint && !on && (
        <span className="xr-hint" role="status">
          {touch ? (pt ? 'segure este botão para ver o resto' : 'hold this button to see the rest') : pt ? 'segure' : 'hold'}
          {!touch && (
            <>
              {' '}
              <kbd>R</kbd> {pt ? 'para ver o resto' : 'to see the rest'}
            </>
          )}
        </span>
      )}
    </span>
  )
}

export function XrayUI() {
  const on = useXray((s) => s.on)
  const lang = useFilm((s) => s.lang)
  const at = useXray((s) => Math.round(s.shown))
  const [, tick] = useState(0)
  const [compact, setCompact] = useState(false)
  const gauge = useRef<HTMLDivElement>(null)
  const scope = useRef<HTMLCanvasElement>(null)
  const readout = useRef<HTMLDivElement>(null)

  // The film's captions step aside while it's open.
  useEffect(() => {
    document.body.classList.toggle('xray-open', on)
    return () => document.body.classList.remove('xray-open')
  }, [on])

  // Each new layer: its card, big, for a moment; then it settles in the corner.
  useEffect(() => {
    setCompact(false)
    const t = setTimeout(() => setCompact(true), 2600)
    return () => clearTimeout(t)
  }, [at, on])

  // Numbers a few times a second; the gauge, the loupe label and the scope every frame.
  useEffect(() => {
    if (!on) return
    const id = setInterval(() => tick((n) => n + 1), 250)
    let raf = 0
    const frame = () => {
      raf = requestAnimationFrame(frame)
      const s = useXray.getState()
      gauge.current?.style.setProperty('--at', String(s.shown / (LAYERS.length - 1)))
      const r = readout.current
      if (r) {
        // Beside the loupe: where the pointer is (the film's own record of it, even before it moves).
        const px = ((cursor.target.x + 1) / 2) * innerWidth
        const py = ((1 - cursor.target.y) / 2) * innerHeight
        r.style.transform = `translate3d(${Math.min(px + innerHeight * 0.1, innerWidth - 220)}px, ${py - 22}px, 0)`
        r.style.opacity = s.shown < 0.4 ? '1' : '0'
      }
      const c = scope.current
      if (c && s.shown > 4.4) {
        const g = c.getContext('2d')!
        const w = (c.width = c.clientWidth * devicePixelRatio)
        const h = (c.height = c.clientHeight * devicePixelRatio)
        g.clearRect(0, 0, w, h)
        const hist = probe.gpuSupported && probe.gpuHistory.length ? probe.gpuHistory : [probe.cpuMs]
        const top = Math.max(8, ...hist) * 1.2
        g.strokeStyle = 'rgba(255,179,107,.25)'
        g.beginPath()
        g.moveTo(0, h - (16.7 / top) * h)
        g.lineTo(w, h - (16.7 / top) * h)
        g.stroke()
        g.strokeStyle = '#9fe6ff'
        g.lineWidth = 1.5 * devicePixelRatio
        g.beginPath()
        hist.forEach((v, i) => {
          const x = (i / Math.max(1, hist.length - 1)) * w
          const y = h - (v / top) * h
          i ? g.lineTo(x, y) : g.moveTo(x, y)
        })
        g.stroke()
      }
    }
    raf = requestAnimationFrame(frame)
    return () => {
      clearInterval(id)
      cancelAnimationFrame(raf)
    }
  }, [on])

  if (!on) return null
  const pt = lang === 'pt'
  const layer = LAYERS[at]
  const card = CARDS[lang][layer]
  const hex = `#${probe.rgb.map((v) => v.toString(16).padStart(2, '0')).join('')}`
  return (
    <div className="xray-ui" aria-live="polite">
      <div className={`xr-card${compact ? ' compact' : ''}`} key={`${layer}`}>
        <p className="xr-n">
          {String(at + 1).padStart(2, '0')} <span>/ 06 · {pt ? 'do pixel ao silício' : 'from pixel to silicon'}</span>
        </p>
        <p className="xr-name">{card.name}</p>
        <p className="xr-line">{card.line}</p>
        <p className="xr-data">{dataLine(layer, lang)}</p>
      </div>

      <div className="xr-gauge" ref={gauge} role="list" aria-label={pt ? 'profundidade' : 'depth'}>
        <span className="xr-marker" aria-hidden />
        {LAYERS.map((l, i) => (
          <button key={l} role="listitem" className={i === at ? 'on' : ''} onClick={() => setDepth(i)}>
            <span>{String(i + 1).padStart(2, '0')}</span> {CARDS[lang][l].name}
          </button>
        ))}
      </div>

      <div className="xr-readout" ref={readout} aria-hidden>
        <span className="xr-swatch" style={{ background: hex }} />
        <b>{hex}</b> rgb({probe.rgb.join(', ')})<br />x {probe.px[0]} · y {probe.px[1]}
      </div>

      {at === 5 && <canvas className="xr-scope" ref={scope} aria-hidden />}

      <p className="xr-help">
        {pt ? (
          <>
            segure <kbd>R</kbd> para descer · <kbd>↑</kbd>
            <kbd>↓</kbd> camadas · toque <kbd>R</kbd> ou <kbd>Esc</kbd> para voltar
          </>
        ) : (
          <>
            hold <kbd>R</kbd> to go down · <kbd>↑</kbd>
            <kbd>↓</kbd> layers · tap <kbd>R</kbd> or <kbd>Esc</kbd> to come back
          </>
        )}
      </p>
      <button className="xr-close" onClick={closeXray} aria-label={pt ? 'fechar o raio-X' : 'close the X-ray'}>
        ✕
      </button>
    </div>
  )
}

import { useProgress } from '@react-three/drei'
import { useEffect, useRef, useState } from 'react'
import { sfx, startAudio } from '../film/audio'
import { chapterById } from '../film/chapters'
import { useFilm } from '../film/store'
import { useT } from '../i18n'
import { MONOGRAM } from './monogram'

// SCENE 00 — CONTAGEM (ROTEIRO §2). An academy leader drawn in the DOM so it
// shows before any WebGL is ready: a PICTURE START frame, then one number per
// second (8 → 3) that never runs ahead of the real loading, holding on "2" for
// the one required click. After it the film runs: "2" and its pop, black, the
// GL ident drawing itself like a distributor's logo, the title card, the cut.

const FIRST = 8
const LAST_LOADING = 3
/** Seconds per number, as on a real leader (24 frames). */
const PER_NUMBER = 1
const PICTURE_START = 1.1

/** The phases of the in-film part, in seconds from the click (the chapter's own time). */
const T = { two: 1, black: 1.5, identDraw: [1.8, 3.8], identName: [3.4, 4.2], title: 5.4, fadeOut: 8.2 }

function Sweep({ frac }: { frac: number }) {
  // Clockwise sector from 12 o'clock, like the leader's wiping hand. Radius past
  // the corners (√2·50 ≈ 71), clipped to the frame.
  const a = Math.min(0.9999, Math.max(0, frac)) * Math.PI * 2
  const x = 50 + 80 * Math.sin(a)
  const y = 50 - 80 * Math.cos(a)
  return <path d={`M50 50 L50 -30 A80 80 0 ${a > Math.PI ? 1 : 0} 1 ${x} ${y} Z`} className="leader-sweep" />
}

function Frame({ children, jitter = false }: { children: React.ReactNode; jitter?: boolean }) {
  return (
    <svg className={`leader-dial${jitter ? ' jitter' : ''}`} viewBox="0 0 100 100" aria-hidden>
      <defs>
        <clipPath id="leader-clip">
          <rect x="0" y="0" width="100" height="100" />
        </clipPath>
      </defs>
      {children}
    </svg>
  )
}

function Dial({ n, frac, jitter }: { n: number; frac: number; jitter: boolean }) {
  return (
    <Frame jitter={jitter}>
      <g clipPath="url(#leader-clip)">
        <Sweep frac={frac} />
      </g>
      <line x1="50" y1="0" x2="50" y2="100" className="leader-line" />
      <line x1="0" y1="50" x2="100" y2="50" className="leader-line" />
      <circle cx="50" cy="50" r="38" className="leader-ring" />
      <circle cx="50" cy="50" r="44" className="leader-ring" />
      <text key={n} x="50" y="50" className="leader-n" dominantBaseline="central" textAnchor="middle">
        {n}
      </text>
    </Frame>
  )
}

function PictureStart() {
  return (
    <Frame>
      <rect x="6" y="6" width="88" height="88" className="leader-ring" />
      <line x1="6" y1="6" x2="94" y2="94" className="leader-line" />
      <line x1="94" y1="6" x2="6" y2="94" className="leader-line" />
      <text x="50" y="44" className="leader-ps" textAnchor="middle">
        PICTURE
      </text>
      <text x="50" y="60" className="leader-ps" textAnchor="middle">
        START
      </text>
    </Frame>
  )
}

/** The frame the leader runs in: sprocket holes streaming past, grain, dust, a lamp that breathes. */
function Celluloid() {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = canvas.current!
    const g = c.getContext('2d')!
    let raf = 0
    let last = 0
    const draw = (t: number) => {
      raf = requestAnimationFrame(draw)
      if (t - last < 1000 / 24) return
      last = t
      const { width: w, height: h } = c
      const img = g.createImageData(w, h)
      for (let i = 0; i < img.data.length; i += 4) {
        const v = Math.random() * 255
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v
        img.data[i + 3] = 9
      }
      g.putImageData(img, 0, 0)
      g.fillStyle = 'rgba(239,230,216,0.35)'
      if (Math.random() < 0.3) g.fillRect(Math.random() * w, 0, 0.6, h)
      g.fillStyle = 'rgba(0,0,0,0.7)'
      for (let k = 0; k < 2; k++) if (Math.random() < 0.3) g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2)
      c.style.opacity = String(0.85 + Math.random() * 0.15)
      c.parentElement?.style.setProperty('--lamp', String(0.94 + Math.random() * 0.06))
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [])
  return (
    <>
      <div className="leader-sprockets left" aria-hidden />
      <div className="leader-sprockets right" aria-hidden />
      <canvas ref={canvas} className="leader-grain" width={480} height={270} aria-hidden />
    </>
  )
}

/** Before the click: PICTURE START, the loading countdown, the projector switch. */
function Gate() {
  const t = useT()
  const start = useFilm((s) => s.start)
  const { progress, total } = useProgress()
  const [shown, setShown] = useState({ ps: true, n: FIRST, frac: 0 })
  const [ready, setReady] = useState(false)
  const [jitter, setJitter] = useState(false)
  const born = useRef(performance.now())
  const lastMove = useRef({ p: 0, at: performance.now() })
  const live = useRef({ progress, total })
  live.current = { progress, total }

  useEffect(() => {
    let raf = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const elapsed = (performance.now() - born.current) / 1000
      const { progress, total } = live.current
      const steps = FIRST - LAST_LOADING + 1
      // The leader runs at its own pace, but never ahead of what has loaded (give up waiting after 15 s).
      const loaded = total > 0 ? progress / 100 : 0
      const byTime = Math.max(0, elapsed - PICTURE_START) / (PER_NUMBER * steps)
      const f = Math.min(elapsed > 15 ? 1 : loaded, byTime)
      const i = Math.min(steps - 1, Math.floor(f * steps))
      setShown({ ps: elapsed < PICTURE_START, n: FIRST - i, frac: f * steps - i })
      if (f >= 1) setReady(true)
      // A stalled load makes the frame jump, like film slipping in the gate.
      if (progress !== lastMove.current.p) lastMove.current = { p: progress, at: performance.now() }
      setJitter(performance.now() - lastMove.current.at > 1500 && f < 1 && byTime > f + 0.05)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  const go = () => {
    startAudio()
    sfx('click')
    start()
  }

  return (
    <div className="leader is-gate">
      <Celluloid />
      {shown.ps ? <PictureStart /> : <Dial n={ready ? 2 : shown.n} frac={ready ? 0 : shown.frac} jitter={jitter} />}
      <div className={`leader-gate${ready ? ' show' : ''}`}>
        <button className="gate-switch" onClick={go} disabled={!ready} autoFocus>
          <span className="gate-knob" />
          {t.ui.start}
        </button>
        <p className="gate-hint">{t.ui.startHint}</p>
      </div>
    </div>
  )
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))

/** After the click: the in-film part of scene 00, driven by film time. */
function Opening() {
  const t = useT()
  const { start, dur } = chapterById('countdown')
  // Quantised to film frames and clamped, so it stops re-rendering once the chapter is over.
  const local = useFilm((s) => Math.min(dur, Math.max(-1, Math.floor((s.time - start) * 24) / 24)))
  const popped = useRef(false)
  useEffect(() => {
    if (local < 0.1 && !popped.current) {
      popped.current = true
      sfx('beep')
    }
    if (local > 0.5) popped.current = false
  }, [local])
  if (local < 0 || local >= dur) return null

  const phase = local < T.two ? 'two' : local < T.black ? 'black' : local < T.title ? 'ident' : 'title'
  // The whole overlay fades away at the end, revealing the booth already running underneath.
  const out = 1 - clamp01((local - T.fadeOut) / (dur - T.fadeOut))
  const [d0, d1] = T.identDraw
  const [n0, n1] = T.identName
  return (
    <div className={`leader is-film phase-${phase}`} style={{ opacity: out }}>
      <Celluloid />
      {phase === 'two' && <Dial n={2} frac={local / T.two} jitter={false} />}
      {phase === 'ident' && (
        <div className="ident">
          <svg viewBox="0 0 100 100" className="ident-mark" aria-hidden>
            <path d={MONOGRAM} pathLength={1} style={{ strokeDashoffset: 1 - clamp01((local - d0) / (d1 - d0)) }} />
          </svg>
          <p className="ident-name" style={{ opacity: clamp01((local - n0) / (n1 - n0)) * (1 - clamp01((local - T.title + 0.5) / 0.5)) }}>
            Gabriel Lima <span>{t.presents}</span>
          </p>
        </div>
      )}
      {phase === 'title' && (
        <div className="title-card" style={{ opacity: clamp01((local - T.title) / 0.6) }}>
          <h1>{t.film}</h1>
          <p>{t.by}</p>
          <p className="title-tag">{t.tagline}</p>
        </div>
      )}
    </div>
  )
}

export function Leader() {
  const started = useFilm((s) => s.started)
  return started ? <Opening /> : <Gate />
}

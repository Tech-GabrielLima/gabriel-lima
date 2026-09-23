import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useFilm } from '../film/store'
import { startSound } from '../film/sound'
import { useLive } from '../live/live'
import { MONOGRAM } from '../ui/monogram'
import { LOBBY, type LobbyCopy } from './copy'
import { REDUCED, runLoop } from './loop'
import { usePreload } from './preload'
import { serialOf, useTicket } from './ticket'
import { createThread } from './thread'
import './lobby.css'

// The pieces both 2D acts are built from (ROTEIRO §0.1): Act I, the lobby,
// and Act III, the same house with its lights up. One language: the GL line
// that draws itself, the marquee's bulbs, the lantern, the ticket, the door.

export type Phase = 'intro' | 'lift' | 'hall' | 'opening'

export const useCopy = () => LOBBY[useFilm((s) => s.lang)]

/** How long the ident takes to draw, at least; it also waits for the fonts. */
const DRAW = 1.5
const TYPE_MS = 42

/* ---------------------------------------------------------------- intro */

/** The invitation at the end of the opening: browsers only let sound start from a click, so the visitor chooses. */
export interface SoundChoice {
  on: string
  off: string
  hint: string
  pick(sound: boolean): void
}

/**
 * The GL line draws itself (never ahead of the fonts), `title` and `line` type out under it, then it all lifts
 * into the nav. With a `choice`, the opening waits on it instead of lifting by itself.
 */
export function Intro({ phase, onDone, title, line, choice }: { phase: Phase; onDone: () => void; title: string; line: string; choice?: SoundChoice }) {
  const mark = useRef<SVGPathElement>(null)
  const [typed, setTyped] = useState(0)
  const [asking, setAsking] = useState(false)
  const done = useRef(onDone)
  useLayoutEffect(() => {
    done.current = onDone
  })
  const hasChoice = !!choice

  useEffect(() => {
    if (REDUCED) return done.current()
    let fonts = false
    document.fonts.ready.then(() => (fonts = true))
    const born = performance.now()
    let raf = 0
    let typingFrom = 0
    const total = title.length + line.length
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      const t = (now - born) / 1000
      // The stroke holds at 90% until the type has arrived: that is the real wait.
      const f = Math.min(t / DRAW, fonts ? 1 : 0.9)
      const eased = 1 - Math.pow(1 - f, 3)
      mark.current?.style.setProperty('stroke-dashoffset', String(1 - eased))
      if (f >= 1 && !typingFrom) typingFrom = now
      if (typingFrom) {
        const n = Math.min(total, Math.floor((now - typingFrom) / TYPE_MS))
        setTyped(n)
        if (now - typingFrom > total * TYPE_MS + 650) {
          cancelAnimationFrame(raf)
          finish()
        }
      }
    }
    // With a choice to make, the opening ends on it; without, it lifts by itself.
    const finish = () => {
      mark.current?.style.setProperty('stroke-dashoffset', '0')
      setTyped(total)
      if (hasChoice) setAsking(true)
      else done.current()
    }
    raf = requestAnimationFrame(tick)
    // Anyone in a hurry skips ahead (to the choice, if there is one; its buttons aren't a skip).
    const skip = (e: Event) => {
      if ((e.target as HTMLElement | null)?.closest?.('.intro-choice')) return
      cancelAnimationFrame(raf)
      finish()
      removeEventListener('keydown', skip)
      removeEventListener('wheel', skip)
      removeEventListener('pointerdown', skip)
    }
    addEventListener('keydown', skip)
    addEventListener('wheel', skip, { passive: true })
    addEventListener('pointerdown', skip)
    return () => {
      cancelAnimationFrame(raf)
      removeEventListener('keydown', skip)
      removeEventListener('wheel', skip)
      removeEventListener('pointerdown', skip)
    }
  }, [title, line, hasChoice])

  // At the choice: Enter is "with sound", Escape is "in silence".
  useEffect(() => {
    if (!asking || !choice) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') (e.preventDefault(), pick(true))
      else if (e.key === 'Escape') pick(false)
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  })
  const pick = (sound: boolean) => {
    if (!asking) return
    setAsking(false)
    choice?.pick(sound)
    done.current()
  }

  // Lift: the ident flies into the nav's mark (FLIP), the black lifts off the page.
  const markBox = useRef<SVGSVGElement>(null)
  useLayoutEffect(() => {
    if (phase !== 'lift') return
    const target = document.querySelector('.lobby-nav .lobby-mark')?.getBoundingClientRect()
    const el = markBox.current
    if (!target || !el) return
    mark.current?.style.setProperty('stroke-dashoffset', '0')
    const r = el.getBoundingClientRect()
    const s = target.width / r.width
    el.style.transform = `translate(${target.left - r.left}px, ${target.top - r.top}px) scale(${s})`
  }, [phase])

  if (phase !== 'intro' && phase !== 'lift') return null
  const titleShown = title.slice(0, typed)
  const lineShown = line.slice(0, Math.max(0, typed - title.length))
  return (
    <div className={`intro${phase === 'lift' ? ' lift' : ''}`}>
      <svg ref={markBox} className="intro-mark" viewBox="0 0 100 100" aria-hidden>
        <path ref={mark} d={MONOGRAM} pathLength={1} />
      </svg>
      <p className="intro-name">
        {titleShown}
        {typed <= title.length && typed > 0 && <i className="caret" />}
      </p>
      <p className="intro-line">
        {lineShown}
        {typed > title.length && !asking && <i className="caret" />}
      </p>
      {choice && (
        <div className={`intro-choice${asking ? ' show' : ''}`} aria-hidden={!asking}>
          <button className="intro-sound" onClick={() => pick(true)} autoFocus={asking} tabIndex={asking ? 0 : -1}>
            <span className="eq" aria-hidden>
              <i />
              <i />
              <i />
            </span>
            {choice.on}
          </button>
          <button className="intro-silent" onClick={() => pick(false)} tabIndex={asking ? 0 : -1}>
            {choice.off}
          </button>
          <p className="intro-hint">{choice.hint}</p>
        </div>
      )}
    </div>
  )
}

/** Intro → lift → hall, once per visit and act. */
export function usePhase(played: { current: boolean }) {
  const [phase, setPhase] = useState<Phase>(REDUCED || played.current ? 'hall' : 'intro')
  const introDone = () => {
    played.current = true
    setPhase((p) => (p === 'intro' ? 'lift' : p))
    setTimeout(() => setPhase((p) => (p === 'lift' ? 'hall' : p)), 900)
  }
  return [phase, setPhase, introDone] as const
}

/* ---------------------------------------------------------------- nav */

export interface NavLink {
  label: string
  go(): void
  hot?: boolean
}

export function Nav({ brand, links }: { brand: string; links: NavLink[] }) {
  const c = useCopy()
  const lang = useFilm((s) => s.lang)
  const setLang = useFilm((s) => s.setLang)
  const progress = usePreload((s) => s.progress)
  const ready = usePreload((s) => s.ready)
  const audience = useLive((s) => (s.status === 'live' ? (s.state?.audience ?? 0) : 0))
  const sound = useFilm((s) => s.sound)
  // Turning it on is a click, so it may start the sound (and the foyer's music) right here.
  const toggleSound = () => (sound ? useFilm.getState().toggleSound() : startSound())
  return (
    <nav className="lobby-nav">
      <svg className="lobby-mark" viewBox="0 0 100 100" aria-hidden>
        <path d={MONOGRAM} />
      </svg>
      <span className="lobby-brand">{brand}</span>
      <div className="lobby-links">
        {links.map((l) => (
          <button key={l.label} className={l.hot ? 'lobby-enter' : ''} onClick={l.go}>
            {l.label}
          </button>
        ))}
      </div>
      <button className={`lobby-sound${sound ? ' on' : ''}`} onClick={toggleSound} aria-label={sound ? c.soundOff : c.soundOn} title={sound ? c.soundOff : c.soundOn}>
        <span className="eq" aria-hidden>
          <i />
          <i />
          <i />
        </span>
      </button>
      <button className="lobby-lang" onClick={() => setLang(lang === 'en' ? 'pt' : 'en')} aria-label="Language">
        <b className={lang === 'en' ? 'on' : ''}>EN</b>/<b className={lang === 'pt' ? 'on' : ''}>PT</b>
      </button>
      {/* The projector's readout: who's here, this page's real frame rate, how much of the film has arrived. */}
      <span className="lobby-hud" aria-hidden>
        {audience > 0 && (
          <span className="hud-aud">
            <span className="ok">● {audience}</span> {c.audience} ·{' '}
          </span>
        )}
        <span data-fps>--</span> {c.fps} · {c.projector} <span className={ready ? 'ok' : ''}>{Math.round(progress * 100)}%</span>
      </span>
    </nav>
  )
}

/* ---------------------------------------------------------------- marquee */

/** The marquee's chasing bulbs: two dotted outlines, lit in turn. Sized to the box so the bulbs stay round. */
export function Bulbs() {
  const box = useRef<SVGSVGElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const el = box.current!
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const { w, h } = size
  const inset = 14
  // One bulb every ~26px, a whole number of them round the frame so the chase closes on itself.
  const per = Math.max(1, (2 * (w + h - 4 * inset)) / 26)
  const gap = (2 * (w + h - 4 * inset)) / Math.round(per)
  const rect = { x: inset, y: inset, width: Math.max(0, w - 2 * inset), height: Math.max(0, h - 2 * inset), rx: 18 }
  return (
    <svg ref={box} className="bulbs" viewBox={`0 0 ${w || 1} ${h || 1}`} aria-hidden>
      <rect {...rect} className="bulb a" style={{ strokeDasharray: `0 ${gap}` }} />
      <rect {...rect} className="bulb b" style={{ strokeDasharray: `0 ${gap}`, strokeDashoffset: -gap / 2 }} />
    </svg>
  )
}

/** Neon letters that flicker on one by one. */
export function Neon({ text }: { text: string }) {
  return (
    <>
      {text.split('').map((ch, i) => (
        <span key={i} style={{ animationDelay: `${0.15 + ((i * 7) % 11) * 0.07}s` }}>
          {ch === ' ' ? ' ' : ch}
        </span>
      ))}
    </>
  )
}

export function Marquee({ top, name, role, tag }: { top: string; name: string; role: string; tag: string }) {
  return (
    <div className="marquee-tilt" data-tilt data-anchor="0.5,1">
      <div className="marquee">
        <Bulbs />
        <p className="marquee-top">{top}</p>
        <h1 className="marquee-name" aria-label={name}>
          <Neon text={name} />
        </h1>
        <p className="marquee-role">{role}</p>
        <p className="marquee-tag">{tag}</p>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- ticket */

/** Tonight's ticket. In Act III it comes back with its stub torn and a stamp on it. */
export function TicketCard({ c, stamp }: { c: LobbyCopy; stamp?: string }) {
  const t = useTicket()
  const pt = c === LOBBY.pt
  const date = t.arrived.toLocaleDateString(pt ? 'pt-BR' : 'en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  const time = t.arrived.toLocaleTimeString(pt ? 'pt-BR' : 'en-GB', { hour: '2-digit', minute: '2-digit' })
  return (
    <div className="ticket-tilt" data-tilt="hover">
      <div className={`ticket${stamp ? ' torn' : ''}`}>
        <div className="ticket-main">
          <p className="t-admit">{c.ticket.admit}</p>
          <p className="t-title">Sessão Noturna</p>
          <p className="t-by">Gabriel Lima</p>
          <dl className="t-fields">
            <div>
              <dt>{c.ticket.hall}</dt>
              <dd>1</dd>
            </div>
            <div>
              <dt>{c.ticket.row}</dt>
              <dd>{t.row}</dd>
            </div>
            <div>
              <dt>{c.ticket.seat}</dt>
              <dd>{String(t.seat).padStart(2, '0')}</dd>
            </div>
            <div>
              <dt>{c.ticket.date}</dt>
              <dd>{date}</dd>
            </div>
            <div>
              <dt>{c.ticket.time}</dt>
              <dd>{time}</dd>
            </div>
          </dl>
        </div>
        <div className="ticket-stub">
          <svg viewBox="0 0 100 100" aria-hidden>
            <path d={MONOGRAM} />
          </svg>
          <p>{serialOf(t)}</p>
        </div>
        {stamp && (
          <span className="ticket-stamp" aria-label={stamp}>
            {stamp}
          </span>
        )}
        <div className="ticket-sheen" aria-hidden />
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- door */

/** The door to Hall 1. The light leaking under it is the film's loading bar; it opens only onto a warm film. */
export function DoorHall({ labels, phase, onOpen, doorRef, children }: { labels: LobbyCopy['door']; phase: Phase; onOpen: () => void; doorRef: React.RefObject<HTMLButtonElement | null>; children?: React.ReactNode }) {
  const progress = usePreload((s) => s.progress)
  const ready = usePreload((s) => s.ready)
  const [queued, setQueued] = useState(false)

  // Clicked while the projector was still warming: open the moment it's ready.
  useEffect(() => {
    if (queued && ready) onOpen()
  }, [queued, ready, onOpen])

  const open = phase === 'opening'
  const status = open ? labels.entering : ready ? labels.ready : labels.warming
  return (
    <section className="door-hall" id="door">
      <p className="door-sign">{labels.hall}</p>
      <button
        ref={doorRef}
        className={`door${ready ? ' ready' : ''}${open ? ' open' : ''}`}
        onClick={() => (ready ? onOpen() : setQueued(true))}
        aria-label={`${labels.enter}: ${status}`}
        style={{ '--p': progress } as React.CSSProperties}
      >
        <span className="door-inside" />
        <span className="leaf left">
          <span className="porthole" />
          <span className="push" />
        </span>
        <span className="leaf right">
          <span className="porthole" />
          <span className="push" />
        </span>
        <span className="door-gap" />
      </button>
      <span className="door-floor" style={{ '--p': progress } as React.CSSProperties} aria-hidden />
      <p className="door-status" aria-live="polite">
        {status}
        {!ready && !open && <b> · {Math.round(progress * 100)}%</b>}
        {ready && !open && <b> · {labels.hint}</b>}
      </p>
      {children}
    </section>
  )
}

/* ---------------------------------------------------------------- the stage */

/**
 * Runs a 2D act: the lantern and tilt loop, and the GL thread from the marquee
 * down to the door's frame (re-laid out whenever anything it hangs on moves).
 */
export function useStage(
  refs: {
    root: React.RefObject<HTMLDivElement | null>
    scroller: React.RefObject<HTMLDivElement | null>
    content: React.RefObject<HTMLDivElement | null>
    thread: React.RefObject<SVGSVGElement | null>
    door: React.RefObject<HTMLButtonElement | null>
  },
  onFrame?: (t: number, top: number) => void,
) {
  const frame = useRef(onFrame)
  useLayoutEffect(() => {
    frame.current = onFrame
  })
  useEffect(() => {
    const content = refs.content.current!
    const thread = createThread(content, refs.thread.current!, refs.door.current!)
    const relayout = () => thread.layout()
    relayout()
    document.fonts.ready.then(relayout)
    // The page's height isn't enough: a line of text changing inside a centred section moves the door without it.
    const ro = new ResizeObserver(relayout)
    // The door itself too: its size depends on styles that may land after the first layout.
    for (const el of [content, ...content.querySelectorAll('[data-anchor], .door, .door-status, .door-sign')]) ro.observe(el)
    const stop = runLoop(refs.root.current!, refs.scroller.current!, {
      onFrame: (t, top) => {
        thread.draw(top)
        frame.current?.(t, top)
      },
    })
    return () => {
      stop()
      ro.disconnect()
      thread.dispose()
    }
    // The refs are stable; the stage is built once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}

/** Sections that light up as they scroll into view (`.reveal` → `.reveal.in`). */
export function useReveal(root: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const els = root.current!.querySelectorAll('.reveal')
    if (REDUCED) return els.forEach((el) => el.classList.add('in'))
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && (e.target.classList.add('in'), io.unobserve(e.target))),
      { threshold: 0.18 },
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [root])
}

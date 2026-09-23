import { useEffect, useRef, useState } from 'react'
import { playSample, startSound } from '../film/sound'
import { useFilm } from '../film/store'
import { connectLive } from '../live/live'
import { LOBBY, type LobbyCopy } from './copy'
import { REDUCED } from './loop'
import { DoorHall, Intro, Marquee, Nav, TicketCard, useCopy, usePhase, useStage } from './parts'
import { goExit, usePreload } from './preload'

// ACT I · A FACHADA (ROTEIRO §0.1). The street side of the cinema, in plain
// DOM so it paints at once: the GL ident draws itself and the name is typed
// while the fonts arrive, then the marquee, the trailer reel, the programme,
// the ticket and the door. The film loads underneath; the door opens onto it.

/** The opening plays once per visit: walking back in from Act III skips it. */
const introPlayed = { current: false }

/* ---------------------------------------------------------------- hero */

function Hero({ c, now }: { c: LobbyCopy; now: Date }) {
  const time = now.toLocaleTimeString(c === LOBBY.pt ? 'pt-BR' : 'en-GB', { hour: '2-digit', minute: '2-digit' })
  return (
    <section className="hero" id="hero">
      {/* The wall behind the marquee: only the lantern shows what's written on it. */}
      <div className="wall" data-lit aria-hidden>
        <span className="scrawl s1">{c.signature}</span>
        <span className="scrawl s2">EST. 2022</span>
        <span className="scrawl s3">LET IT CRASH</span>
        <span className="scrawl s4">↓ 8 · 7 · 6 · 5</span>
        <span className="scrawl s5">pixel → silício</span>
      </div>
      <p className="hero-kicker">
        {c.cinema} · {c.tonight} · {time}
      </p>
      <Marquee top={c.nowShowing} name="Gabriel Lima" role={c.role} tag={c.tagline} />
      <p className="hero-scroll">{c.scroll} ↓</p>
    </section>
  )
}

/* ---------------------------------------------------------------- reel */

/** Chapter shown on each trailer frame (public/lobby/frame-N.webp, captured from the film). */
const FRAMES: [number, number][] = [
  [1, 0],
  [2, 1],
  [3, 2],
  [3, 2],
  [3, 2],
  [4, 3],
  [5, 4],
  [6, 5],
]

function Reel({ c, ring }: { c: LobbyCopy; ring: React.RefObject<HTMLDivElement | null> }) {
  return (
    <section className="reel" id="reel" data-anchor="g,0.08;g,0.7">
      <div className="reel-copy">
        <p className="kicker">{c.reel.kicker}</p>
        <h2>{c.reel.title}</h2>
        <p>{c.reel.body}</p>
        <ol className="reel-chapters">
          {c.reel.chapters.map((name, i) => (
            <li key={name}>
              <span>0{i + 1}</span> {name}
            </li>
          ))}
        </ol>
      </div>
      <div className="reel-stage" aria-hidden>
        <div className="reel-ring" ref={ring}>
          {FRAMES.map(([n, ch], i) => (
            <figure key={i} className="reel-frame" style={{ '--i': i } as React.CSSProperties}>
              <img src={`/lobby/frame-${i}.webp`} alt="" loading="lazy" decoding="async" width={480} height={270} />
              <figcaption>
                0{n} · {c.reel.chapters[ch]}
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ---------------------------------------------------------------- programme */

function Program({ c }: { c: LobbyCopy }) {
  const b = c.program.billing
  return (
    <section className="program" id="program" data-anchor="g,0.5">
      <p className="kicker">{c.program.kicker}</p>
      <p className="synopsis">{c.program.synopsis}</p>
      {/* A film poster's billing block. */}
      <div className="billing">
        <p className="b-small">{b[0]}</p>
        <p className="b-name">{b[1]}</p>
        <p className="b-small">{b[2]}</p>
        <p className="b-title">{b[3]}</p>
        {b.slice(4).map((l) => (
          <p key={l} className="b-line">
            {l}
          </p>
        ))}
      </div>
      <dl className="stats">
        {c.program.stats.map(([n, label]) => (
          <div key={label}>
            <dt>{n}</dt>
            <dd>{label}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

/* ---------------------------------------------------------------- lobby */

export function Lobby({ onWantFilm }: { onWantFilm: () => void }) {
  const c = useCopy()
  const back = useRef(introPlayed.current)
  const [phase, setPhase, introDone] = usePhase(introPlayed)
  const [now] = useState(() => new Date())
  const root = useRef<HTMLDivElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const thread = useRef<SVGSVGElement>(null)
  const ring = useRef<HTMLDivElement>(null)
  const door = useRef<HTMLButtonElement>(null)
  const leaving = usePreload((s) => s.act === 'film')

  // Walking back in from Act III: at the top, or straight at the door.
  useEffect(() => {
    if (back.current && usePreload.getState().lobbyAt === 'door') requestAnimationFrame(() => document.getElementById('door')?.scrollIntoView({ block: 'end' }))
  }, [])

  // The film starts loading once the opening has played, so it never competes with it; so does the live wire.
  useEffect(() => {
    if (phase === 'intro') return
    connectLive()
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }
    if (w.requestIdleCallback) w.requestIdleCallback(onWantFilm, { timeout: 800 })
    else setTimeout(onWantFilm, 200)
  }, [phase, onWantFilm])

  // The reel turns slowly by itself and faster while the page scrolls past it.
  const spin = useRef({ a: 0, t: 0, top: 0 })
  useStage({ root, scroller, content, thread, door }, (t, top) => {
    const s = spin.current
    const dt = s.t ? Math.min(0.1, t - s.t) : 0
    if (!REDUCED) s.a += dt * 7 + (top - s.top) * 0.12
    s.t = t
    s.top = top
    ring.current?.style.setProperty('--spin', `${(-s.a).toFixed(2)}deg`)
  })

  const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: id === 'door' ? 'end' : 'start' })

  const openDoor = () => {
    if (phase === 'opening') return
    setPhase('opening')
    // Inside the click: the film starts its sound now (browsers only allow it on a gesture).
    usePreload.getState().enter?.()
    void playSample('sfx-door', 0, 0.8)
  }
  // The opening ends on the sound invitation: the foyer's jazz starts with the click.
  const pickSound = (on: boolean) => (on ? startSound() : useFilm.getState().sound && useFilm.getState().toggleSound())

  return (
    <div ref={root} className={`lobby phase-${phase}${back.current ? ' arrive' : ''}${leaving ? ' leaving' : ''}`}>
      <div className="lobby-grain" aria-hidden />
      <Nav
        brand="Sessão Noturna"
        links={[
          { label: c.nav.film, go: () => go('reel') },
          { label: c.nav.ticket, go: () => go('ticket') },
          { label: c.nav.live, go: goExit },
          { label: `${c.nav.enter} ▸`, go: () => go('door'), hot: true },
        ]}
      />
      <div ref={scroller} className="lobby-scroll">
        <div ref={content} className="lobby-content">
          <svg ref={thread} className="thread" aria-hidden />
          <Hero c={c} now={now} />
          <Reel c={c} ring={ring} />
          <Program c={c} />
          <section className="box-office" id="ticket" data-anchor="g,0.3;g,0.95">
            <div className="box-copy">
              <p className="kicker">{c.ticket.kicker}</p>
              <h2>{c.ticket.title}</h2>
              <p>{c.ticket.note}</p>
            </div>
            <TicketCard c={c} />
          </section>
          <DoorHall labels={c.door} phase={phase} onOpen={openDoor} doorRef={door} />
        </div>
      </div>
      <div className="lobby-dark" aria-hidden />
      <div className="flood" aria-hidden />
      <Intro phase={phase} onDone={introDone} title="Gabriel Lima" line={c.intro} choice={{ ...c.sound, pick: pickSound }} />
    </div>
  )
}

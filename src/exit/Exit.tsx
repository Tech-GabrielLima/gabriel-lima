import { useEffect, useRef, useState } from 'react'
import { CONTACT } from '../content/contact'
import { PROJECTS, projectById, type DoorId } from '../content/projects'
import { useFilm } from '../film/store'
import { DoorHall, Intro, Marquee, Nav, TicketCard, useCopy, usePhase, useReveal, useStage } from '../lobby/parts'
import { REDUCED } from '../lobby/loop'
import { goLobby, usePreload } from '../lobby/preload'
import { audioContext, playSample, startSound } from '../film/sound'
import { connectLive, useLive } from '../live/live'
import { BookPanel, HalePlayground, LiveBadge, MachineRoom, RaftPanel } from '../live/widgets'
import { MONOGRAM } from '../ui/monogram'
import { EXIT, type ExitCopy } from './copy'
import './exit.css'

// ACT III · LUZES ACESAS (ROTEIRO §0.1). The same house as Act I, after the
// session: the lights are half up, the marquee now reads "live", and the GL
// line runs again, past the projects running for real, down to the door of
// Hall 1 for another session. Reached through the exit door by the phone at
// the end of the film, from the lobby ("Live"), or with ?exit.

/** Each opening plays once per visit: "The End." after the film, "Live." when arriving early. */
const played = { seen: { current: false }, early: { current: false } }

const MORE: DoorId[] = ['flight', 'ledger', 'nabla', 'cuda']

function Exhibit({ id, n, text, url, children }: { id: string; n: string; text: [string, string, string]; url?: string; children: React.ReactNode }) {
  const [kicker, title, body] = text
  return (
    <section className="exhibit reveal" id={id} data-anchor="g,0.06;g,0.94">
      <header className="ex-head">
        <span className="ex-num" aria-hidden>
          {n}
        </span>
        <div>
          <p className="kicker">{kicker}</p>
          <h2>{title}</h2>
          <p className="ex-body">
            {body}
            {url && (
              <>
                {' '}
                <a href={url} target="_blank" rel="noreferrer">
                  GitHub ↗
                </a>
              </>
            )}
          </p>
        </div>
      </header>
      <div className="ex-case">{children}</div>
    </section>
  )
}

function Hero({ x }: { x: ExitCopy }) {
  const lang = useFilm((s) => s.lang)
  const [now] = useState(() => new Date())
  const audience = useLive((s) => (s.status === 'live' ? (s.state?.audience ?? 0) : 0))
  const time = now.toLocaleTimeString(lang === 'pt' ? 'pt-BR' : 'en-GB', { hour: '2-digit', minute: '2-digit' })
  return (
    <section className="hero" id="hero">
      <div className="wall" data-lit aria-hidden>
        {x.scrawls.map((s, i) => (
          <span key={s} className={`scrawl s${i + 1}`}>
            {s}
          </span>
        ))}
      </div>
      <p className="hero-kicker">
        {x.kicker} · {time}
        {audience > 0 && <span className="exit-aud"> · ● {audience} {lang === 'pt' ? 'na sala' : 'in the room'}</span>}
      </p>
      <Marquee {...x.marquee} />
      <LiveBadge lang={lang} />
      <p className="hero-scroll">{x.scroll} ↓</p>
    </section>
  )
}

/** The GL line draws itself one last time as the credits come into view, and ends on the address. */
function Signature() {
  const ref = useRef<SVGSVGElement>(null)
  const [drawn, setDrawn] = useState(false)
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setDrawn(true), { threshold: 0.5 })
    io.observe(ref.current!)
    return () => io.disconnect()
  }, [])
  return (
    <svg ref={ref} className={`exit-sign${drawn ? ' drawn' : ''}`} viewBox="0 0 100 100" aria-hidden>
      <path d={MONOGRAM} pathLength={1} />
    </svg>
  )
}

export default function Exit({ onWantFilm }: { onWantFilm: () => void }) {
  const lang = useFilm((s) => s.lang)
  const x = EXIT[lang]
  const c = useCopy()
  const seen = usePreload((s) => s.entered)
  const leaving = usePreload((s) => s.act === 'film')
  const variant = useRef(seen ? 'seen' : 'early').current as 'seen' | 'early'
  const back = useRef(played[variant].current)
  const [phase, setPhase, introDone] = usePhase(played[variant])
  const [copied, setCopied] = useState(false)

  const root = useRef<HTMLDivElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const thread = useRef<SVGSVGElement>(null)
  const door = useRef<HTMLButtonElement>(null)
  useStage({ root, scroller, content, thread, door })
  useReveal(content)

  useEffect(() => {
    document.title = lang === 'pt' ? 'Luzes acesas · Gabriel Lima' : 'Lights up · Gabriel Lima'
    return () => void (document.title = 'Night Session · Gabriel Lima')
  }, [lang])

  // After the opening: the live wire, and the film warming behind Hall 1's door.
  useEffect(() => {
    if (phase === 'intro') return
    connectLive()
    const t = setTimeout(onWantFilm, 400)
    return () => clearTimeout(t)
  }, [phase, onWantFilm])

  const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: id === 'door' ? 'end' : 'start' })
  const openDoor = () => {
    if (phase === 'opening') return
    setPhase('opening')
    // Inside the click, so the film's sound can start.
    usePreload.getState().enter?.()
    void playSample('sfx-door', 0, 0.8)
  }
  // Arriving straight here (?exit), sound hasn't been offered yet: the opening offers it.
  const [offerSound] = useState(() => !audioContext())
  const pickSound = (on: boolean) => (on ? startSound() : useFilm.getState().sound && useFilm.getState().toggleSound())
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(CONTACT.email)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      /* the address is selectable anyway */
    }
  }

  return (
    <div ref={root} className={`lobby act3 phase-${phase}${back.current ? ' arrive' : ''}${leaving ? ' leaving' : ''}`}>
      <div className="exit-houselights" aria-hidden />
      <div className="lobby-grain" aria-hidden />
      <Nav
        brand={x.brand}
        links={[
          { label: x.nav.lobby, go: () => goLobby('top') },
          { label: x.nav.live, go: () => go('raft') },
          { label: x.nav.contact, go: () => go('credits') },
          { label: x.nav.hall, go: () => go('door'), hot: true },
        ]}
      />
      <div ref={scroller} className="lobby-scroll">
        <div ref={content} className="lobby-content">
          <svg ref={thread} className="thread" aria-hidden />
          <Hero x={x} />

          <Exhibit id="raft" n="01" text={x.exhibits.raft} url={projectById('raft').url}>
            <RaftPanel lang={lang} />
          </Exhibit>
          <Exhibit id="match" n="02" text={x.exhibits.match} url={projectById('match').url}>
            <BookPanel lang={lang} />
          </Exhibit>
          <Exhibit id="hale" n="03" text={x.exhibits.hale} url={projectById('hale').url}>
            <HalePlayground lang={lang} />
          </Exhibit>
          <Exhibit id="machine" n="04" text={x.exhibits.room}>
            <MachineRoom lang={lang} />
          </Exhibit>

          {/* The rest of the programme, as posters in the foyer. */}
          <section className="posters reveal" id="more" data-anchor="g,0.5">
            <p className="kicker">{x.more.kicker}</p>
            <h2>{x.more.title}</h2>
            <ul>
              {MORE.map((id) => {
                const p = PROJECTS.find((q) => q.id === id)!
                return (
                  <li key={id} className="poster-tilt" data-tilt="hover" style={{ '--c': p.light } as React.CSSProperties}>
                    <div className="poster">
                      <p className="p-tag">{p.tag}</p>
                      <p className="p-title">{p.title}</p>
                      <p className="p-hook">{p.hook[lang]}</p>
                      <p className="p-stack">{p.stack}</p>
                      {p.url && (
                        <a href={p.url} target="_blank" rel="noreferrer">
                          {x.more.code} ↗
                        </a>
                      )}
                      <span className="ticket-sheen" aria-hidden />
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>

          {/* The same ticket as in the lobby, back from the session. */}
          <section className="box-office reveal" id="ticket" data-anchor="g,0.3;g,0.95">
            <div className="box-copy">
              <p className="kicker">{x.ticket.kicker}</p>
              <h2>{x.ticket.title}</h2>
              <p>{seen ? x.ticket.seen : x.ticket.early}</p>
            </div>
            <TicketCard c={c} stamp={seen ? x.ticket.stampSeen : x.ticket.stampEarly} />
          </section>

          <section className="exit-credits reveal" id="credits" data-anchor="g,0.5">
            <Signature />
            <p className="kicker">{x.credits.kicker}</p>
            <h2>{x.credits.title}</h2>
            <p className="ex-body">{x.credits.body}</p>
            <div className="exit-contact">
              <a className="exit-mail" href={`mailto:${CONTACT.email}`}>
                {CONTACT.email}
              </a>
              <button onClick={copy}>{copied ? x.credits.copied : x.credits.copy}</button>
            </div>
            <div className="exit-ways">
              <a href={`https://wa.me/${CONTACT.whatsapp}`} target="_blank" rel="noreferrer">
                WhatsApp {CONTACT.whatsappLabel}
              </a>
              <a href={CONTACT.github} target="_blank" rel="noreferrer">
                GitHub ↗
              </a>
            </div>
            <p className="exit-fin">“{x.credits.fin}”</p>
          </section>

          <DoorHall labels={seen ? x.door.seen : x.door.early} phase={phase} onOpen={openDoor} doorRef={door}>
            <button className="to-lobby" onClick={() => goLobby('top')}>
              {x.lobby}
            </button>
          </DoorHall>
        </div>
      </div>
      <div className="lobby-dark" aria-hidden />
      <div className="flood" aria-hidden />
      <Intro phase={phase} onDone={introDone} title={x.intro[variant][0]} line={x.intro[variant][1]} choice={offerSound ? { ...c.sound, pick: pickSound } : undefined} />
    </div>
  )
}

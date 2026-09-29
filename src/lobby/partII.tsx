import { useEffect, useRef, useState } from 'react'
import { FRAME_COUNT } from '../cinema/frames'
import { countTry, fetchCounts, fetchStubs, findFrame, useProgress } from '../cinema/progress'
import { usherSays } from '../cinema/usher'
import { ABOUT, MILESTONES } from '../content/about'
import { CONTACT } from '../content/contact'
import { PROJECTS } from '../content/projects'
import { CONSTELLATIONS } from '../content/skills'
import { playSample } from '../film/sound'
import { Console } from '../gl1/Console'
import { openCabin0 } from '../finale/state'
import { useFilm } from '../film/store'
import './partII.css'

// Act I, Part II (ROTEIRO §0.4.4): what the lobby hides. The Cabin 0 door and
// its reader, Hall 2 "coming soon", a bulb that talks in Morse, the buttons
// you shouldn't click, the drawer of real stubs, the box office's own
// terminal (a GL-1 logged in as `caixa`), the Express Session for whoever is
// in a hurry, and the résumé that Ctrl+P prints.

const usePt = () => useFilm((s) => s.lang) === 'pt'

/** Keep the light (the cursor, or a finger) on it for `ms`: then it happens, once. */
function useHold(ms: number, onDone: () => void) {
  const timer = useRef(0)
  const done = useRef(false)
  const start = () => {
    if (done.current) return
    clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      done.current = true
      onDone()
    }, ms)
  }
  const stop = () => clearTimeout(timer.current)
  useEffect(() => () => clearTimeout(timer.current), [])
  return { onPointerEnter: start, onPointerLeave: stop, onPointerDown: start, onPointerUp: stop, onPointerCancel: stop }
}

/* ---------------------------------------------------------------- frame 2: the bulb */

// G = --.  L = .-..  (one unit = 180 ms), then a long pause.
const MORSE = [3, 1, 3, 1, 1, 3, 1, 1, 3, 1, 1, 1, 1, 7]

/** One bulb on the marquee that doesn't chase with the others: it spells GL. */
export function MorseBulb() {
  const pt = usePt()
  const [on, setOn] = useState(false)
  const [solved, setSolved] = useState(false)
  useEffect(() => {
    if (solved) return
    let i = 0
    let t = 0
    const step = () => {
      setOn(i % 2 === 0 && i < MORSE.length - 1)
      t = window.setTimeout(step, MORSE[i] * 180)
      i = (i + 1) % MORSE.length
    }
    step()
    return () => clearTimeout(t)
  }, [solved])
  const hold = useHold(2400, () => {
    setSolved(true)
    findFrame('morse')
    usherSays(pt ? '— — ·   · — · ·   Isso é GL. Você leu uma lâmpada.' : '— — ·   · — · ·   That spells GL. You read a light bulb.', true)
  })
  return <span className={`morse-bulb${on || solved ? ' on' : ''}`} {...hold} aria-hidden />
}

/* ---------------------------------------------------------------- frame 1: cabin 0 */

export function Cabin0() {
  const pt = usePt()
  const found = useProgress((s) => s.found.length)
  const [denied, setDenied] = useState(0)
  const tries = useRef(0)
  const knock = () => {
    if (found >= FRAME_COUNT) {
      // 48 holes: the reader reads the card and the door opens (src/finale/).
      openCabin0()
      return
    }
    tries.current++
    setDenied(Date.now())
    void playSample('sfx-zap', 0, 0.35)
    findFrame('door0')
    if (tries.current === 3) usherSays(pt ? 'A leitora não aceita insistência. Aceita furos.' : "The reader doesn't take persistence. It takes holes.")
  }
  return (
    <div className="cabin0">
      <p className="cabin0-sign">
        {pt ? 'Cabine 0' : 'Cabin 0'}
        <small>{pt ? 'Somente pessoal autorizado' : 'Authorised staff only'}</small>
      </p>
      <button className="cabin0-door" onClick={knock} aria-label={pt ? `Cabine 0: trancada, ${found} de ${FRAME_COUNT}` : `Cabin 0: locked, ${found} of ${FRAME_COUNT}`}>
        <span className="cabin0-reader" key={denied}>
          <span className={`cabin0-led${denied ? ' denied' : ''}`}>{denied ? (pt ? 'ACESSO NEGADO' : 'ACCESS DENIED') : `${String(found).padStart(2, '0')}/${FRAME_COUNT}`}</span>
          <span className="cabin0-slot" />
        </span>
        <span className="cabin0-plate" />
      </button>
      <p className="cabin0-note">{pt ? 'a leitora espera um cartão perfurado' : 'the reader wants a punched card'}</p>
    </div>
  )
}

/* ---------------------------------------------------------------- frame 7: hall 2 */

export function Hall2() {
  const pt = usePt()
  const [heard, setHeard] = useState(false)
  const hold = useHold(3000, () => {
    setHeard(true)
    findFrame('hall2')
    void playSample('amb-projector', 0, 0.5)
  })
  return (
    <div className={`hall2${heard ? ' heard' : ''}`} {...hold}>
      <p className="hall2-sign">{pt ? 'Sala 2 · em breve' : 'Hall 2 · coming soon'}</p>
      <span className="hall2-door" aria-hidden>
        <span className="hall2-light" />
      </span>
      <p className="hall2-note">{heard ? (pt ? 'do outro lado, um projetor. O filme de todo mundo que chegar até o fim.' : 'on the other side, a projector. The film of everyone who makes it to the end.') : pt ? 'encoste a luz e escute' : 'hold the light there and listen'}</p>
    </div>
  )
}

/* ---------------------------------------------------------------- frame 8: don't click */

export function DontClick() {
  const pt = usePt()
  const [stage, setStage] = useState(0)
  const [share, setShare] = useState<number | null>(null)
  const asked = useRef(false)
  const hover = () => {
    if (asked.current || stage > 1) return
    asked.current = true
    void fetchCounts().then((c) => {
      if (c?.dontclick && c.visitors) setShare(Math.round((100 * c.dontclick) / c.visitors))
    })
    usherSays(pt ? 'Você vai clicar, não vai?' : "You're going to click it, aren't you?")
  }
  const click = async () => {
    if (stage === 0) {
      setStage(1)
      const r = await countTry('dontclick')
      usherSays(pt ? `Previsível.${r ? ` Você é a ${r.n}ª pessoa.` : ''}` : `Predictable.${r ? ` You're number ${r.n}.` : ''}`, true)
      return
    }
    if (stage === 1) {
      setStage(2)
      const r = await countTry('reallydontclick')
      findFrame('dontclick')
      usherSays(pt ? `Eu literalmente troquei o botão.${r ? ` ${r.n} pessoas fizeram isso.` : ''}` : `I literally changed the button.${r ? ` ${r.n} people did that.` : ''}`, true)
    }
  }
  return (
    <div className="dontclick">
      <button className={`dc-btn s${stage}`} onPointerEnter={hover} onClick={click} disabled={stage > 1}>
        {stage === 0 ? (pt ? 'Não clique' : "Don't click") : stage === 1 ? (pt ? 'Sério. Não clique.' : "Really. Don't click.") : '…'}
      </button>
      {share !== null && stage === 0 && <p className="dc-share">{pt ? `${share}% das pessoas clicam` : `${share}% of people click`}</p>}
    </div>
  )
}

/* ---------------------------------------------------------------- frame 5: the drawer */

export function Stubs() {
  const pt = usePt()
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchStubs>>>(null)
  useEffect(() => {
    if (open && !data) void fetchStubs().then(setData)
  }, [open, data])
  const fmt = (t: number) => new Date(t).toLocaleString(pt ? 'pt-BR' : 'en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  const me = useProgress((s) => s.ticket?.n)
  return (
    <div className={`stubs${open ? ' open' : ''}`}>
      <button className="stubs-drawer" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {pt ? 'Gaveta de canhotos' : 'The stub drawer'} <span aria-hidden>{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="stubs-list">
          {!data && <p className="stubs-empty">{pt ? 'a gaveta emperrou (o servidor está dormindo)' : 'the drawer is stuck (the server is asleep)'}</p>}
          {data?.last
            .filter((s) => s.n !== 1)
            .map((s, i) => (
              <span key={s.n} className={`stub${s.n === me ? ' mine' : ''}`} style={{ '--r': `${((s.n * 37) % 11) - 5}deg`, '--i': i } as React.CSSProperties}>
                <b>Nº {String(s.n).padStart(6, '0')}</b>
                <small>{s.n === me ? (pt ? 'o seu' : 'yours') : fmt(s.created)}</small>
              </span>
            ))}
          {data?.first && (
            <button
              className="stub first"
              onClick={() => {
                findFrame('stub1')
                usherSays(pt ? 'O primeiro. Foi ele mesmo, testando se a porta abria.' : 'The first one. He bought it himself, to see if the door opened.', true)
              }}
            >
              <b>Nº 000001</b>
              <small>{fmt(data.first.created)}</small>
              <i>G. Lima</i>
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/* ---------------------------------------------------------------- the box office's terminal */

export function BoxTerminal() {
  return (
    <Console
      user={2}
      skin="crt"
      label={{ en: 'The box office terminal', pt: 'O terminal do caixa' }}
      hint={{ en: 'GL-1 · user caixa · the box office database is a real PostgreSQL (type psql)', pt: 'GL-1 · usuário caixa · o banco da bilheteria é um PostgreSQL de verdade (digite psql)' }}
    />
  )
}

/* ---------------------------------------------------------------- the Express Session and the résumé */

/** Everything a recruiter needs, in one sheet: the Express Session opens it, Ctrl+P prints it. */
export function Resume({ pt }: { pt: boolean }) {
  const lang = pt ? 'pt' : 'en'
  return (
    <article className="resume">
      <header>
        <h2>Gabriel Lima</h2>
        <p className="resume-hook">{ABOUT.hook[lang]}</p>
        <p className="resume-contact">
          <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a> · <a href={`https://wa.me/${CONTACT.whatsapp}`}>WhatsApp {CONTACT.whatsappLabel}</a> · <a href={CONTACT.github}>github.com/Tech-GabrielLima</a>
        </p>
        <p className="resume-status">{CONTACT.status[lang]}</p>
      </header>
      <section>
        <h3>{pt ? 'Sobre' : 'About'}</h3>
        <p>{ABOUT.body[lang]}</p>
      </section>
      <section>
        <h3>{pt ? 'Experiência' : 'Experience'}</h3>
        <ul>
          {MILESTONES.filter((m) => !m.future).map((m) => (
            <li key={m.title.en}>
              <b>{m.year}</b> {m.title[lang]}: {m.line[lang]}
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h3>{pt ? 'Projetos' : 'Projects'}</h3>
        <ul>
          {PROJECTS.filter((p) => p.url).map((p) => (
            <li key={p.id}>
              <b>{p.title}</b> ({p.stack}): {p.hook[lang]} <a href={p.url}>{p.url?.replace('https://', '')}</a>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h3>Stack</h3>
        <ul>
          {CONSTELLATIONS.map((c) => (
            <li key={c.id}>
              <b>{c.name[lang]}</b>: {c.stars.join(', ')}
            </li>
          ))}
        </ul>
      </section>
    </article>
  )
}

export function Express() {
  const pt = usePt()
  const [open, setOpen] = useState(false)
  return (
    <div className="express">
      <p className="kicker">{pt ? 'Sessão Expressa · 30 segundos' : 'Express Session · 30 seconds'}</p>
      <nav className="express-links">
        <button onClick={() => setOpen(true)}>{pt ? 'Sobre e experiência' : 'About & experience'}</button>
        <button onClick={() => setOpen(true)}>{pt ? 'Projetos' : 'Projects'}</button>
        <button onClick={() => window.print()}>{pt ? 'Currículo (PDF)' : 'Résumé (PDF)'}</button>
        <a href={CONTACT.github} target="_blank" rel="noreferrer">
          GitHub
        </a>
        <a href={`mailto:${CONTACT.email}`}>{pt ? 'Contato' : 'Contact'}</a>
      </nav>
      {open && (
        <div className="express-sheet" role="dialog" aria-modal="true" aria-label={pt ? 'Sessão Expressa' : 'Express Session'} onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="express-card">
            <button className="express-close" onClick={() => setOpen(false)} aria-label={pt ? 'Fechar' : 'Close'}>
              ×
            </button>
            <Resume pt={pt} />
            <button className="express-print" onClick={() => window.print()}>
              {pt ? 'Imprimir / salvar em PDF' : 'Print / save as PDF'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/** What paper gets: the résumé, and nothing else. */
export function PrintSheet() {
  const pt = usePt()
  return (
    <div className="print-sheet" aria-hidden>
      <Resume pt={pt} />
    </div>
  )
}

import { useEffect, useState } from 'react'
import { findFrame } from '../cinema/progress'
import { usherSays } from '../cinema/usher'
import { useFilm } from '../film/store'
import './droste.css'

// Frame 46: the GL Navigator, in the machine room, opens the site inside the
// site. Each level is a lighter page (?droste=N) that opens the next one; at
// depth 3 the innermost says "That's enough." and tells the top window.

const DEPTH = Number(new URLSearchParams(location.search).get('droste') ?? 0)
const MAX = 3

function Frame({ depth }: { depth: number }) {
  const lang = useFilm((s) => s.lang)
  return (
    <div className="droste-frame">
      <div className="droste-bar">
        <span className="droste-dots" aria-hidden />
        <span className="droste-url">
          {location.host}/?droste={depth}
        </span>
      </div>
      <iframe title={`GL Navigator ${depth}`} src={`/?droste=${depth}&lang=${lang}&cinema=off&live=off`} loading="lazy" />
    </div>
  )
}

/** In Act III: the navigator, closed until asked. */
export function Navigator() {
  const lang = useFilm((s) => s.lang)
  const pt = lang === 'pt'
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const on = (e: MessageEvent) => {
      if (e.origin !== location.origin || e.data !== 'droste:enough') return
      findFrame('droste')
      usherSays(pt ? 'Já chega. (Três cinemas dentro de um cinema.)' : "That's enough. (Three cinemas inside a cinema.)", true)
    }
    addEventListener('message', on)
    return () => removeEventListener('message', on)
  }, [pt])
  return (
    <div className="droste">
      {open ? (
        <Frame depth={1} />
      ) : (
        <button className="droste-open" onClick={() => setOpen(true)}>
          ⧉ {pt ? 'Abrir este site aqui dentro' : 'Open this site in here'}
        </button>
      )}
      <p className="droste-note">{pt ? 'GL Navigator · o site, aberto dentro dele mesmo' : 'GL Navigator · the site, opened inside itself'}</p>
    </div>
  )
}

/** A level of the recursion: the page an iframe shows. */
export default function DrostePage() {
  const lang = useFilm((s) => s.lang)
  const pt = lang === 'pt'
  useEffect(() => {
    if (DEPTH >= MAX) window.top?.postMessage('droste:enough', location.origin)
  }, [])
  return (
    <div className="droste-page">
      <p className="droste-kicker">
        Sessão Noturna · {pt ? 'profundidade' : 'depth'} {DEPTH}
      </p>
      <h1>{DEPTH >= MAX ? (pt ? 'Já chega.' : "That's enough.") : 'Gabriel Lima'}</h1>
      {DEPTH < MAX ? <Frame depth={DEPTH + 1} /> : <p className="droste-note">{pt ? '— o lanterninha' : '— the usher'}</p>}
    </div>
  )
}

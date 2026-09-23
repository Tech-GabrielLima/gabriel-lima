import { useEffect, useState } from 'react'
import { useCaption } from '../film/caption'
import { EGG_COUNT, useEggs } from '../film/eggs'
import { chapterAt } from '../film/chapters'
import { useFilm } from '../film/store'
import { useT } from '../i18n'
import { MONOGRAM } from './monogram'

/** Aspect ratio of the picture: scope in watch mode, opening to 16:9 when the visitor takes control. */
const ASPECT = { watch: 2.39, explore: 16 / 9 }

/** Cinema letterbox bars. Their height is written to --bar so the UI can sit inside them. */
export function Letterbox() {
  const mode = useFilm((s) => s.mode)
  const [size, setSize] = useState({ w: innerWidth, h: innerHeight })
  useEffect(() => {
    const on = () => setSize({ w: innerWidth, h: innerHeight })
    addEventListener('resize', on)
    return () => removeEventListener('resize', on)
  }, [])
  // Portrait screens can't letterbox a scope picture; they keep a thin bar so the player still has a home.
  const bar = size.w < size.h ? 56 : Math.max(56, (size.h - size.w / ASPECT[mode]) / 2)
  useEffect(() => document.documentElement.style.setProperty('--bar', `${bar}px`), [bar])
  return (
    <div className="letterbox" aria-hidden>
      <div className="bar top" />
      <div className="bar bottom" />
    </div>
  )
}

/** Distributor-style mark, film title and current chapter in the top bar. */
export function TopBar() {
  const t = useT()
  const ch = useFilm((s) => chapterAt(s.time))
  return (
    <header className="topbar">
      <svg className="mark" viewBox="0 0 100 100" aria-hidden>
        <path d={MONOGRAM} />
      </svg>
      <span className="title">{t.film}</span>
      <EggCount />
      <span className="chapter" style={{ color: ch.accent }}>
        {ch.n} · {t.chapters[ch.id]}
      </span>
    </header>
  )
}

/** Easter eggs found, shown once the first one turns up (ROTEIRO §5). */
function EggCount() {
  const t = useT()
  const n = useEggs((s) => s.found.length)
  if (!n) return null
  return (
    <span className="eggs" title={t.ui.eggs}>
      🥚 {n}/{EGG_COUNT}
    </span>
  )
}

export function ExploreHint() {
  const t = useT()
  const mode = useFilm((s) => s.mode)
  return <div className={`hint${mode === 'explore' ? ' show' : ''}`}>{t.ui.exploreHint}</div>
}

/** Lower-third title card for whatever the scene is showing (see film/caption.ts). */
const NARROW = '(max-width: 760px), (max-aspect-ratio: 4/5)'

/** True on phone-shaped screens, where captions collapse into a small drawer. */
function useNarrow() {
  const [narrow, setNarrow] = useState(() => matchMedia(NARROW).matches)
  useEffect(() => {
    const m = matchMedia(NARROW)
    const on = () => setNarrow(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  return narrow
}

export function LowerThird() {
  const t = useT()
  const caption = useCaption((s) => s.caption)
  const close = useCaption((s) => s.close)
  const narrow = useNarrow()
  const [expanded, setExpanded] = useState(false)
  const key = caption ? caption.title + (caption.open ? '·open' : '') : ''
  // A new caption always starts collapsed.
  useEffect(() => setExpanded(false), [key])
  if (!caption) return null

  // On a phone the card is a drawer: kicker, title and one line, with the rest a tap away.
  const full = !narrow || expanded
  const more = narrow && !!(caption.body || caption.details || caption.line || caption.url)
  return (
    <aside
      key={key}
      className={`lower${caption.open ? ' is-open' : ''}${narrow ? ' is-narrow' : ''}${expanded ? ' is-expanded' : ''}`}
      style={{ ['--accent' as string]: caption.accent ?? 'var(--amber)' }}
      aria-live="polite"
    >
      <p className="lower-kicker">{caption.kicker}</p>
      <h2 className="lower-title">{caption.title}</h2>
      {caption.hook && <p className="lower-hook">{caption.hook}</p>}
      {full && caption.open && caption.body && <p className="lower-body">{caption.body}</p>}
      {full && caption.line && <p className="lower-line">{caption.line}</p>}
      {full && caption.open && caption.details && (
        <details className="lower-details">
          <summary>{t.ui.howItWorks}</summary>
          <p>{caption.details}</p>
          {caption.stack && <p className="lower-stack">{caption.stack}</p>}
        </details>
      )}
      {(caption.url || close || caption.action || more) && (
        <p className="lower-actions">
          {caption.action && (
            <button className="lower-cta" onClick={caption.action.run}>
              {caption.action.label}
            </button>
          )}
          {more && (
            <button className="lower-more" onClick={() => setExpanded((e) => !e)} aria-expanded={expanded}>
              {expanded ? `− ${t.ui.less}` : `+ ${t.ui.more}`}
            </button>
          )}
          {full && caption.url && (
            <a href={caption.url} target="_blank" rel="noreferrer">
              {t.ui.viewCode} ↗
            </a>
          )}
          {close && (
            <button onClick={close}>
              ← {t.ui.back} {!narrow && <kbd>Esc</kbd>}
            </button>
          )}
        </p>
      )}
    </aside>
  )
}

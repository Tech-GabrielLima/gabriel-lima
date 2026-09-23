import { useEffect, useRef } from 'react'
import { XrayButton } from '../xray/XrayUI'
import { useShallow } from 'zustand/react/shallow'
import { CHAPTERS, TOTAL, chapterAt, chapterById, timecode } from '../film/chapters'
import { useFilm } from '../film/store'
import { useT } from '../i18n'
import { useTextVersion } from './TextVersion'

/** Film timecode, re-rendered only when the frame number changes. */
function Timecode() {
  const tc = useFilm((s) => timecode(s.time))
  return <span className="tc">{tc}</span>
}

/** Chapter strip: one segment per chapter, proportional to its running time. */
function Strip() {
  const t = useT()
  const seek = useFilm((s) => s.seek)
  const current = useFilm((s) => chapterAt(s.time).id)
  const fill = useRef<HTMLDivElement>(null)

  // Progress is written straight to the DOM every frame instead of re-rendering.
  useEffect(
    () =>
      useFilm.subscribe((s) => {
        if (fill.current) fill.current.style.transform = `scaleX(${s.time / TOTAL})`
      }),
    [],
  )

  // Touch: drag along the strip to scrub the film (a finger on the picture is the light).
  const drag = useRef<{ moved: boolean } | null>(null)
  const scrubTo = (e: React.PointerEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    seek(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * TOTAL)
  }

  return (
    <nav
      className="strip"
      aria-label={t.ui.chapters}
      onPointerDown={(e) => {
        if (e.pointerType === 'mouse') return
        drag.current = { moved: false }
        e.currentTarget.setPointerCapture(e.pointerId)
      }}
      onPointerMove={(e) => {
        if (!drag.current) return
        drag.current.moved = true
        scrubTo(e)
      }}
      onPointerUp={() => setTimeout(() => (drag.current = null))}
      onClickCapture={(e) => {
        // A drag isn't a tap on a chapter.
        if (drag.current?.moved) e.stopPropagation()
      }}
    >
      <div className="strip-fill" ref={fill} />
      {CHAPTERS.map((c) => (
        <button
          key={c.id}
          className={`strip-seg${c.id === current ? ' is-current' : ''}`}
          style={{ flexGrow: c.dur, ['--accent' as string]: c.accent }}
          onClick={() => seek(c.start + 0.5)}
          aria-current={c.id === current ? 'true' : undefined}
        >
          <span className="strip-n">{c.n}</span>
          <span className="strip-label">{t.chapters[c.id]}</span>
        </button>
      ))}
    </nav>
  )
}

export function Player() {
  const t = useT()
  const { playing, mode, sound, captions, lang, togglePlay, toggleMode, toggleSound, toggleCaptions, setLang, seek } =
    useFilm(
      useShallow(({ time: _t, target: _g, ...rest }) => rest),
    )
  const credits = chapterById('credits')

  return (
    <footer className="player">
      <button className="pbtn play" onClick={togglePlay} aria-label={playing ? t.ui.pause : t.ui.play}>
        {playing ? '❚❚' : '▶'}
      </button>
      <Timecode />
      <Strip />
      <div className="pgroup">
        <button className={`pbtn chip${mode === 'watch' ? ' on' : ''}`} onClick={() => mode !== 'watch' && toggleMode()}>
          ▶ {t.ui.watch}
        </button>
        <button
          className={`pbtn chip${mode === 'explore' ? ' on' : ''}`}
          onClick={() => mode !== 'explore' && toggleMode()}
        >
          ◎ {t.ui.explore}
        </button>
      </div>
      <div className="pgroup">
        <button className={`pbtn chip${captions ? ' on' : ''}`} onClick={toggleCaptions} aria-pressed={captions}>
          CC
        </button>
        <button className={`pbtn chip${sound ? ' on' : ''}`} onClick={toggleSound} aria-pressed={sound} aria-label={t.ui.sound}>
          {sound ? '♪' : '♪̸'}
        </button>
        <button className="pbtn chip" onClick={() => setLang(lang === 'en' ? 'pt' : 'en')} aria-label="Language">
          <span className={lang === 'en' ? 'on-text' : ''}>EN</span>/<span className={lang === 'pt' ? 'on-text' : ''}>PT</span>
        </button>
      </div>
      <XrayButton />
      <button className="pbtn chip textver-btn" onClick={() => useTextVersion.getState().set(true)} title={t.ui.textVersion} aria-label={t.ui.textVersion}>
        ¶
      </button>
      <button className="pbtn skip" onClick={() => seek(credits.start + 0.5)}>
        {t.ui.skip} →
      </button>
    </footer>
  )
}

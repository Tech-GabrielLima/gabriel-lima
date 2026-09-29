import { useEffect } from 'react'
import { create } from 'zustand'
import { ABOUT, BIO, MILESTONES } from '../content/about'
import { CONTACT } from '../content/contact'
import { MONOLITH, PROJECTS, SUPERVISED } from '../content/projects'
import { CONSTELLATIONS } from '../content/skills'
import { useFilm } from '../film/store'
import { useT } from '../i18n'
import { SOUND_CREDITS } from '../content/soundCredits'

/** The whole portfolio as a plain document (ROTEIRO §8): for screen readers, search engines and people in a hurry. */
export const useTextVersion = create<{ open: boolean; set(open: boolean): void }>((set) => ({
  open: new URLSearchParams(location.search).has('text'),
  set: (open) => set({ open }),
}))

export function TextVersion() {
  const t = useT()
  const lang = useFilm((s) => s.lang)
  const open = useTextVersion((s) => s.open)
  const close = () => useTextVersion.getState().set(false)

  useEffect(() => {
    if (!open) return
    // Pause the film while reading.
    const s = useFilm.getState()
    if (s.playing) s.togglePlay()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [open])

  if (!open) return null
  const pt = lang === 'pt'

  return (
    <div className="textver" role="document">
      <article className="textver-page">
        <button className="textver-close" onClick={close}>
          ← {t.ui.backToFilm}
        </button>

        <header>
          <p className="tv-kicker">{t.film} · {t.by}</p>
          <h1>Gabriel Lima</h1>
          <p className="tv-lede">
            {pt ? 'Engenheiro full stack' : 'Full stack engineer'} · {ABOUT.hook[lang]}
          </p>
          <p className="tv-status">{CONTACT.status[lang]}</p>
        </header>

        <section>
          <h2>{t.chapters.studio}</h2>
          <p>{ABOUT.body[lang]}</p>
          <blockquote>{BIO[lang].join(' ')}</blockquote>
        </section>

        <section>
          <h2>{t.chapters.alley}</h2>
          <h3>{pt ? 'Casos profissionais' : 'Professional work'}</h3>
          <div className="tv-card">
            <h4>{MONOLITH.title[lang]}</h4>
            <p className="tv-hook">{MONOLITH.hook[lang]}</p>
            <p>{MONOLITH.plain[lang]}</p>
          </div>
          <div className="tv-card">
            <h4>{SUPERVISED.title[lang]}</h4>
            <p className="tv-hook">{SUPERVISED.hook[lang]}</p>
            <p>{SUPERVISED.plain[lang]}</p>
          </div>
          <h3>{pt ? 'Projetos de pesquisa' : 'Research projects'}</h3>
          {PROJECTS.map((p) => (
            <div key={p.id} className="tv-card">
              <h4>
                {p.url ? (
                  <a href={p.url} target="_blank" rel="noreferrer">
                    {p.title} ↗
                  </a>
                ) : (
                  p.title
                )}{' '}
                <span className="tv-stat">{p.stat[lang]}</span>
              </h4>
              <p className="tv-hook">{p.hook[lang]}</p>
              <p>{p.plain[lang]}</p>
              <p className="tv-tech">
                {p.blurb[lang]} <span>{p.stack}</span>
              </p>
            </div>
          ))}
        </section>

        <section>
          <h2>{t.chapters.crossing}</h2>
          <ol className="tv-timeline">
            {MILESTONES.filter((m) => !m.future).map((m, i) => (
              <li key={i}>
                <span className="tv-year">{m.year}</span>
                <strong>{m.title[lang]}</strong> — {m.line[lang]}
              </li>
            ))}
          </ol>
        </section>

        <section>
          <h2>{t.chapters.moon}</h2>
          <dl className="tv-skills">
            {CONSTELLATIONS.map((c) => (
              <div key={c.id}>
                <dt>{c.name[lang]}</dt>
                <dd>{c.stars.join(' · ')}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section>
          <h2>{t.chapters.credits}</h2>
          <ul className="tv-contact">
            <li>
              E-mail: <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a>
            </li>
            <li>
              WhatsApp:{' '}
              <a href={`https://wa.me/${CONTACT.whatsapp}`} target="_blank" rel="noreferrer">
                {CONTACT.whatsappLabel}
              </a>
            </li>
            <li>
              GitHub:{' '}
              <a href={CONTACT.github} target="_blank" rel="noreferrer">
                github.com/Tech-GabrielLima
              </a>
            </li>
          </ul>
        </section>

        <section>
          <h2>{pt ? 'Trilha e sons' : 'Music and sound'}</h2>
          <p>
            {pt
              ? 'Todas as músicas e sons do site são de terceiros, com licenças livres. Obrigado a quem os gravou e compôs.'
              : 'All the music and sound on the site are by others, under free licences. Thanks to everyone who recorded and composed them.'}
          </p>
          <ul className="tv-sound">
            {SOUND_CREDITS.map((c) => (
              <li key={c.url}>
                <span className="tv-year">{c.use[lang]}</span>
                <a href={c.url} target="_blank" rel="noreferrer">
                  “{c.title}”
                </a>{' '}
                {pt ? 'de' : 'by'} {c.author} · {c.source} ·{' '}
                <a href={c.licenseUrl} target="_blank" rel="noreferrer">
                  {c.license}
                </a>
                {c.kind === 'music' ? (pt ? ' · editado para loop' : ' · edited to loop') : pt ? ' · cortado e nivelado' : ' · trimmed and levelled'}
              </li>
            ))}
          </ul>
        </section>
      </article>
    </div>
  )
}

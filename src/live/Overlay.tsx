import { useEffect } from 'react'
import { useFilm } from '../film/store'
import { closePanel, useOverlay } from './overlay'
import { BookPanel, HalePlayground, RaftPanel } from './widgets'

const TITLE = {
  hale: { en: 'hale · the real compiler, in your browser', pt: 'hale · o compilador real, no seu navegador' },
  raft: { en: 'raft-kv-store · the live cluster', pt: 'raft-kv-store · o cluster ao vivo' },
  book: { en: 'matching engine · the live book', pt: 'matching engine · o livro ao vivo' },
}

/** The live panel over the picture, opened from an installation (see overlay.ts). */
export function LiveOverlay() {
  const panel = useOverlay((s) => s.panel)
  const lang = useFilm((s) => s.lang)
  useEffect(() => {
    if (!panel) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closePanel()
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [panel])
  if (!panel) return null
  return (
    <div className="live-overlay" role="dialog" aria-modal="true" aria-label={TITLE[panel][lang]} onClick={closePanel}>
      <div className="live-overlay-card" onClick={(e) => e.stopPropagation()}>
        <header>
          <p>{TITLE[panel][lang]}</p>
          <button onClick={closePanel}>
            {lang === 'pt' ? 'voltar ao filme' : 'back to the film'} <kbd>Esc</kbd>
          </button>
        </header>
        {panel === 'hale' && <HalePlayground lang={lang} />}
        {panel === 'raft' && <RaftPanel lang={lang} />}
        {panel === 'book' && <BookPanel lang={lang} />}
      </div>
    </div>
  )
}

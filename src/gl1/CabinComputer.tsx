import { Suspense, lazy } from 'react'
import { useFilm } from '../film/store'
import { standUp, useGl1Ui } from './ui'
import './gl1.css'

// Sitting at the projectionist's computer (Act II): the booth's CRT fills the
// screen, and GL-OS is the visitor's (user visitante). Standing up goes back
// to the film where it was.

const Terminal = lazy(() => import('./Terminal').then((m) => ({ default: m.Terminal })))

export function CabinComputer() {
  const open = useGl1Ui((s) => s.open)
  const lang = useFilm((s) => s.lang)
  if (!open) return null
  const title = lang === 'pt' ? 'O computador do projecionista' : "The projectionist's computer"
  return (
    <div className="cabin-pc" role="dialog" aria-modal="true" aria-label={title}>
      <div className="cabin-pc-tube">
        <header className="gl1-bar">
          <span className="gl1-led" aria-hidden />
          GL-1 · {title}
          <button className="cabin-pc-up" onClick={standUp}>
            ← {lang === 'pt' ? 'Levantar da cadeira' : 'Stand up'}
          </button>
        </header>
        <Suspense fallback={<div className="gl1-status">GL-1…</div>}>
          <Terminal user={1} label={title} />
        </Suspense>
      </div>
    </div>
  )
}

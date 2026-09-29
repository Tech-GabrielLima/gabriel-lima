import { Suspense, lazy, useState } from 'react'
import { useFilm } from '../film/store'
import './gl1.css'

// A GL-1 in a piece of furniture (ROTEIRO §0.4.1): the box office's beige CRT
// (Act I, user caixa), the projectionist's computer (Act II, visitante), the
// machine room's rack (Act III, root). Nothing loads until it's switched on.

const Terminal = lazy(() => import('./Terminal').then((m) => ({ default: m.Terminal })))

export type Skin = 'crt' | 'rack'

export function Console({ user, label, hint, skin, onPower }: { user: number; label: { en: string; pt: string }; hint: { en: string; pt: string }; skin: Skin; onPower?: () => void }) {
  const lang = useFilm((s) => s.lang)
  const [on, setOn] = useState(false)
  return (
    <div className={`console ${skin}${on ? ' on' : ''}`}>
      <div className="console-bezel">
        {skin === 'rack' && <span className="console-leds" aria-hidden />}
        {on ? (
          <Suspense fallback={<div className="console-off">GL-1…</div>}>
            <Terminal user={user} label={label[lang]} />
          </Suspense>
        ) : (
          <button
            className="console-off"
            onClick={() => {
              setOn(true)
              onPower?.()
            }}
          >
            <span className="console-power" aria-hidden />
            {lang === 'pt' ? `Ligar: ${label.pt.toLowerCase()}` : `Switch on: ${label.en.toLowerCase()}`}
          </button>
        )}
      </div>
      <p className="console-label">{hint[lang]}</p>
    </div>
  )
}

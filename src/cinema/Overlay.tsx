import { useFilm } from '../film/store'
import { FRAME_COUNT, FRAME_NAME, frameById } from './frames'
import { useProgress } from './progress'
import { useUsher, usherSays } from './usher'
import { onNote } from './progress'

// Notes other visitors pass through GL-OS's `write`: the usher delivers them.
onNote((from, text) => usherSays(`#${from}: ${text}`, true))
import './cinema.css'

// What the spine shows on top of every act: a frame sliding back into the
// reel when one is found, and the "No." when the server refuses the log.

// Both play once and fade out by themselves (cinema.css); a new event remounts them by key.

function FrameBack() {
  const latest = useProgress((s) => s.latest)
  const count = useProgress((s) => s.found.length)
  const lang = useFilm((s) => s.lang)
  const f = latest && frameById(latest.id)
  if (!f) return null
  return (
    <div className="frame-back" key={latest.at} role="status">
      <div className="fb-cell" aria-hidden>
        <span className="fb-n">{String(f.n).padStart(2, '0')}</span>
      </div>
      <div className="fb-copy">
        <p className="fb-kicker">
          {lang === 'pt' ? 'Fotograma' : 'Frame'} {f.n} · {lang === 'pt' ? 'de volta ao rolo' : 'back in the reel'}
        </p>
        <p className="fb-name">{FRAME_NAME[f.id][lang]}</p>
        <p className="fb-count">
          {count} / {FRAME_COUNT}
        </p>
      </div>
    </div>
  )
}

function No() {
  const refused = useProgress((s) => s.refused)
  const lang = useFilm((s) => s.lang)
  if (!refused) return null
  return (
    <div className="cinema-no" role="alert" key={refused.at}>
      <div className="no-beam" aria-hidden />
      <p className="no-word">No.</p>
      <p className="no-line">
        {lang === 'pt' ? 'Ingresso falsificado. O projetor só conta o que aconteceu.' : 'Forged ticket. The projector only counts what happened.'}
      </p>
    </div>
  )
}

/** The usher's torch finds you, and he says one line. */
function Usher() {
  const line = useUsher((s) => s.line)
  if (!line) return null
  return (
    <div className="usher" key={line.at} role="status">
      <span className="usher-torch" aria-hidden />
      <p>{line.text}</p>
    </div>
  )
}

export function CinemaOverlay() {
  return (
    <>
      <FrameBack />
      <No />
      <Usher />
    </>
  )
}

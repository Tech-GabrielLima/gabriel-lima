import { useFilm } from '../film/store'
import { useProjector } from './projector'
import './gl1.css'

// The projector jammed on a bug in controle.py (gl1/projector.ts): the frame
// holds, burning, and a note on the booth's door says where the fix is.

export function ProjectorJam() {
  const jammed = useProjector((s) => s.jammed)
  const error = useProjector((s) => s.error)
  const lang = useFilm((s) => s.lang)
  if (!jammed) return null
  const pt = lang === 'pt'
  const last = error?.trim().split('\n').pop()
  return (
    <div className="jam" role="alert">
      <p className="jam-kicker">{pt ? 'O projetor travou' : 'The projector jammed'}</p>
      <p className="jam-error">{last}</p>
      <p className="jam-how">
        {pt
          ? 'O bug está no script que roda o projetor. Volte à cabine (capítulo 01), sente no computador e rode: projetor status'
          : "The bug is in the script that runs the projector. Go back to the booth (chapter 01), sit at the computer and run: projetor status"}
      </p>
      <button className="jam-go" onClick={() => useFilm.getState().seek(22)}>
        ← {pt ? 'Ir para a cabine' : 'Go to the booth'}
      </button>
    </div>
  )
}

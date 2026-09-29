import { useFilm } from '../film/store'
import { findFrame } from './progress'

// Frame 3 (ROTEIRO §0.4.4): leave the tab and the cinema notices. The title
// keeps the film running while you're away; coming back after a while, you
// missed a bit.

const AWAY_MS = 3000

export function watchTab() {
  let title = document.title
  let left = 0
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      title = document.title
      left = performance.now()
      document.title = useFilm.getState().lang === 'pt' ? 'O filme ainda está rodando.' : 'The film is still running.'
      return
    }
    document.title = title
    if (left && performance.now() - left >= AWAY_MS) findFrame('tab')
  })
}

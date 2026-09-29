import { create } from 'zustand'
import { useFilm } from '../film/store'

// A live panel opened from inside the film (a door's installation). The film
// holds while it's open and picks up again when it closes.

export type PanelId = 'hale' | 'raft' | 'book'

export const useOverlay = create<{ panel: PanelId | null; resume: boolean }>(() => ({ panel: null, resume: false }))

export function openPanel(panel: PanelId) {
  const { playing } = useFilm.getState()
  if (playing) useFilm.setState({ playing: false })
  useOverlay.setState({ panel, resume: useOverlay.getState().panel ? useOverlay.getState().resume : playing })
}

export function closePanel() {
  const { resume } = useOverlay.getState()
  useOverlay.setState({ panel: null, resume: false })
  if (resume) useFilm.setState({ playing: true })
}

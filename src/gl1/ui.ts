import { create } from 'zustand'
import { findFrame } from '../cinema/progress'
import { useFilm } from '../film/store'
import { armProjector } from './projector'

// Which GL-1 is on screen inside the film (Act II): the projectionist's
// computer in the booth. The film holds while you're at it.

interface Gl1Ui {
  open: boolean
  resume: boolean
}

export const useGl1Ui = create<Gl1Ui>(() => ({ open: false, resume: false }))

export function sitAtComputer() {
  if (useGl1Ui.getState().open) return
  const playing = useFilm.getState().playing
  if (playing) useFilm.setState({ playing: false })
  useGl1Ui.setState({ open: true, resume: playing })
  findFrame('terminal')
  // From here on, the booth's projector obeys the script on this computer's disk.
  armProjector()
}

export function standUp() {
  const { open, resume } = useGl1Ui.getState()
  if (!open) return
  useGl1Ui.setState({ open: false, resume: false })
  if (resume) useFilm.setState({ playing: true })
}

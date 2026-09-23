import { create } from 'zustand'

// The bridge between the acts (ROTEIRO §0.1): Act I (the lobby) and Act III
// (lights up) are plain DOM and must not import three.js, so the film reports
// its loading here and registers the function that starts it; the 2D acts
// only read this store and move `act`.

export type Act = 'lobby' | 'film' | 'exit'

interface Preload {
  /** Which act owns the screen. The film holds still (and silent) unless it's 'film'. */
  act: Act
  /** Where the lobby opens when you walk back into it. */
  lobbyAt: 'top' | 'door'
  /** The film's code has arrived and its canvas is mounted underneath. */
  mounted: boolean
  /** Loading progress of the film's first scene, 0..1. */
  progress: number
  /** Assets loaded and shaders compiled: the door can open. */
  ready: boolean
  /** The visitor has been through the door at least once tonight. */
  entered: boolean
  /** Registered by the film. Must be called inside the click, so audio can start. */
  enter?: () => void
}

const params = new URLSearchParams(location.search)

/** Deep links into the film (and the capture scripts) skip the lobby; ?exit opens straight on Act III. */
export const SKIP_LOBBY = ['start', 't', 'door', 'clean'].some((k) => params.has(k))

export const usePreload = create<Preload>(() => ({
  act: params.has('exit') ? 'exit' : SKIP_LOBBY ? 'film' : 'lobby',
  lobbyAt: 'top',
  mounted: false,
  progress: 0,
  ready: false,
  entered: SKIP_LOBBY,
}))

/** Walk out to Act III (from the film's exit door, or straight from the lobby). */
export const goExit = () => usePreload.setState({ act: 'exit' })

/** Back to Act I, at its top or at the door. */
export const goLobby = (at: 'top' | 'door') => usePreload.setState({ act: 'lobby', lobbyAt: at })

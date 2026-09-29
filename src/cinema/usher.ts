import { create } from 'zustand'
import { useWorld } from '../gl1/world'

// The usher (ROTEIRO §0.4.3): the only voice the site's humour has. Rare on
// purpose. He's also a process in GL-OS: kill him and he says nothing until
// init brings him back.

export const useUsher = create<{ line: { text: string; at: number } | null }>(() => ({ line: null }))

let last = 0
/** One line from the usher (at most one every few seconds, and none if he's been killed). */
export function usherSays(text: string, force = false) {
  if (useWorld.getState().usher === 'gone') return
  const now = Date.now()
  if (!force && now - last < 4000) return
  last = now
  useUsher.setState({ line: { text, at: now } })
}

import { create } from 'zustand'

// Whether Cabin 0 is open (ROTEIRO §0.4.8). It opens from the lobby's door
// once the ticket has all 48 holes; ?cabine0=preview opens it with test data.
// After the end, the Commentary Session (Sessão Comentada) can be switched on
// for the next showing; ?comentada switches it on directly.

const params = new URLSearchParams(location.search)
const preview = params.get('cabine0') === 'preview'
const KEY = 'sn.comentada'
const saved = () => {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export const useFinale = create<{ open: boolean; preview: boolean; commentary: boolean }>(() => ({ open: preview, preview, commentary: params.has('comentada') || saved() }))

export const openCabin0 = () => useFinale.setState({ open: true })
export const closeCabin0 = () => useFinale.setState({ open: false })
export function setCommentary(on: boolean) {
  useFinale.setState({ commentary: on })
  try {
    localStorage.setItem(KEY, on ? '1' : '0')
  } catch {
    /* a private window */
  }
}

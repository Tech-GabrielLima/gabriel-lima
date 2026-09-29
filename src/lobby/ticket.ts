import { create } from 'zustand'
import { useProgress } from '../cinema/progress'
import { live, useLive } from '../live/live'

// The visitor's ticket for tonight: bought in Act I, stamped in Act III.
// One per visit, so both acts show the same seat and the same number.

interface Ticket {
  arrived: Date
  row: string
  seat: number
  /** A real, sequential number: the cinema's (kept across visits), else the live server's; null while offline. */
  number: number | null
}

export const useTicket = create<Ticket>(() => ({
  arrived: new Date(),
  row: 'ABCDEFGHJKL'[Math.floor(Math.random() * 11)],
  seat: 1 + Math.floor(Math.random() * 24),
  number: null,
}))

// The cinema (ROTEIRO §0.4.3) numbers every visitor for good; the live server's count is the fallback.
const fromCinema = () => useProgress.getState().ticket?.n ?? null
useTicket.setState({ number: fromCinema() })
useProgress.subscribe((s) => s.ticket && useTicket.setState({ number: s.ticket.n }))
let asked = false
useLive.subscribe((s) => {
  if (s.status !== 'live' || asked) return
  asked = true
  live.ticket().then((r) => r && fromCinema() === null && useTicket.setState({ number: r.n }))
})

const pad = (n: number, w = 2) => String(n).padStart(w, '0')

/** The serial on the stub: the live number, or else the moment of arrival (honest either way). */
export function serialOf(t: Ticket) {
  if (t.number !== null) return `Nº ${pad(t.number, 6)}`
  const d = t.arrived
  return `SN-${d.getFullYear() % 100}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

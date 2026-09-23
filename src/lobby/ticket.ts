import { create } from 'zustand'
import { live, useLive } from '../live/live'

// The visitor's ticket for tonight: bought in Act I, stamped in Act III.
// One per visit, so both acts show the same seat and the same number.

interface Ticket {
  arrived: Date
  row: string
  seat: number
  /** A real, sequential number from the live server; null while offline. */
  number: number | null
}

export const useTicket = create<Ticket>(() => ({
  arrived: new Date(),
  row: 'ABCDEFGHJKL'[Math.floor(Math.random() * 11)],
  seat: 1 + Math.floor(Math.random() * 24),
  number: null,
}))

// The number is issued once, the first time the live wire comes up.
let asked = false
useLive.subscribe((s) => {
  if (s.status !== 'live' || asked) return
  asked = true
  live.ticket().then((r) => r && useTicket.setState({ number: r.n }))
})

const pad = (n: number, w = 2) => String(n).padStart(w, '0')

/** The serial on the stub: the live number, or else the moment of arrival (honest either way). */
export function serialOf(t: Ticket) {
  if (t.number !== null) return `Nº ${pad(t.number, 6)}`
  const d = t.arrived
  return `SN-${d.getFullYear() % 100}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

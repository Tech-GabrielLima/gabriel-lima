import { create } from 'zustand'

// The MATCH room's bus between the scene (inside the canvas) and its controls
// (RoomUI, in the DOM): the director's shots, the visitor's orders, and the
// visitor's own resting order as it moves up the queue.

export const SHOTS = 4

export interface Mine {
  side: 'BUY' | 'SELL'
  price: number
  /** Lots resting ahead of it at its price (price-time priority: they fill first). */
  ahead: number
  /** Its own lots still resting. */
  qty: number
}

interface MatchRoom {
  shot: number
  /** Bumped by each market order the visitor sends, with its side (for the light that runs down the avenue). */
  sent: { n: number; side: 'BUY' | 'SELL' }
  mine: Mine | null
  /** The last word on the visitor's orders. */
  note: string | null
}

export const useMatchRoom = create<MatchRoom>(() => ({ shot: 0, sent: { n: 0, side: 'BUY' }, mine: null, note: null }))

if (new URLSearchParams(location.search).has('debug')) (window as unknown as { __matchRoom: typeof useMatchRoom }).__matchRoom = useMatchRoom

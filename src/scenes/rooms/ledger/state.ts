import { create } from 'zustand'

// The LEDGER room's bus between the scene and its controls: the commands the
// visitor gives, the account picked as a transfer's source, the last word on
// it, and the counters the header shows.

export type LedgerCmd = 'storm' | 'replay' | 'fail'

interface LedgerRoom {
  cmd: { n: number; kind: LedgerCmd }
  /** The account picked as the source of a transfer, or -1. */
  sel: number
  note: string | null
  stats: { total: number; system: number; events: number; published: number; batch: string | null }
  /** The vault's psql console (./Console.tsx): open, what's typed, and the last statement run. */
  console: { open: boolean; text: string }
  /** A statement for the scene to act out: an UPDATE straight on a balance, a DELETE on the event store. */
  forge: { n: number; kind: 'update' | 'delete'; acct: number; amt: number; sql: string }
  /** When the Σ = 0 sign last refused one (performance.now() seconds), for the "No." */
  refusedAt: number
}

export const useLedgerRoom = create<LedgerRoom>(() => ({ cmd: { n: 0, kind: 'storm' }, sel: -1, note: null, stats: { total: 1_000_000, system: -1_000_000, events: 8, published: 8, batch: null },
  console: { open: false, text: '' },
  forge: { n: 0, kind: 'update', acct: 0, amt: 0, sql: '' },
  refusedAt: -99,
}))

export const ledgerCommand = (kind: LedgerCmd) => useLedgerRoom.setState((s) => ({ cmd: { n: s.cmd.n + 1, kind } }))

if (new URLSearchParams(location.search).has('debug')) (window as unknown as { __ledgerRoom: typeof useLedgerRoom }).__ledgerRoom = useLedgerRoom

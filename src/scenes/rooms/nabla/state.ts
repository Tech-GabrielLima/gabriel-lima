import { create } from 'zustand'
import type { Sample } from './net'

// The NABLA room's bus: the 8×8 digit on the pad (0..16 per cell, like the
// dataset), the visitor's requests to teach the network, and what it predicts.

interface NablaRoom {
  x: number[]
  /** Bumped whenever the pad changes: the scene runs a forward pass. */
  rev: number
  teach: { n: number; label: number }
  pred: { digit: number; p: number; probs: number[] } | null
  loss: number | null
  note: string | null
  /** A few digits from the held-out test set, once the network has loaded. */
  samples: Sample[]
  acc: number
  test: number
}

export const useNablaRoom = create<NablaRoom>(() => ({ x: new Array(64).fill(0), rev: 0, teach: { n: 0, label: 0 }, pred: null, loss: null, note: null, samples: [], acc: 0, test: 0 }))

export const setPad = (x: number[]) => useNablaRoom.setState((s) => ({ x, rev: s.rev + 1 }))

if (new URLSearchParams(location.search).has('debug')) (window as unknown as { __nablaRoom: typeof useNablaRoom }).__nablaRoom = useNablaRoom

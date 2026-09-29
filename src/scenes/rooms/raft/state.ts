import { create } from 'zustand'

// The RAFT room's little bus between the scene (inside the canvas) and its
// controls (RoomUI, in the DOM): which director's shot to fly to, and the
// messages thrown to the leader.

export const SHOTS = 4

interface RaftRoom {
  /** A director's shot to fly to (1..SHOTS), or 0 for none. */
  shot: number
  /** Bumped each time the visitor sends a message to the leader. */
  bottles: number
  /** The lighthouse under the pointer (for the label), or -1. */
  hover: number
  /** The last election: the new leader and its term, and when (performance.now()). */
  elected: { leader: number; term: number; at: number } | null
}

export const useRaftRoom = create<RaftRoom>(() => ({ shot: 0, bottles: 0, hover: -1, elected: null }))

if (new URLSearchParams(location.search).has('debug')) (window as unknown as { __raftRoom: typeof useRaftRoom }).__raftRoom = useRaftRoom

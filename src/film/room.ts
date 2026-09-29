import { create } from 'zustand'
import type { DoorId } from '../content/projects'
import { useFilm } from './store'

// The rooms behind the alley's doors (ROTEIRO §2, Cena 03 · v3): bigger on the
// inside than the alley could ever hold. Walking into one swaps the alley for
// the room's own scene (behind the curtain), the film holds, and the camera is
// the visitor's. Walking out lands back at the same open door.

/** The doors that open onto a room so far. */
export const ROOMS: DoorId[] = ['flight', 'hale', 'raft', 'match', 'ledger', 'nabla', 'cuda', 'obras']

interface Room {
  room: DoorId | null
  /** The door to reopen when the visitor walks back into the alley. */
  returnTo: DoorId | null
  resume: boolean
}

const deep = new URLSearchParams(location.search).get('room') as DoorId | null

/** ?room=raft opens straight on a room (for sharing it, and for the capture scripts). */
export const useRoom = create<Room>(() => ({ room: deep && ROOMS.includes(deep) ? deep : null, returnTo: deep && ROOMS.includes(deep) ? deep : null, resume: false }))

export function enterRoom(id: DoorId) {
  if (!ROOMS.includes(id) || useRoom.getState().room) return
  const playing = useFilm.getState().playing
  if (playing) useFilm.setState({ playing: false })
  useRoom.setState({ room: id, returnTo: id, resume: playing })
}

export function exitRoom() {
  const { room, resume } = useRoom.getState()
  if (!room) return
  useRoom.setState({ room: null, resume: false })
  if (resume) useFilm.setState({ playing: true })
}

if (new URLSearchParams(location.search).has('debug')) (window as unknown as { __room: typeof useRoom }).__room = useRoom

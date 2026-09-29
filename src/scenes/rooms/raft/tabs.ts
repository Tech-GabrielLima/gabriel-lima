import { create } from 'zustand'
import { findFrame } from '../../../cinema/progress'
import { usherSays } from '../../../cinema/usher'
import { useFilm } from '../../../film/store'
import type { NodeId, Out, TabSnapshot } from './tabraft'

// The RAFT room's secret (ROTEIRO §0.4.5, frame 25): while the room is open,
// this tab is a Raft node (./tabraft.ts, in ./tabs.worker.ts), and so is every
// other tab of the site with the room open. Open it three times, close the
// leader's tab, and the others notice, hold an election among themselves and
// carry on: the frame is found in the tabs that survived.

interface TabRaft {
  snap: TabSnapshot | null
  /** Whether this tab's node has been "crashed" from the panel. */
  crashed: boolean
}

export const useTabRaft = create<TabRaft>(() => ({ snap: null, crashed: false }))

let worker: Worker | null = null
let id: NodeId = ''
/** The last leader seen while the cluster had three tabs or more, and its term. */
let big: { leader: NodeId; term: number } | null = null

function onState(s: TabSnapshot) {
  useTabRaft.setState({ snap: s })
  if (s.self.role === 'down') return
  const leader = s.self.leader
  const term = s.self.term
  if (leader && s.nodes.length >= 3) big = { leader, term }
  // A new leader, in a later term, after the old one left a cluster of three or more: that's the frame.
  if (big && leader && leader !== big.leader && term > big.term && !s.nodes.some((n) => n.id === big!.leader)) {
    findFrame('raft')
    const pt = useFilm.getState().lang === 'pt'
    usherSays(pt ? 'O líder morreu. Viva o líder. Ninguém aqui perdeu um commit.' : 'The leader is dead. Long live the leader. Nobody here lost a commit.')
    big = null
  }
}

/** Starts this tab's node (once per visit to the room); returns the way to stop it. */
export function startTabNode() {
  if (worker) return stopTabNode
  if (typeof Worker === 'undefined' || typeof BroadcastChannel === 'undefined') return () => {}
  id = Math.random().toString(16).slice(2, 6)
  worker = new Worker(new URL('./tabs.worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (e: MessageEvent<Out>) => e.data.t === 'state' && onState(e.data.s)
  worker.postMessage({ t: 'start', id })
  useTabRaft.setState({ snap: null, crashed: false })
  return stopTabNode
}

export function stopTabNode() {
  worker?.postMessage({ t: 'stop' })
  worker = null
  big = null
  useTabRaft.setState({ snap: null, crashed: false })
}

/** Crash this tab's node (it stops answering; its term and log survive), or bring it back. */
export function toggleTabCrash() {
  const crashed = !useTabRaft.getState().crashed
  worker?.postMessage({ t: crashed ? 'crash' : 'revive' })
  useTabRaft.setState({ crashed })
}

export function proposeFromTab(cmd: string) {
  worker?.postMessage({ t: 'propose', cmd })
}

export const tabId = () => id

if (new URLSearchParams(location.search).has('debug')) (window as unknown as { __tabRaft: typeof useTabRaft }).__tabRaft = useTabRaft

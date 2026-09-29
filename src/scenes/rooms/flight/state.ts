import { create } from 'zustand'

// The FLIGHT room's bus: the investigation's step (the replay of the crash,
// the `why` chain, the fix being proven), and the lines the black box prints.
// Every name, line and message below is flight's own README example.

export type Step = 'idle' | 'replay' | 'crashed' | 'why' | 'fix' | 'verified'

export const useFlightRoom = create<{ step: Step; at: number; why: number }>(() => ({ step: 'idle', at: 0, why: -1 }))

export const go = (step: Step) => useFlightRoom.setState({ step, at: performance.now() / 1000, why: step === 'why' ? 0 : -1 })

/** The events in the ring before the crash (flight records PY_START / LINE / RETURN / RAISE by logical time). */
export const EVENTS: { kind: 'PY_START' | 'LINE' | 'RETURN' | 'RAISE'; label: string }[] = [
  { kind: 'PY_START', label: 'main' },
  { kind: 'LINE', label: '' },
  { kind: 'LINE', label: '' },
  { kind: 'PY_START', label: 'summarize' },
  { kind: 'LINE', label: 'crash.py:32' },
  { kind: 'PY_START', label: 'compute_average' },
  { kind: 'LINE', label: 'crash.py:26' },
  { kind: 'RAISE', label: 'ZeroDivisionError' },
]

/** `flight inspect`: the frames, crash first. */
export const FRAMES = [
  { n: '#0', fn: 'compute_average', at: 'crash.py:26', local: 'numbers = list[0] ↔', note: { en: 'empty! this is the bug', pt: 'vazia! este é o bug' } },
  { n: '#1', fn: 'summarize', at: 'crash.py:32', local: 'data = list[0] ↔', note: { en: 'the SAME empty list, aliased in', pt: 'a MESMA lista vazia, por aliasing' } },
  { n: '#2', fn: 'main', at: '', local: 'datasets = dict[3]', note: { en: 'where it came from', pt: 'de onde ela veio' } },
]

/** `flight why crash.flight --var numbers`, line by line. */
export const WHY = [
  "numbers ([]) — how this value came to be:",
  "#0 compute_average  crash.py:26     parameter — its value comes from the caller",
  "↔ the SAME object as 'data' in summarize (frame #1)",
  "↰ is datasets['evening'] in main (frame #2)  (dict[3])",
  "⇒ root: 'datasets' was dict[3] in main (frame #2)",
]

/** `flight fix`: how it ends. */
export const FIX = ['✓ the crash no longer reproduces', '✓ no boundary divergence (time/random/IO identical)', '⇒ FIX VERIFIED']

if (new URLSearchParams(location.search).has('debug')) (window as unknown as { __flightRoom: typeof useFlightRoom }).__flightRoom = useFlightRoom

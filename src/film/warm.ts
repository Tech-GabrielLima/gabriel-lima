import { create } from 'zustand'

/** True while a freshly mounted scene compiles its shaders; the film holds on the cut's flash meanwhile. */
export const useWarm = create<{ warming: boolean }>(() => ({ warming: false }))

if (new URLSearchParams(location.search).has('debug')) (window as unknown as { __warm: typeof useWarm }).__warm = useWarm

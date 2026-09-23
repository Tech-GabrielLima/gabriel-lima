import { create } from 'zustand'

// Easter eggs found so far (ROTEIRO §5). Seven in total; finding all unlocks the director's cut.
export type Egg = 'spider' | 'drops' | 'rat' | 'chest' | 'flag' | 'phone' | 'duck'
export const EGG_COUNT = 7

export const useEggs = create<{ found: Egg[]; find(e: Egg): void }>((set, get) => ({
  found: [],
  find: (e) => {
    if (!get().found.includes(e)) set({ found: [...get().found, e] })
  },
}))

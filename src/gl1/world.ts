import { create } from 'zustand'

// The cinema as GL-OS sees it (ROTEIRO §0.4.5: "tudo é um arquivo"). Writing
// to /cinema/* changes this; the scenes and the 2D acts read it.

interface World {
  /** echo off > /cinema/luz */
  lights: boolean
  /** echo "..." > /cinema/fachada/letreiro (this visitor's marquee only) */
  marquee: string | null
  /** The usher is a process: killed, he's gone until init brings him back. */
  usher: 'alive' | 'gone'
  /** rm -rf / just happened: the cinema falls apart, then copy-on-write puts it back. */
  collapse: number
  sudoIncidents: number
}

export const useWorld = create<World>(() => ({ lights: true, marquee: null, usher: 'alive', collapse: 0, sudoIncidents: 0 }))

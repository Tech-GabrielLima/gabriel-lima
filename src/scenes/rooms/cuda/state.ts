import { create } from 'zustand'

// The CUDA room's bus: which GEMM version is running, and how far the output
// matrix has got. The five versions are the repository's own; it publishes
// no measurements ("I do not include fabricated measurements"), so the share
// of cuBLAS shown for each is the typical range its README quotes, and the
// room says so.

export interface Version {
  id: string
  name: { en: string; pt: string }
  /** The typical share of cuBLAS the README quotes, as shown, and a single value for the animation. */
  range: string
  pct: number
  what: { en: string; pt: string }
}

export const VERSIONS: Version[] = [
  { id: 'v1', name: { en: 'naive', pt: 'ingênua' }, range: '~1–3%', pct: 2, what: { en: 'every thread reads its own row and column from global memory, uncoalesced: 32 transactions per warp', pt: 'cada thread lê a sua linha e coluna da memória global, sem coalescência: 32 transações por warp' } },
  { id: 'v2', name: { en: 'coalesced', pt: 'coalescida' }, range: '~8–15%', pct: 11.5, what: { en: 'neighbouring threads read neighbouring addresses: 32 transactions become 1 of 128 B', pt: 'threads vizinhas leem endereços vizinhos: 32 transações viram 1 de 128 B' } },
  { id: 'v3', name: { en: 'shared tiling', pt: 'tiling em shared' }, range: '~25–40%', pct: 32.5, what: { en: 'each block loads a tile into shared memory once, and every thread reuses it', pt: 'cada bloco carrega um tile na memória compartilhada uma vez, e todas as threads o reutilizam' } },
  { id: 'v4', name: { en: 'register blocking', pt: 'register blocking' }, range: '~60–80%', pct: 70, what: { en: 'each thread computes an 8×8 micro-tile in registers: one load for every four FMAs', pt: 'cada thread calcula um micro-tile 8×8 em registradores: um load para cada quatro FMAs' } },
  { id: 'v5', name: { en: 'Tensor Cores', pt: 'Tensor Cores' }, range: '~50–70% (vs cuBLAS-TC)', pct: 60, what: { en: 'WMMA 16×16×16 on the Tensor Cores, FP16 in, FP32 accumulate', pt: 'WMMA 16×16×16 nos Tensor Cores, entrada FP16, acumulação FP32' } },
]

export const useCudaRoom = create<{ version: number; run: number; done: number; tiles: number }>(() => ({ version: 0, run: 0, done: 0, tiles: 1 }))

if (new URLSearchParams(location.search).has('debug')) (window as unknown as { __cudaRoom: typeof useCudaRoom }).__cudaRoom = useCudaRoom

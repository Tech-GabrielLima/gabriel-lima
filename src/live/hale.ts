// hale's real compiler front-end (lexer → parser → checker → IR → optimizer →
// cost / N+1 analyses), compiled to WebAssembly from Gabriel's own crate
// `hale-wasm` (github.com/Tech-GabrielLima/tired, crates/hale-wasm). It runs in
// the visitor's browser: no server, arbitrary code. Rebuild with
// `scripts/hale-wasm.sh`. Loaded only when someone opens the playground.

import init, { analyze, version } from './hale/hale_wasm.js'
import wasmUrl from './hale/hale_wasm_bg.wasm?url'

export interface Analysis {
  errors: number
  warnings: number
  diagnostics: string
  plan: string
  /** Microseconds the compiler took, measured here. */
  micros: number
}

let ready: Promise<string> | null = null

/** Loads the compiler once and returns its version. */
export function loadHale() {
  ready ??= init({ module_or_path: wasmUrl }).then(() => version())
  return ready
}

export async function compileHale(src: string): Promise<Analysis> {
  await loadHale()
  const t0 = performance.now()
  const j = JSON.parse(analyze(src)) as Omit<Analysis, 'micros'>
  return { ...j, micros: Math.round((performance.now() - t0) * 1000) }
}

/** Starter programs, from hale's own Playground (tired/site/src/data/examples.ts). */
export const HALE_EXAMPLES: { id: string; title: { en: string; pt: string }; code: string }[] = [
  {
    id: 'parallel',
    title: { en: 'Auto-parallelism', pt: 'Paralelismo automático' },
    code: `endpoint GH { base: "https://api.github.com" }

// You write these top-to-bottom; hale sees they're independent
// and runs all three concurrently in a single wave.
fetch GH /users/torvalds        -> user
fetch GH /users/torvalds/repos  -> repos
fetch GH /users/torvalds/orgs   -> orgs

log "{user} has data"
`,
  },
  {
    id: 'nplus1',
    title: { en: 'N+1 caught', pt: 'N+1 detectado' },
    code: `endpoint GH { base: "https://api.github.com" }

fetch GH /users -> users
for u in users {
  // One request per element — hale flags this N+1 at compile time.
  fetch GH /users/{u.id}/repos -> repos
  log "{repos.length}"
}
`,
  },
  {
    id: 'errors',
    title: { en: 'Unhandled error', pt: 'Erro não tratado' },
    code: `endpoint GH { base: "https://api.github.com" }

// A Result must be handled — reading a field off a maybe-error is a
// compile error, and an unhandled Result is too. Try fixing it with match!
fetch GH /users/octocat -> u: Result<User, NotFound>
log "hi {u.login}"
`,
  },
]

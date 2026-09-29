import { create } from 'zustand'

// The HALE room's bus: the compile the visitor runs through the pipeline's
// stages, how the program then runs (serially, or in the optimiser's waves),
// and whether the error handling has been taken out.

export type Mode = 'serial' | 'waves'

interface HaleRoom {
  compile: number
  /** The stage the compile has reached (0..7), or -1 before the first one. */
  stage: number
  run: { n: number; mode: Mode }
  broken: boolean
  note: string | null
}

export const useHaleRoom = create<HaleRoom>(() => ({ compile: 0, stage: -1, run: { n: 0, mode: 'waves' }, broken: false, note: null }))

/** The pipeline, as the README names it. */
export const STAGES = [
  { id: 'lexer', en: 'Lexer', pt: 'Lexer' },
  { id: 'parser', en: 'Parser', pt: 'Parser' },
  { id: 'ast', en: 'AST', pt: 'AST' },
  { id: 'types', en: 'Type checker', pt: 'Checagem de tipos' },
  { id: 'ir', en: 'IR lowering', pt: 'IR' },
  { id: 'opt', en: 'Optimizer', pt: 'Otimizador' },
  { id: 'exec', en: 'Wave executor', pt: 'Executor em ondas' },
] as const

/** The README's own program. */
export const SOURCE = `flow Dashboard(user: String) -> User {
  fetch GitHub /users/{user}           -> u: Result<User, NotFound>
  fetch GitHub /users/{user}/repos     -> repos
  fetch GitHub /users/{user}/followers -> followers
  match u { Ok(profile) => profile  Err(NotFound) => default_user() }
}`

/** The README's compile error, verbatim (from examples/broken.hale). */
export const ERROR = `error: unhandled error: \`maybe\` has type \`Result<Repo, ?>\` and may be an \`Err\`
  --> examples/broken.hale:19:32
   = help: \`match maybe { ... }\` and handle both \`Ok\` and \`Err\`, or \`return maybe\` to propagate it`

/** The README's benchmark: 6 fetches at 100 ms a hop. */
export const BENCH = { fetches: 6, serial: 620.1, parallel: 104.7, speedup: 5.92 }

if (new URLSearchParams(location.search).has('debug')) (window as unknown as { __haleRoom: typeof useHaleRoom }).__haleRoom = useHaleRoom

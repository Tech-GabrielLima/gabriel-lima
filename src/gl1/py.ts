// CPython in the browser (Pyodide), loaded once for everything that needs it:
// the `python` card and the projector's daemon (ROTEIRO §0.4.5). About 10 MB
// from jsdelivr, fetched only when first asked for.

const VERSION = '0.29.3'
const INDEX = `https://cdn.jsdelivr.net/pyodide/v${VERSION}/full/`

export interface Pyodide {
  runPython(code: string, opts?: { globals?: unknown }): unknown
  runPythonAsync(code: string, opts?: { globals?: unknown }): Promise<unknown>
  loadPackagesFromImports(code: string): Promise<unknown>
  loadPackage(names: string | string[]): Promise<unknown>
  setStdout(o: { write: (b: Uint8Array) => number }): void
  setStderr(o: { write: (b: Uint8Array) => number }): void
  setStdin(o: { stdin: () => string | null }): void
  globals: { get(name: string): unknown; set(name: string, v: unknown): void }
  toPy(v: unknown): unknown
  FS: {
    mkdirTree(p: string): void
    writeFile(p: string, d: Uint8Array | string): void
    readFile(p: string): Uint8Array
    readdir(p: string): string[]
    stat(p: string): { mode: number; size: number }
    isDir(mode: number): boolean
    unlink(p: string): void
  }
  version: string
}

let loading: Promise<Pyodide> | null = null

export function getPyodide(): Promise<Pyodide> {
  loading ??= (async () => {
    const mod = (await import(/* @vite-ignore */ `${INDEX}pyodide.mjs`)) as { loadPyodide(o: { indexURL: string }): Promise<Pyodide> }
    return mod.loadPyodide({ indexURL: INDEX })
  })()
  return loading
}

export const pythonLoaded = () => loading !== null

/** Where the output of the code running now goes (the card, or the projector). */
let sink: { out: (s: string) => void; err: (s: string) => void } = { out: () => {}, err: () => {} }
const dec = new TextDecoder()

/** Runs `fn` with Python's stdout/stderr going to `out`/`err`. One at a time. */
let queue = Promise.resolve()
export function withOutput<T>(py: Pyodide, out: (s: string) => void, err: (s: string) => void, fn: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    sink = { out, err }
    py.setStdout({ write: (b) => (sink.out(dec.decode(b)), b.length) })
    py.setStderr({ write: (b) => (sink.err(dec.decode(b)), b.length) })
    try {
      return await fn()
    } finally {
      sink = { out: () => {}, err: () => {} }
    }
  })
  queue = run.then(
    () => {},
    () => {},
  )
  return run
}

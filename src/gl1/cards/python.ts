import { PROJECTS } from '../../content/projects'
import { resolvePath, type CardCtx } from '../cards'
import { getPyodide, withOutput, type Pyodide } from '../py'
import { lineReader } from './line'
import { mayWrite } from './vi'

// python on the expansion bus: real CPython (Pyodide). The script's directory
// and the working directory are copied from GL-OS's disk into Python's own
// filesystem before it runs, and what it wrote comes back (where the user may
// write), so `python media.py > saida.txt` or a script writing a CSV behave
// like they would on a real machine.

const MAX_FILE = 64 * 1024

/** GL-OS files of these directories → Python's filesystem. → what was copied. */
function syncIn(c: CardCtx, py: Pyodide, dirs: string[]) {
  const copied = new Map<string, Uint8Array>()
  for (const dir of dirs) {
    const items = c.m.list(dir)
    if (!items) continue
    py.FS.mkdirTree(dir)
    for (const it of items) {
      if (it.kind !== 1 || it.size > MAX_FILE) continue
      const path = `${dir.replace(/\/$/, '')}/${it.name}`
      const data = c.m.readFile(path)
      if (!data) continue
      py.FS.writeFile(path, data)
      copied.set(path, data)
    }
  }
  return copied
}

/** New or changed files back to GL-OS (only where this user may write). */
function syncOut(c: CardCtx, py: Pyodide, dirs: string[], before: Map<string, Uint8Array>) {
  for (const dir of dirs) {
    let names: string[] = []
    try {
      names = py.FS.readdir(dir).filter((n) => n !== '.' && n !== '..')
    } catch {
      continue
    }
    for (const n of names) {
      const path = `${dir.replace(/\/$/, '')}/${n}`
      const st = py.FS.stat(path)
      if (py.FS.isDir(st.mode) || st.size > MAX_FILE) continue
      const now = py.FS.readFile(path)
      const was = before.get(path)
      if (was && was.length === now.length && was.every((b, i) => b === now[i])) continue
      if (!mayWrite(c.user, path)) {
        c.out(`\x1b[90mpython: ${path}: ${c.pt ? 'permissão negada no GL-OS (não foi salvo)' : 'permission denied on GL-OS (not saved)'}\x1b[0m\n`)
        continue
      }
      try {
        c.m.writeFile(path, now, c.user)
      } catch (e) {
        c.out(`python: ${path}: ${(e as Error).message}\n`)
      }
    }
  }
}

async function boot(c: CardCtx) {
  c.out(`\x1b[90m${c.pt ? 'ligando o CPython na placa (Pyodide, ~10 MB na primeira vez)…' : 'powering up CPython on the card (Pyodide, ~10 MB the first time)…'}\x1b[0m\n`)
  return getPyodide()
}

const out = (c: CardCtx) => (s: string) => c.out(s)
const err = (c: CardCtx) => (s: string) => c.out(`\x1b[31m${s}\x1b[0m`)

export async function python(c: CardCtx): Promise<number> {
  const py = await boot(c)
  const piped = await c.stdin()
  let fed = false
  py.setStdin({ stdin: () => (fed || !piped ? null : ((fed = true), piped)) })
  const cwd = c.cwd || '/'

  // python -c CODE
  const ci = c.args.indexOf('-c')
  if (ci >= 0) {
    const code = c.args.slice(ci + 1).join(' ')
    const before = syncIn(c, py, [cwd])
    await py.loadPackagesFromImports(code)
    py.globals.set('__src', code)
    const status = await withOutput(py, out(c), err(c), async () => Number(await py.runPythonAsync(RUN_CODE)))
    syncOut(c, py, [cwd], before)
    return status
  }

  // python FILE [args]
  const file = c.args[0]
  if (file) {
    const path = resolvePath(c, file)
    const src = c.m.readText(path)
    if (src === null) {
      c.out(`python: can't open file '${file}': [Errno 2] No such file or directory\n`)
      return 2
    }
    const dir = path.slice(0, path.lastIndexOf('/')) || '/'
    const dirs = [...new Set([dir, cwd])]
    const before = syncIn(c, py, dirs)
    await py.loadPackagesFromImports(src)
    py.globals.set('__path', path)
    py.globals.set('__argv', py.toPy([file, ...c.args.slice(1)]))
    py.globals.set('__cwd', cwd)
    const status = await withOutput(py, out(c), err(c), async () => Number(await py.runPythonAsync(RUN_FILE)))
    syncOut(c, py, dirs, before)
    return status
  }

  // piped code with no file: run it
  if (piped.trim()) {
    py.globals.set('__src', piped)
    await py.loadPackagesFromImports(piped)
    return withOutput(py, out(c), err(c), async () => Number(await py.runPythonAsync(RUN_CODE)))
  }

  // the REPL
  const before = syncIn(c, py, [cwd])
  py.runPython(`import os\nos.chdir(${JSON.stringify(cwd)})`)
  c.out(`Python ${String(py.runPython('import sys; sys.version.split()[0]'))} (Pyodide ${py.version}) ${c.pt ? 'na placa de expansão da GL-1' : "on the GL-1's expansion card"}\n${c.pt ? 'Ctrl+D ou exit() para sair.' : 'Ctrl+D or exit() to leave.'}\n`)
  py.runPython(REPL_SETUP)
  const lr = lineReader(c)
  let more = false
  for (;;) {
    const line = await lr.read(more ? '... ' : '>>> ')
    if (line === null || c.interrupted()) break
    if (!more && /^\s*(exit|quit)\(\)\s*$/.test(line)) break
    await py.loadPackagesFromImports(line).catch(() => {})
    py.globals.set('__line', line)
    more = await withOutput(py, out(c), err(c), async () => Boolean(py.runPython('__console.push(__line)')))
  }
  syncOut(c, py, [cwd], before)
  return 0
}

const RUN_FILE = `
import os, sys, runpy, traceback
os.chdir(__cwd)
sys.argv = list(__argv)
__code = 0
try:
    runpy.run_path(__path, run_name='__main__')
except SystemExit as e:
    __code = e.code if isinstance(e.code, int) else (0 if e.code is None else 1)
except BaseException:
    traceback.print_exc()
    __code = 1
sys.stdout.flush()
__code
`

const RUN_CODE = `
import sys, traceback
__code = 0
try:
    exec(compile(__src, '<string>', 'exec'), {'__name__': '__main__'})
except SystemExit as e:
    __code = e.code if isinstance(e.code, int) else (0 if e.code is None else 1)
except BaseException:
    traceback.print_exc()
    __code = 1
sys.stdout.flush()
__code
`

const REPL_SETUP = `
import code
__console = code.InteractiveConsole(locals={'__name__': '__main__'})
`

/** pip install NAME: micropip, from PyPI (pure-Python wheels, or the ones Pyodide builds). */
export async function pip(c: CardCtx): Promise<number> {
  const [cmd, ...names] = c.args
  if (cmd !== 'install' || !names.length) {
    c.out(c.pt ? 'uso: pip install PACOTE\n' : 'usage: pip install PACKAGE\n')
    return 2
  }
  const py = await boot(c)
  await py.loadPackage('micropip')
  for (const n of names) {
    c.out(`Collecting ${n}\n`)
    try {
      py.globals.set('__pkg', n)
      await py.runPythonAsync('import micropip\nawait micropip.install(__pkg)')
      c.out(`Successfully installed ${n}\n`)
    } catch (e) {
      c.out(`\x1b[31mERROR:\x1b[0m ${String((e as Error).message).split('\n').filter(Boolean).pop()}\n`)
      return 1
    }
  }
  return 0
}

/** flight is Gabriel's black box for Python (Rust + PyO3, on PyPI as pyflight). */
export async function flight(c: CardCtx): Promise<number> {
  const py = await boot(c)
  await py.loadPackage('micropip')
  try {
    await py.runPythonAsync("import micropip\nawait micropip.install('pyflight')")
    c.out(c.pt ? 'pyflight instalado.\n' : 'pyflight installed.\n')
    return 0
  } catch {
    const p = PROJECTS.find((x) => x.id === 'flight')!
    c.out(
      (c.pt
        ? `flight: o pyflight tem uma parte em Rust (PyO3) e não há ainda um wheel dele para o CPython do navegador,\nentão ele não roda nesta placa. De verdade, num terminal: \x1b[33mpip install pyflight\x1b[0m\n\n`
        : `flight: pyflight has a Rust part (PyO3) and there's no wheel of it for the browser's CPython yet,\nso it doesn't run on this card. For real, in a terminal: \x1b[33mpip install pyflight\x1b[0m\n\n`) +
        `${p.plain[c.pt ? 'pt' : 'en']}\n\x1b[36m${p.url}\x1b[0m\n`,
    )
    return 1
  }
}

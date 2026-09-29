import * as React from 'react'
import { useMemo, useState, type ComponentType } from 'react'
import { findFrame } from '../../cinema/progress'
import { usherSays } from '../../cinema/usher'
import { useFilm } from '../../film/store'
import Slate from './Slate'
import source from './Slate.tsx?raw'
import wasmURL from 'esbuild-wasm/esbuild.wasm?url'
import './montagem.css'

// A Sala de Montagem (ROTEIRO §0.4.6, frame 45): the site editing itself.
// ./Slate.tsx is a real component of this page; here is its real source.
// Change it, and esbuild (compiled to WebAssembly) builds it in your browser;
// the new module is loaded from a Blob and swapped in for the old one, live.
// Only for you, in this tab: it's a local deploy.

let ready: Promise<typeof import('esbuild-wasm')> | null = null
function esbuild() {
  ready ??= import('esbuild-wasm').then(async (e) => {
    await e.initialize({ wasmURL })
    return e
  })
  return ready
}

;(window as unknown as { __snReact: typeof React }).__snReact = React

/** A unified diff of two small files (longest common subsequence of lines). */
function diff(a: string, b: string) {
  const x = a.split('\n')
  const y = b.split('\n')
  const m = x.length
  const n = y.length
  const L = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0))
  for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--) L[i][j] = x[i] === y[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1])
  const out: string[] = ['--- a/src/exit/montagem/Slate.tsx', '+++ b/src/exit/montagem/Slate.tsx']
  let i = 0
  let j = 0
  while (i < m || j < n) {
    if (i < m && j < n && x[i] === y[j]) (i++, j++)
    else if (i < m && (j >= n || L[i + 1][j] >= L[i][j + 1])) out.push(`-${x[i++]}`)
    else out.push(`+${y[j++]}`)
  }
  return out.join('\n')
}

export function EditingRoom() {
  const lang = useFilm((s) => s.lang)
  const pt = lang === 'pt'
  const [text, setText] = useState(source)
  const [Live, setLive] = useState<ComponentType>(() => Slate)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showDiff, setShowDiff] = useState(false)
  const changed = text !== source
  const patch = useMemo(() => (showDiff ? diff(source, text) : ''), [showDiff, text])

  const build = async () => {
    setError(null)
    setStatus(pt ? 'montando com o esbuild (WebAssembly)…' : 'building with esbuild (WebAssembly)…')
    const t0 = performance.now()
    try {
      const e = await esbuild()
      const out = await e.transform(text, { loader: 'tsx', format: 'esm', jsx: 'transform', jsxFactory: '__h', jsxFragment: '__F', sourcefile: 'Slate.tsx' })
      const code = `const __h = window.__snReact.createElement, __F = window.__snReact.Fragment;\n${out.code}`
      const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }))
      const mod = (await import(/* @vite-ignore */ url)) as { default?: ComponentType }
      URL.revokeObjectURL(url)
      if (typeof mod.default !== 'function') throw new Error(pt ? 'o arquivo precisa exportar um componente (export default)' : 'the file must export a component (export default)')
      setLive(() => mod.default!)
      setStatus(pt ? `montado em ${Math.round(performance.now() - t0)} ms e trocado ao vivo` : `built in ${Math.round(performance.now() - t0)} ms and swapped in, live`)
      if (changed) {
        findFrame('rebuild')
        usherSays(pt ? 'Você acabou de fazer deploy do meu portfólio. Localmente. Relaxa.' : 'You just shipped my portfolio. Locally. Relax.', true)
      }
    } catch (err) {
      setStatus(null)
      setError(String((err as Error).message ?? err))
    }
  }

  return (
    <div className="montagem">
      <div className="montagem-stage">
        <Live />
      </div>
      <div className="montagem-editor">
        <p className="montagem-file">src/exit/montagem/Slate.tsx</p>
        <textarea value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} aria-label="Slate.tsx" />
        <div className="montagem-row">
          <button onClick={build}>✂ {pt ? 'Montar e trocar ao vivo' : 'Build and swap in, live'}</button>
          <button disabled={!changed} onClick={() => setShowDiff((d) => !d)}>
            {pt ? 'Virar um patch' : 'Turn it into a patch'}
          </button>
          <button disabled={!changed} onClick={() => (setText(source), setLive(() => Slate), setStatus(null), setError(null))}>
            ↺ {pt ? 'Voltar ao original' : 'Back to the original'}
          </button>
        </div>
        {status && <p className="montagem-ok">{status}</p>}
        {error && <pre className="montagem-err">{error}</pre>}
        {showDiff && (
          <>
            <pre className="montagem-diff">{patch}</pre>
            <p className="montagem-note">
              {pt ? 'Para propor de verdade: ' : 'To propose it for real: '}
              <a href="https://github.com/Tech-GabrielLima/gabriel-lima/edit/main/src/exit/montagem/Slate.tsx" target="_blank" rel="noreferrer">
                github.com/Tech-GabrielLima/gabriel-lima
              </a>
            </p>
          </>
        )}
      </div>
    </div>
  )
}

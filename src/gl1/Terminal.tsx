import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useFilm } from '../film/store'
import { CardBus } from './cards'
import { answer } from './host'
import { Gl1 } from './machine'
import { Screen, type Cell } from './vt'
import { useWorld } from './world'
import './gl1.css'

// A terminal on the GL-1 (ROTEIRO §0.4). The machine runs a frame at a time
// here; what GL-OS prints is drawn by vt.ts; the keyboard (or the phone's)
// types into it; the mailbox is answered by host.ts and the expansion bus
// by cards.ts. Each terminal logs in as someone: caixa in the box office,
// visitante in the booth, root in the machine room.

const enc = new TextEncoder()

const KEYS: Record<string, number[]> = {
  Enter: [13],
  Backspace: [127],
  Tab: [9],
  Escape: [27],
  ArrowUp: [27, 91, 65],
  ArrowDown: [27, 91, 66],
  ArrowRight: [27, 91, 67],
  ArrowLeft: [27, 91, 68],
}

/** One line of cells → runs of the same colour. */
function Line({ cells, cursor }: { cells: Cell[]; cursor: number }) {
  const out: React.ReactNode[] = []
  let run = ''
  let key: string | null = null
  const flush = (i: number) => {
    if (run && key !== null) {
      const [fg, bold] = key.split(':')
      out.push(
        <span key={i} className={`c${fg}${bold === '1' ? ' b' : ''}`}>
          {run}
        </span>,
      )
    }
    run = ''
  }
  cells.forEach((c, i) => {
    if (i === cursor) {
      flush(i)
      key = null
      out.push(
        <span key={`cur${i}`} className="cur">
          {c.ch}
        </span>,
      )
      return
    }
    const k = `${c.fg}:${c.bold ? 1 : 0}`
    if (k !== key) {
      flush(i)
      key = k
    }
    run += c.ch
  })
  flush(cells.length)
  return <div className="tl">{out.length ? out : ' '}</div>
}

export function Terminal({ user, label, onReady }: { user: number; label: string; onReady?: (m: Gl1) => void }) {
  const box = useRef<HTMLDivElement>(null)
  const probe = useRef<HTMLSpanElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  // The screen is an external, mutable store; `version` says when to draw it again.
  const [screen] = useState(() => new Screen(80, 24))
  const machine = useRef<Gl1 | null>(null)
  const [, setVersion] = useState(0)
  const [state, setState] = useState<'booting' | 'on' | 'off' | 'failed'>('booting')
  const follow = useRef(true)
  const lang = useFilm((s) => s.lang)
  const ready = useRef(onReady)
  useEffect(() => {
    ready.current = onReady
  })

  // Boot, and run the machine a frame at a time.
  useEffect(() => {
    let raf = 0
    let alive = true
    let m: Gl1 | null = null
    let restoring = 0
    let lastSave = performance.now()
    Gl1.boot(user, useFilm.getState().lang)
      .then((booted) => {
        if (!alive) return booted.drop()
        m = booted
        machine.current = m
        const bus = new CardBus(m, user)
        const s = screen
        m.setSize(s.cols, s.rows)
        setState('on')
        ready.current?.(m)
        let last = performance.now()
        let lastVersion = -1
        const tick = (now: number) => {
          if (!alive || !m) return
          const dt = Math.min(50, now - last)
          last = now
          if (m.power === 'on') m.run(dt)
          const bytes = m.console()
          if (bytes.length) s.write(bytes)
          for (let msg = m.message(); msg !== null; msg = m.message()) {
            if (msg === 'frame rmrf') {
              // rm -rf / as root: the cinema falls apart, then copy-on-write puts it all back.
              restoring = now + 3200
              useWorld.setState({ collapse: Date.now() })
            }
            const mm = m
            answer(msg, { user }).then((r) => mm.reply(r))
          }
          bus.pump()
          if (restoring && now >= restoring) {
            restoring = 0
            m.revert()
            m.reset()
            s.write(enc.encode(`\x1b[2J\x1b[H\x1b[33m${useFilm.getState().lang === 'pt' ? 'O FS é copy-on-write. Tá tudo aí.' : "The filesystem is copy-on-write. It's all still there."}\x1b[0m\n\n`))
          }
          const p = m.power
          if (p === 'reboot') m.reset()
          else if (p === 'panic') {
            restoring = restoring || now + 2500
          } else if (p === 'off') setState('off')
          if (now - lastSave > 10_000 && !restoring) {
            lastSave = now
            m.saveDisk()
          }
          if (s.version !== lastVersion) {
            lastVersion = s.version
            setVersion(s.version)
          }
          raf = requestAnimationFrame(tick)
        }
        raf = requestAnimationFrame(tick)
      })
      .catch(() => alive && setState('failed'))
    return () => {
      alive = false
      cancelAnimationFrame(raf)
      m?.drop()
      machine.current = null
    }
  }, [user, screen])

  useEffect(() => machine.current?.setLang(lang), [lang])

  // As many columns and rows as fit.
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const fit = () => {
      const r = probe.current?.getBoundingClientRect()
      if (!r || !r.width) return
      const cols = Math.max(24, Math.min(120, Math.floor((el.clientWidth - 24) / r.width)))
      const rows = Math.max(8, Math.min(60, Math.floor((el.clientHeight - 16) / r.height)))
      screen.resize(cols, rows)
      machine.current?.setSize(cols, rows)
      setVersion((v) => v + 1)
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [screen])

  // Stay at the bottom unless the reader scrolled up.
  useLayoutEffect(() => {
    const el = box.current
    if (el && follow.current) el.scrollTop = el.scrollHeight
  })

  const send = (bytes: number[] | Uint8Array) => bytes.forEach((b) => machine.current?.key(b))
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.metaKey) return
    if (e.ctrlKey && e.key.length === 1) {
      const k = e.key.toLowerCase()
      if (k === 'v') return // paste
      if (k === 'c' && window.getSelection()?.toString()) return // copy
      e.preventDefault()
      send([k.charCodeAt(0) & 31])
      return
    }
    const seq = KEYS[e.key]
    if (seq) {
      e.preventDefault()
      send(seq)
      follow.current = true
    }
  }
  const onInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
    const t = e.currentTarget
    if (t.value) send(enc.encode(t.value.replace(/\n/g, '\r')))
    t.value = ''
    follow.current = true
  }
  const onPaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    send(enc.encode(e.clipboardData.getData('text').replace(/\r?\n/g, '\r')))
  }

  const s = screen
  const all = [...s.scrollback, ...s.lines]
  const cursorRow = s.scrollback.length + s.y
  return (
    <div
      ref={box}
      className="gl1-term"
      role="application"
      aria-label={label}
      onClick={() => input.current?.focus({ preventScroll: true })}
      onScroll={(e) => {
        const el = e.currentTarget
        follow.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 4
      }}
    >
      <span ref={probe} className="gl1-probe" aria-hidden>
        M
      </span>
      <textarea
        ref={input}
        className="gl1-input"
        autoCapitalize="off"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        aria-label={label}
        onKeyDown={onKeyDown}
        onInput={onInput}
        onPaste={onPaste}
      />
      {state === 'booting' && <div className="gl1-status">GL-1 · {lang === 'pt' ? 'ligando' : 'powering on'}…</div>}
      {state === 'failed' && <div className="gl1-status">{lang === 'pt' ? 'A GL-1 não ligou (o WebAssembly não carregou).' : "The GL-1 didn't power on (WebAssembly didn't load)."}</div>}
      {state === 'off' && <div className="gl1-status">{lang === 'pt' ? '[desligado]' : '[powered off]'}</div>}
      <div className="gl1-screen" aria-live="off">
        {all.map((cells, i) => (
          <Line key={i} cells={cells} cursor={i === cursorRow ? s.x : -1} />
        ))}
      </div>
    </div>
  )
}

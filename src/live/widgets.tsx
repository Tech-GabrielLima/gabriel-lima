import { useEffect, useMemo, useRef, useState } from 'react'
import type { Lang } from '../film/store'
import { Cluster } from '../scenes/alley/installations/raft'
import { HALE_EXAMPLES, compileHale, loadHale, type Analysis } from './hale'
import { connectLive, live, px, useLive, type LiveState } from './live'
import './widgets.css'

// The projects, running (ROTEIRO §0.1, phases 11 and 13). Plain DOM, so the
// same panels serve Act III and the overlays opened from inside the film.

const L = <T,>(lang: Lang, en: T, pt: T) => (lang === 'pt' ? pt : en)

/** "● LIVE · server" or "○ OFFLINE · local simulation": the panels never pretend. */
export function LiveBadge({ lang, local }: { lang: Lang; local?: string }) {
  const status = useLive((s) => s.status)
  useEffect(connectLive, [])
  const on = status === 'live'
  return (
    <span className={`live-badge${on ? ' on' : ''}`}>
      {on ? '●' : '○'}{' '}
      {on
        ? L(lang, 'live · shared with everyone here now', 'ao vivo · compartilhado com quem está aqui agora')
        : status === 'connecting'
          ? L(lang, 'connecting…', 'conectando…')
          : status === 'waking'
            ? L(lang, 'waking the live server up (free plan, about a minute)…', 'acordando o servidor ao vivo (plano gratuito, cerca de 1 minuto)…')
            : (local ?? L(lang, 'offline · local simulation', 'offline · simulação local'))}
    </span>
  )
}

/* ------------------------------------------------------------------ raft */

type View = { id: number; role: 'leader' | 'follower' | 'candidate' | 'down'; term: number; commit?: number; healIn?: number }

/** The cluster to draw: the live one when connected, else the local election simulation. */
function useRaftView() {
  const status = useLive((s) => s.status)
  const state = useLive((s) => s.state)
  const sim = useMemo(() => new Cluster(5), [])
  const [, tick] = useState(0)

  useEffect(() => {
    if (status === 'live') return
    let raf = 0
    let last = performance.now()
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      sim.step(Math.min(0.05, (now - last) / 1000))
      last = now
      tick(sim.version)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [status, sim])

  if (status === 'live' && state) {
    // Countdowns in the server's own clock, from the snapshot itself.
    const now = state.t
    const nodes: View[] = state.raft.nodes.map((n) => ({
      id: n.id,
      role: n.up ? n.role : 'down',
      term: n.term,
      commit: n.commit,
      healIn: state.raft.healAt[n.id] ? Math.max(0, Math.ceil((state.raft.healAt[n.id] - now) / 1000)) : undefined,
    }))
    return { live: true as const, nodes, leader: state.raft.leader, raft: state.raft, toggle: (i: number) => void live.toggleNode(i) }
  }
  const nodes: View[] = sim.nodes.map((n) => ({ id: n.id, role: n.role, term: n.term }))
  return { live: false as const, nodes, leader: sim.leader?.id ?? -1, raft: null, toggle: (i: number) => sim.toggle(i) }
}

export function RaftPanel({ lang }: { lang: Lang }) {
  const v = useRaftView()
  const [clap, setClap] = useState<string | null>(null)
  const R = 38
  const pos = v.nodes.map((_, i) => {
    const a = -Math.PI / 2 + (i / v.nodes.length) * Math.PI * 2
    return { x: 50 + R * Math.cos(a), y: 50 + R * Math.sin(a) }
  })
  const leader = v.nodes.find((n) => n.role === 'leader')
  const down = v.nodes.filter((n) => n.role === 'down').length

  const doClap = async () => {
    setClap(L(lang, 'proposing to the leader…', 'propondo ao líder…'))
    const r = await live.clap()
    setClap(
      r
        ? L(lang, `committed at index ${r.index} by node ${r.leader + 1}, on a majority`, `confirmado no índice ${r.index} pelo nó ${r.leader + 1}, numa maioria`)
        : L(lang, 'no leader right now: try again in a second', 'sem líder agora: tente de novo em um segundo'),
    )
  }

  return (
    <div className="panel raft-panel">
      <svg viewBox="0 0 100 100" className="raft-ring" role="group" aria-label="Raft cluster">
        {leader &&
          v.nodes.map((n, i) =>
            n.id === leader.id || n.role === 'down' ? null : (
              <line key={i} x1={pos[leader.id].x} y1={pos[leader.id].y} x2={pos[i].x} y2={pos[i].y} className="raft-beat" />
            ),
          )}
        {v.nodes.map((n, i) => (
          <g key={n.id} className={`raft-node ${n.role}`} transform={`translate(${pos[i].x} ${pos[i].y})`} onClick={() => v.toggle(n.id)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && v.toggle(n.id)} aria-label={`node ${n.id + 1} ${n.role}`}>
            <circle r="9" className="halo" />
            <circle r="5.2" className="core" />
            <text y="15.5" textAnchor="middle">
              {n.role === 'down' ? (n.healIn !== undefined ? `✕ ${n.healIn}s` : '✕') : `N${n.id + 1} · T${n.term}`}
            </text>
          </g>
        ))}
        <text x="50" y="49" textAnchor="middle" className="raft-center">
          {leader ? L(lang, 'LEADER', 'LÍDER') : L(lang, 'ELECTION', 'ELEIÇÃO')}
        </text>
        <text x="50" y="56" textAnchor="middle" className="raft-center big">
          {leader ? `N${leader.id + 1}` : '…'}
        </text>
      </svg>
      <div className="panel-side">
        <p className="panel-lead">{L(lang, 'Click a lighthouse to take that node off the network.', 'Clique num farol para tirar aquele nó da rede.')}</p>
        <p className="panel-note">
          {L(
            lang,
            'The others notice the missing heartbeats, hold an election and pick a new leader. Two nodes can be down at once; a majority always survives. Downed nodes come back by themselves.',
            'Os outros percebem que as batidas pararam, fazem uma eleição e escolhem um novo líder. Até dois nós podem cair ao mesmo tempo; a maioria sempre sobrevive. Os nós voltam sozinhos.',
          )}
        </p>
        {v.live && v.raft ? (
          <>
            <dl className="mini-stats">
              <div>
                <dt>{L(lang, 'term', 'mandato')}</dt>
                <dd>{leader?.term ?? '—'}</dd>
              </div>
              <div>
                <dt>{L(lang, 'commit index', 'índice de commit')}</dt>
                <dd>{leader?.commit ?? '—'}</dd>
              </div>
              <div>
                <dt>RPCs</dt>
                <dd>{v.raft.rpcs.toLocaleString()}</dd>
              </div>
              <div>
                <dt>{L(lang, 'down', 'fora')}</dt>
                <dd>{down}/5</dd>
              </div>
            </dl>
            <button className="act" onClick={doClap}>
              👏 {L(lang, 'Applaud through consensus', 'Aplaudir por consenso')} · {v.raft.claps.toLocaleString()}
            </button>
            {clap && <p className="panel-result">{clap}</p>}
          </>
        ) : (
          <p className="panel-note dim">{L(lang, 'Offline: a local leader-election simulation runs instead of the real cluster.', 'Offline: roda uma simulação local de eleição no lugar do cluster real.')}</p>
        )}
        <LiveBadge lang={lang} />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ book */

export function BookPanel({ lang }: { lang: Lang }) {
  const status = useLive((s) => s.status)
  const book = useLive((s) => s.state?.book)
  const [result, setResult] = useState<string | null>(null)
  const [qty, setQty] = useState(5)

  if (status !== 'live' || !book) {
    return (
      <div className="panel book-panel offline">
        <p className="panel-lead">
          {status === 'waking' || status === 'connecting'
            ? L(lang, 'The order book is on its way: the server is waking up.', 'O livro de ofertas está chegando: o servidor está acordando.')
            : L(lang, 'The order book is shared by everyone watching, so it only exists on the server.', 'O livro de ofertas é compartilhado por quem está assistindo, então ele só existe no servidor.')}
        </p>
        <LiveBadge lang={lang} local={L(lang, 'offline · the server is asleep', 'offline · o servidor está dormindo')} />
      </div>
    )
  }

  const max = Math.max(1, ...book.bids.map((b) => b[1]), ...book.asks.map((a) => a[1]))
  const send = async (side: 'BUY' | 'SELL') => {
    setResult('…')
    const r = await live.order({ side, type: 'MARKET', qty })
    if (!r) return setResult(L(lang, 'rejected (too fast? wait a second)', 'rejeitada (rápido demais? espere um segundo)'))
    const rep = r.reports[r.reports.length - 1]
    const filled = r.trades.reduce((a, t) => a + t[1], 0)
    const avg = filled ? r.trades.reduce((a, t) => a + t[0] * t[1], 0) / filled : 0
    setResult(
      filled
        ? L(lang, `order #${r.id}: ${rep?.status} · ${filled} @ ${px(Math.round(avg))} across ${r.trades.length} trade(s)`, `ordem #${r.id}: ${rep?.status} · ${filled} @ ${px(Math.round(avg))} em ${r.trades.length} negócio(s)`)
        : L(lang, `order #${r.id}: ${rep?.status ?? 'no liquidity'}`, `ordem #${r.id}: ${rep?.status ?? 'sem liquidez'}`),
    )
  }

  const asks = [...book.asks].reverse()
  return (
    <div className="panel book-panel">
      <div className="ladder" aria-label="order book">
        {asks.map(([p, q]) => (
          <div key={`a${p}`} className="lvl ask">
            <span className="bar" style={{ width: `${(q / max) * 100}%` }} />
            <span className="p">{px(p)}</span>
            <span className="q">{q}</span>
          </div>
        ))}
        <div className="spread">
          {book.bestAsk && book.bestBid ? `${L(lang, 'spread', 'spread')} ${px(book.bestAsk - book.bestBid)}` : '—'}
        </div>
        {book.bids.map(([p, q]) => (
          <div key={`b${p}`} className="lvl bid">
            <span className="bar" style={{ width: `${(q / max) * 100}%` }} />
            <span className="p">{px(p)}</span>
            <span className="q">{q}</span>
          </div>
        ))}
      </div>
      <div className="panel-side">
        <p className="panel-lead">{L(lang, 'Send a real order to the matching engine.', 'Envie uma ordem de verdade para o matching engine.')}</p>
        <p className="panel-note">
          {L(
            lang,
            'Price-time priority, the same engine that does 3.6M orders/s in its benchmark. A bot keeps the book liquid; everyone on the site trades against the same book.',
            'Prioridade preço-tempo, o mesmo engine que faz 3,6M ordens/s no benchmark. Um bot mantém o livro com liquidez; todo mundo no site negocia no mesmo livro.',
          )}
        </p>
        <div className="order-row">
          <label>
            {L(lang, 'qty', 'qtd')}
            <input type="number" min={1} max={50} value={qty} onChange={(e) => setQty(Math.max(1, Math.min(50, Number(e.target.value) || 1)))} />
          </label>
          <button className="act buy" onClick={() => send('BUY')}>
            {L(lang, 'Buy at market', 'Comprar a mercado')}
          </button>
          <button className="act sell" onClick={() => send('SELL')}>
            {L(lang, 'Sell at market', 'Vender a mercado')}
          </button>
        </div>
        {result && <p className="panel-result">{result}</p>}
        <ol className="tape">
          {book.last.slice(0, 8).map(([id, p, q, side]) => (
            <li key={id} className={side === 'BUY' ? 'up' : 'down'}>
              <span>#{id}</span> {side === 'BUY' ? '▲' : '▼'} {q} @ {px(p)}
            </li>
          ))}
        </ol>
        <dl className="mini-stats">
          <div>
            <dt>{L(lang, 'trades', 'negócios')}</dt>
            <dd>{book.trades.toLocaleString()}</dd>
          </div>
          <div>
            <dt>{L(lang, 'orders', 'ordens')}</dt>
            <dd>{book.orders.toLocaleString()}</dd>
          </div>
        </dl>
        <LiveBadge lang={lang} />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ hale */

export function HalePlayground({ lang }: { lang: Lang }) {
  const [ex, setEx] = useState(HALE_EXAMPLES[0].id)
  const [code, setCode] = useState(HALE_EXAMPLES[0].code)
  const [out, setOut] = useState<Analysis | null>(null)
  const [ver, setVer] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const timer = useRef(0)

  useEffect(() => {
    loadHale().then(setVer, () => setFailed(true))
  }, [])
  useEffect(() => {
    clearTimeout(timer.current)
    timer.current = window.setTimeout(() => compileHale(code).then(setOut, () => setFailed(true)), 90)
    return () => clearTimeout(timer.current)
  }, [code])

  const pick = (id: string) => {
    setEx(id)
    setCode(HALE_EXAMPLES.find((e) => e.id === id)!.code)
  }

  return (
    <div className="panel hale-panel">
      <div className="hale-tabs" role="tablist">
        {HALE_EXAMPLES.map((e) => (
          <button key={e.id} role="tab" aria-selected={ex === e.id} className={ex === e.id ? 'on' : ''} onClick={() => pick(e.id)}>
            {e.title[lang]}
          </button>
        ))}
      </div>
      <div className="hale-grid">
        <textarea className="hale-code" value={code} onChange={(e) => setCode(e.target.value)} spellCheck={false} aria-label="hale source" />
        <div className="hale-out">
          {failed ? (
            <p className="panel-note">{L(lang, 'This browser could not start the WebAssembly compiler.', 'Este navegador não conseguiu iniciar o compilador WebAssembly.')}</p>
          ) : !out ? (
            <p className="panel-note">{L(lang, 'loading the compiler…', 'carregando o compilador…')}</p>
          ) : (
            <>
              <p className={`hale-verdict ${out.errors ? 'bad' : out.warnings ? 'warn' : 'ok'}`}>
                {out.errors
                  ? L(lang, `✕ ${out.errors} error(s): it won't compile`, `✕ ${out.errors} erro(s): não compila`)
                  : out.warnings
                    ? L(lang, `△ compiles, ${out.warnings} warning(s)`, `△ compila, ${out.warnings} aviso(s)`)
                    : L(lang, '✓ compiles', '✓ compila')}
              </p>
              {out.diagnostics.trim() && <pre className="hale-diag">{out.diagnostics}</pre>}
              {out.plan.trim() && (
                <>
                  <p className="hale-label">{L(lang, 'execution plan', 'plano de execução')}</p>
                  <pre className="hale-plan">{out.plan}</pre>
                </>
              )}
            </>
          )}
        </div>
      </div>
      <p className="hale-foot">
        {L(lang, 'Edit freely: every keystroke goes through hale’s real compiler', 'Edite à vontade: cada tecla passa pelo compilador real do hale')} (Rust → WebAssembly
        {ver ? ` · v${ver}` : ''}){out ? L(lang, `, ${out.micros} µs in your browser, no server.`, `, ${out.micros} µs no seu navegador, sem servidor.`) : '.'}
      </p>
    </div>
  )
}

/* ------------------------------------------------------------------ machine room */

const fmtUptime = (s: number) => {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h ? `${h}h ${m}m` : `${m}m ${Math.floor(s % 60)}s`
}

/** The site's own backend, live: the site is one of the projects. */
export function MachineRoom({ lang }: { lang: Lang }) {
  const state = useLive((s) => s.state) as LiveState | null
  const status = useLive((s) => s.status)
  useEffect(connectLive, [])
  if (status !== 'live' || !state) {
    return (
      <div className="panel machine offline">
        <LiveBadge lang={lang} local={L(lang, 'offline · the machine room is dark', 'offline · a sala de máquinas está apagada')} />
      </div>
    )
  }
  const m = state.machine
  const tiles: [string, string][] = [
    [L(lang, 'watching now', 'assistindo agora'), String(state.audience)],
    [L(lang, 'tickets tonight', 'ingressos hoje'), state.tickets.toLocaleString()],
    [L(lang, 'uptime', 'no ar há'), fmtUptime(m.uptime)],
    [L(lang, 'Raft RPCs', 'RPCs do Raft'), state.raft.rpcs.toLocaleString()],
    [L(lang, 'trades matched', 'negócios casados'), state.book.trades.toLocaleString()],
    [L(lang, 'events streamed', 'eventos transmitidos'), m.events.toLocaleString()],
    [L(lang, 'HTTP requests', 'requisições HTTP'), m.requests.toLocaleString()],
    ['heap', `${m.heapMb} MB`],
    ['threads', String(m.threads)],
    ['JVM', m.java],
  ]
  return (
    <div className="panel machine">
      <dl className="tiles">
        {tiles.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <LiveBadge lang={lang} />
    </div>
  )
}

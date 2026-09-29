import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useCurtain } from '../film/curtain'
import { exitRoom, useRoom } from '../film/room'
import { useFilm } from '../film/store'
import { live, useLive } from '../live/live'
import { placeOrder, price } from '../scenes/rooms/match/orders'
import { useMatchRoom } from '../scenes/rooms/match/state'
import { VERSIONS, useCudaRoom } from '../scenes/rooms/cuda/state'
import { measureAll, getGpu, N as GEMM_N, type Measure } from '../scenes/rooms/cuda/gemm'
import { usherSays } from '../cinema/usher'
import { go, useFlightRoom } from '../scenes/rooms/flight/state'
import { BENCH, useHaleRoom } from '../scenes/rooms/hale/state'
import { ledgerCommand, useLedgerRoom } from '../scenes/rooms/ledger/state'
import { setPad, useNablaRoom } from '../scenes/rooms/nabla/state'
import { findFrame } from '../cinema/progress'
import { FLOORS, REPOS, useObrasRoom } from '../scenes/rooms/obras/state'
import { useRaftRoom } from '../scenes/rooms/raft/state'
import { useDirector } from '../scenes/rooms/shared'

// The words and controls inside a room (film/room.ts), over the picture: its
// name, what the live system is doing, a way to act on it, the director's
// shots, and the way back out. The camera itself is the visitor's (drag, wheel,
// pinch), so this stays at the edges.

type Lang = 'en' | 'pt'

export function RoomUI() {
  const room = useRoom((s) => s.room)
  if (room === 'raft') return <RaftPanel />
  if (room === 'match') return <MatchPanel />
  if (room === 'obras') return <ObrasPanel />
  if (room === 'ledger') return <LedgerPanel />
  if (room === 'cuda') return <CudaPanel />
  if (room === 'nabla') return <NablaPanel />
  if (room === 'hale') return <HalePanel />
  if (room === 'flight') return <FlightPanel />
  return null
}

/** What every room shares: the header, the director's shots (and keys 1–4), the help line, the way out. */
function Shell(p: { kicker: string; title: string; state: ReactNode; shots: string[]; shoot: (k: number) => void; help: string; children: ReactNode }) {
  const pt = useFilm((s) => s.lang) === 'pt'
  // Nothing of the room shows over the curtain: it arrives with the picture.
  const shown = useCurtain((s) => s.phase === 'open' || s.phase === 'opening')
  const { shoot } = p
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest?.('input, textarea')) return
      if (e.key === 'Escape') exitRoom()
      else if (/^[1-4]$/.test(e.key)) shoot(Number(e.key))
    }
    addEventListener('keydown', key)
    return () => removeEventListener('keydown', key)
  }, [shoot])

  return (
    <div className={`room-ui${shown ? '' : ' room-ui-hidden'}`}>
      <header className="room-head">
        <p className="room-kicker">{p.kicker}</p>
        <h2 className="room-title">{p.title}</h2>
        <p className="room-state">{p.state}</p>
      </header>
      {p.children}
      <nav className="room-shots" aria-label={pt ? 'planos' : 'shots'}>
        {p.shots.map((n, i) => (
          <button key={n} onClick={() => shoot(i + 1)}>
            <kbd>{i + 1}</kbd> {n}
          </button>
        ))}
      </nav>
      <p className="room-help">{p.help}</p>
      <button className="room-exit" onClick={exitRoom}>
        ← {pt ? 'Voltar ao beco' : 'Back to the alley'} <kbd>Esc</kbd>
      </button>
    </div>
  )
}

function Waking({ pt }: { pt: boolean }) {
  return <>{pt ? '○ acordando o servidor (plano gratuito, ~1 min)… a simulação local segura enquanto isso' : '○ waking the server (free plan, ~1 min)… a local simulation holds meanwhile'}</>
}

/* RAFT · O Arquipélago --------------------------------------------------- */

const RAFT_SHOTS: Record<Lang, string[]> = { en: ['The archipelago', 'The leader', 'From above', 'On the water'], pt: ['O arquipélago', 'O líder', 'Do alto', 'Rente à água'] }
const raftShoot = (k: number) => useRaftRoom.setState({ shot: k })

function RaftPanel() {
  const lang = useFilm((s) => s.lang)
  const status = useLive((s) => s.status)
  const raft = useLive((s) => s.state?.raft)
  const [note, setNote] = useState<string | null>(null)
  const elected = useRaftRoom((s) => s.elected)
  const pt = lang === 'pt'

  const isLive = status === 'live' && raft
  const leader = isLive ? raft.leader : -1
  const up = isLive ? raft.nodes.filter((n) => n.up).length : null
  const lnode = isLive && leader >= 0 ? raft.nodes[leader] : null

  const send = async () => {
    useRaftRoom.setState((s) => ({ bottles: s.bottles + 1 }))
    if (!isLive) return setNote(pt ? 'offline: a mensagem viaja na simulação local' : 'offline: the message travels in the local simulation')
    setNote(pt ? 'propondo ao líder…' : 'proposing to the leader…')
    const r = await live.clap()
    setNote(
      r
        ? pt
          ? `confirmada no índice ${r.index} pelo nó ${r.leader + 1}, replicada numa maioria`
          : `committed at index ${r.index} by node ${r.leader + 1}, replicated on a majority`
        : pt
          ? 'sem líder agora (eleição em curso): tente de novo'
          : 'no leader right now (an election is on): try again',
    )
  }

  return (
    <Shell
      kicker={pt ? 'Sala 03 · raft-kv-store' : 'Room 03 · raft-kv-store'}
      title={pt ? 'O Arquipélago' : 'The Archipelago'}
      state={
        isLive ? (
          <>
            <span className="room-live">● {pt ? 'ao vivo' : 'live'}</span> · {lnode ? `${pt ? 'líder' : 'leader'} N${leader + 1} · ${pt ? 'mandato' : 'term'} ${lnode.term} · commit ${lnode.commit}` : pt ? 'eleição em curso…' : 'election in progress…'} · {up}/5 {pt ? 'no ar' : 'up'} · {raft.rpcs.toLocaleString(pt ? 'pt-BR' : 'en-US')} RPCs
          </>
        ) : status === 'waking' || status === 'connecting' ? (
          <Waking pt={pt} />
        ) : (
          <>{pt ? '○ offline · simulação local da eleição' : '○ offline · local election simulation'}</>
        )
      }
      shots={RAFT_SHOTS[lang]}
      shoot={raftShoot}
      help={
        pt
          ? 'arraste para girar · roda ou pinça para aproximar · clique num farol para derrubá-lo · dois cliques para ir até ele'
          : 'drag to turn · wheel or pinch to zoom · click a lighthouse to take it down · double-click to fly to it'
      }
    >
      {/* Each election, the new term, big over the sea for a few seconds. */}
      {elected && (
        <div className="room-term" key={elected.at}>
          <p className="room-term-k">
            {pt ? 'eleição' : 'election'} · N{elected.leader + 1} {pt ? 'é o novo líder' : 'is the new leader'}
          </p>
          <p className="room-term-n">
            {pt ? 'mandato' : 'term'} {elected.term}
          </p>
        </div>
      )}
      <div className="room-actions">
        <button className="room-send" onClick={send}>
          ✉ {pt ? 'Mandar uma mensagem ao líder' : 'Send the leader a message'}
        </button>
        {note && <p className="room-note">{note}</p>}
      </div>
    </Shell>
  )
}

/* MATCH · O Pregão ------------------------------------------------------- */

const MATCH_SHOTS: Record<Lang, string[]> = { en: ['The avenue', 'The spread', 'From above', 'The ring'], pt: ['A avenida', 'O spread', 'Do alto', 'O ring'] }
const matchShoot = (k: number) => useMatchRoom.setState({ shot: k })

function MatchPanel() {
  const lang = useFilm((s) => s.lang)
  const status = useLive((s) => s.status)
  const book = useLive((s) => (s.status === 'live' ? s.state?.book : undefined))
  const note = useMatchRoom((s) => s.note)
  const pt = lang === 'pt'
  const loc = pt ? 'pt-BR' : 'en-US'
  const checks = (book as { checks?: number; mismatches?: number } | undefined)?.checks
  const mism = (book as { mismatches?: number } | undefined)?.mismatches

  return (
    <Shell
      kicker={pt ? 'Sala 04 · lowlatency-matching-engine' : 'Room 04 · lowlatency-matching-engine'}
      title={pt ? 'O Pregão' : 'The Trading Floor'}
      state={
        book ? (
          <>
            <span className="room-live">● {pt ? 'ao vivo' : 'live'}</span> · {book.trades.toLocaleString(loc)} {pt ? 'negócios' : 'trades'} · {pt ? 'último' : 'last'} {book.last[0] ? price(book.last[0][1]) : '—'} · {book.orders.toLocaleString(loc)} {pt ? 'ordens' : 'orders'}
            {checks !== undefined && (
              <>
                {' '}
                · {checks.toLocaleString(loc)} {pt ? 'verificações' : 'checks'}, {mism ?? 0} {pt ? 'divergências' : 'mismatches'}
              </>
            )}
          </>
        ) : status === 'waking' || status === 'connecting' ? (
          <Waking pt={pt} />
        ) : (
          <>{pt ? '○ offline · livro simulado localmente · no benchmark: 3,6M ordens/s, p99 ≈ 60µs' : '○ offline · a locally simulated book · benchmarked: 3.6M orders/s, p99 ≈ 60µs'}</>
        )
      }
      shots={MATCH_SHOTS[lang]}
      shoot={matchShoot}
      help={
        pt
          ? 'arraste para girar · roda ou pinça para aproximar · clique num prédio para deixar uma ordem limitada naquele preço'
          : 'drag to turn · wheel or pinch to zoom · click a tower to rest a limit order at its price'
      }
    >
      <div className="room-actions">
        <div className="room-trade">
          <button className="room-send room-buy" onClick={() => void placeOrder('BUY', 'MARKET', 0, 5)}>
            ▲ {pt ? 'Comprar 5 a mercado' : 'Buy 5 at market'}
          </button>
          <button className="room-send room-sell" onClick={() => void placeOrder('SELL', 'MARKET', 0, 5)}>
            ▼ {pt ? 'Vender 5' : 'Sell 5'}
          </button>
        </div>
        {note && <p className="room-note">{note}</p>}
      </div>
    </Shell>
  )
}

/** The director's shots of the rooms built on rooms/shared.tsx. */
const direct = (k: number) => useDirector.setState({ shot: k })

/* EM OBRAS · a próxima sessão -------------------------------------------- */

const OBRAS_SHOTS: Record<Lang, string[]> = { en: ['The set', 'The crane', 'From above', 'Through the lens'], pt: ['O set', 'A grua', 'Do alto', 'Pela câmera'] }

function ObrasPanel() {
  const lang = useFilm((s) => s.lang)
  const pt = lang === 'pt'
  const built = useObrasRoom((s) => s.built)
  const busy = useObrasRoom((s) => s.busy)
  const full = built >= FLOORS
  const oops = useObrasRoom((s) => s.oops)
  return (
    <Shell
      kicker={pt ? 'Sala 08 · próxima sessão' : 'Room 08 · next session'}
      title={pt ? 'Em Obras' : 'Under Construction'}
      state={
        <>
          {REPOS.length} {pt ? 'repositórios em pesquisa' : 'research repositories in progress'} · {REPOS.map((r) => r.label.toLowerCase()).join(', ')} · {pt ? 'andar' : 'floor'} {built}/{FLOORS}
        </>
      }
      shots={OBRAS_SHOTS[lang]}
      shoot={direct}
      help={pt ? 'arraste para girar · roda ou pinça para aproximar · clique no prédio para chamar o próximo take' : 'drag to turn · wheel or pinch to zoom · click the building to call the next take'}
    >
      <div className="room-actions">
        <button className="room-send" disabled={full} onClick={() => useObrasRoom.setState((s) => (s.busy ? { cut: s.cut + 1 } : { takes: s.takes + 1 }))}>
          {full ? `🎬 ${pt ? 'Estrutura pronta: a sessão está sendo filmada' : 'Frame up: the session is being filmed'}` : busy ? `✂ ${pt ? 'Corta!' : 'Cut!'}` : `🎬 ${pt ? 'Ação! Subir o próximo andar' : 'Action! Raise the next floor'}`}
        </button>
        {oops > 0 && Date.now() - oops < 6000 && (
          <p className="room-note">{pt ? 'CORTA! Erro de gravação: a laje foi ao chão. Ninguém se machucou, é cinema. Take descartado.' : 'CUT! Blooper: the slab hit the ground. Nobody got hurt, it’s cinema. Take scrapped.'}</p>
        )}
        {full && (
          <button className="room-send room-sell" onClick={() => useObrasRoom.setState({ built: 4 })}>
            ↺ {pt ? 'Rodar de novo' : 'Shoot it again'}
          </button>
        )}
      </div>
    </Shell>
  )
}

/* LEDGER · O Cofre ------------------------------------------------------- */

const LEDGER_SHOTS: Record<Lang, string[]> = { en: ['The vault', 'The stacks', 'From above', 'The event store'], pt: ['O cofre', 'As pilhas', 'Do alto', 'O event store'] }

function LedgerPanel() {
  const lang = useFilm((s) => s.lang)
  const pt = lang === 'pt'
  const loc = pt ? 'pt-BR' : 'en-US'
  const stats = useLedgerRoom((s) => s.stats)
  const note = useLedgerRoom((s) => s.note)
  const zero = stats.total + stats.system === 0
  return (
    <Shell
      kicker={pt ? 'Sala 05 · event-sourced-ledger' : 'Room 05 · event-sourced-ledger'}
      title={pt ? 'O Cofre' : 'The Vault'}
      state={
        <>
          <span className="room-live">{zero ? '●' : '○'} Σ = {(stats.total + stats.system).toLocaleString(loc)}</span> · total={stats.total.toLocaleString(loc)} · {stats.events.toLocaleString(loc)} {pt ? 'eventos' : 'events'}
          {stats.batch ? ` · ${stats.batch}` : ''} · {pt ? 'simulação fiel à saga do repositório' : 'a faithful simulation of the repository’s saga'}
        </>
      }
      shots={LEDGER_SHOTS[lang]}
      shoot={direct}
      help={pt ? 'arraste para girar · roda ou pinça para aproximar · clique numa conta e depois noutra para transferir' : 'drag to turn · wheel or pinch to zoom · click one account, then another, to transfer'}
    >
      <div className="room-actions">
        <div className="room-trade">
          <button className="room-send" onClick={() => ledgerCommand('storm')}>
            ⚡ {pt ? '1000 transferências simultâneas' : '1000 concurrent transfers'}
          </button>
          <button className="room-send room-sell" onClick={() => ledgerCommand('replay')}>
            🔑 {pt ? 'Repetir a mesma chave' : 'Replay the same key'}
          </button>
          <button className="room-send room-alt" onClick={() => ledgerCommand('fail')}>
            ✂ {pt ? 'Falhar no meio' : 'Fail halfway'}
          </button>
        </div>
        {note && <p className="room-note">{note}</p>}
        <VaultConsole pt={pt} />
      </div>
    </Shell>
  )
}

/**
 * Frame 27: a psql prompt on the vault. A balance here isn't a row you can set:
 * it's what the events add up to, so writing one straight is refused.
 */
function VaultConsole({ pt }: { pt: boolean }) {
  const [sql, setSql] = useState('')
  const [reply, setReply] = useState<string | null>(null)
  const run = (e: React.FormEvent) => {
    e.preventDefault()
    const q = sql.trim()
    if (!q) return
    if (/^\s*(update|insert|delete|truncate|alter)\b/i.test(q)) {
      useLedgerRoom.setState({ refusedAt: performance.now() / 1000 })
      setReply(
        pt
          ? 'ERROR: No. Um saldo não é uma linha que se escreve: é a soma dos eventos (TransferInitiated, Debited, Credited…). Não há evento para esse dinheiro, então ele não existe, e Σ continua 0.'
          : "ERROR: No. A balance isn't a row you write: it's what the events add up to (TransferInitiated, Debited, Credited…). There's no event for that money, so it doesn't exist, and Σ stays 0.",
      )
      findFrame('ledger')
    } else if (/^\s*select\b/i.test(q)) {
      const st = useLedgerRoom.getState().stats
      setReply(pt ? `(projeção dos eventos) total = ${st.total}, SYSTEM = ${st.system}, Σ = ${st.total + st.system}, ${st.events} eventos` : `(a projection of the events) total = ${st.total}, SYSTEM = ${st.system}, Σ = ${st.total + st.system}, ${st.events} events`)
    } else setReply(pt ? 'o console do cofre entende SELECT… e também UPDATE, se quiser tentar.' : 'the vault console understands SELECT… and UPDATE too, if you want to try.')
  }
  return (
    <form className="vault-console" onSubmit={run}>
      <label>
        <span>cofre=&gt;</span>
        <input value={sql} onChange={(e) => setSql(e.target.value)} placeholder="UPDATE contas SET saldo = saldo + 1000 WHERE id = 'A';" spellCheck={false} autoComplete="off" />
      </label>
      {reply && <p className={`room-note${reply.startsWith('ERROR') ? ' vault-no' : ''}`}>{reply}</p>}
    </form>
  )
}

/* CUDA · O Silício ------------------------------------------------------- */

const CUDA_SHOTS: Record<Lang, string[]> = { en: ['The die', 'Among the SMs', 'From above', 'C = A × B'], pt: ['O die', 'Entre os SMs', 'Do alto', 'C = A × B'] }

function CudaPanel() {
  const lang = useFilm((s) => s.lang)
  const pt = lang === 'pt'
  const version = useCudaRoom((s) => s.version)
  const done = useCudaRoom((s) => s.done)
  const tiles = useCudaRoom((s) => s.tiles)
  const v = VERSIONS[version]
  return (
    <Shell
      kicker={pt ? 'Sala 07 · cuda-kernels-from-scratch' : 'Room 07 · cuda-kernels-from-scratch'}
      title={pt ? 'O Silício' : 'The Silicon'}
      state={
        <>
          GEMM {v.id} · {v.name[lang]} · C {done}/{tiles} tiles · {v.range} {pt ? 'do cuBLAS, faixa típica (o repositório não publica medições)' : 'of cuBLAS, typical range (the repository publishes no measurements)'}
        </>
      }
      shots={CUDA_SHOTS[lang]}
      shoot={direct}
      help={pt ? 'arraste para girar · roda ou pinça para aproximar · escolha uma versão; clique de novo para recalcular' : 'drag to turn · wheel or pinch to zoom · pick a version; click again to recompute'}
    >
      <div className="room-actions">
        <div className="room-trade room-versions">
          {VERSIONS.map((x, i) => (
            <button key={x.id} className={`room-send${i === version ? '' : ' room-alt'}`} onClick={() => useCudaRoom.setState((s) => ({ version: i, run: s.run + 1 }))}>
              {x.id} · {x.name[lang]}
            </button>
          ))}
        </div>
        <p className="room-note">{v.what[lang]}</p>
        <GemmBench />
      </div>
    </Shell>
  )
}

/** The five versions in WGSL, on the visitor's own GPU: measured, and checked against the CPU. */
function GemmBench() {
  const pt = useFilm((s) => s.lang) === 'pt'
  const [rows, setRows] = useState<(Measure | null)[]>([])
  const [busy, setBusy] = useState(false)
  const [gpu, setGpu] = useState<string | null>(null)
  const [f16, setF16] = useState(true)
  const go = async () => {
    setBusy(true)
    setRows([])
    const g = await getGpu()
    if (typeof g === 'string') {
      setGpu(g)
      setBusy(false)
      return
    }
    setGpu(g.name)
    setF16(g.f16)
    try {
      const r = await measureAll((i, m) => {
        useCudaRoom.setState((s) => ({ version: i, run: m ? s.run : s.run + 1 }))
        setRows((x) => {
          const y = x.slice()
          y[i] = m
          return y
        })
      })
      if (Array.isArray(r) && r[4]?.ok) {
        findFrame('cuda')
        const best = Math.max(...r.map((m) => m.gflops))
        usherSays(pt ? `v5 na sua GPU: ${r[4].gflops.toFixed(0)} GFLOP/s, conferido na CPU. ${r[4].gflops >= best ? 'O mais rápido dos cinco.' : 'Não foi o mais rápido. Silício tem opinião.'}` : `v5 on your GPU: ${r[4].gflops.toFixed(0)} GFLOP/s, checked on the CPU. ${r[4].gflops >= best ? 'The fastest of the five.' : 'Not the fastest. Silicon has opinions.'}`, true)
      }
    } catch (e) {
      setGpu(String((e as Error).message ?? e))
    }
    setBusy(false)
  }
  const top = Math.max(1, ...rows.map((m) => m?.gflops ?? 0))
  const none = gpu === 'no-webgpu' || gpu === 'no-adapter'
  return (
    <div className="gemm">
      <button className="room-send" disabled={busy} onClick={go}>
        {busy ? (pt ? 'medindo…' : 'measuring…') : pt ? `Medir v1–v5 na sua GPU (WGSL, ${GEMM_N}×${GEMM_N})` : `Measure v1–v5 on your GPU (WGSL, ${GEMM_N}×${GEMM_N})`}
      </button>
      {none && <p className="room-note">{pt ? 'Este navegador não expõe WebGPU. Os números acima continuam sendo a faixa típica do README.' : 'This browser exposes no WebGPU. The numbers above stay the README’s typical range.'}</p>}
      {gpu && !none && <p className="gemm-gpu">{gpu}</p>}
      {rows.length > 0 && (
        <ul className="gemm-rows">
          {VERSIONS.map((x, i) => {
            const m = rows[i]
            return (
              <li key={x.id}>
                <b>{x.id}</b>
                <span className="gemm-bar">
                  <i style={{ width: `${((m?.gflops ?? 0) / top) * 100}%` }} />
                </span>
                <span>{m ? `${m.gflops.toFixed(1)} GFLOP/s · ${m.ms.toFixed(2)} ms ${m.ok ? '✓' : '✗'}` : i === rows.length - 1 ? '…' : ''}</span>
              </li>
            )
          })}
        </ul>
      )}
      {rows.length > 0 && (
        <p className="room-note">
          {pt
            ? `Tempo de parede por GEMM, média de várias execuções; cada resultado conferido contra a CPU em 48 entradas. WebGPU não tem Tensor Cores: o v5 aqui é a receita deles (entrada FP16, acumulação FP32) sobre o v4${f16 ? '' : ', mas a sua GPU não expõe shader-f16, então roda em FP32'}.`
            : `Wall time per GEMM, averaged over several runs; every result checked against the CPU on 48 entries. WebGPU has no Tensor Cores: v5 here is their recipe (FP16 in, FP32 accumulate) on top of v4${f16 ? '' : ', but your GPU exposes no shader-f16, so it runs in FP32'}.`}
        </p>
      )}
    </div>
  )
}

/* NABLA · A Rede --------------------------------------------------------- */

const NABLA_SHOTS: Record<Lang, string[]> = { en: ['The network', 'The input', 'From above', 'The answer'], pt: ['A rede', 'A entrada', 'Do alto', 'A resposta'] }

/** The 8×8 pad: drag to draw (a soft brush, 0..16 per cell like the dataset), shift or right button to erase. */
function Pad() {
  const x = useNablaRoom((s) => s.x)
  const drawing = useRef<null | number>(null)
  const paint = (e: React.PointerEvent<HTMLDivElement>) => {
    if (drawing.current === null) return
    const r = e.currentTarget.getBoundingClientRect()
    const cx = ((e.clientX - r.left) / r.width) * 8 - 0.5
    const cy = ((e.clientY - r.top) / r.height) * 8 - 0.5
    const next = useNablaRoom.getState().x.slice()
    for (let i = 0; i < 64; i++) {
      const d = Math.hypot((i % 8) - cx, Math.floor(i / 8) - cy)
      const k = Math.max(0, 1 - d / 1.1)
      next[i] = Math.round(Math.min(16, Math.max(0, next[i] + drawing.current * k * 7)))
    }
    setPad(next)
  }
  return (
    <div
      className="nabla-pad"
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        drawing.current = e.button === 2 || e.shiftKey ? -1 : 1
        paint(e)
      }}
      onPointerMove={paint}
      onPointerUp={() => (drawing.current = null)}
      onPointerCancel={() => (drawing.current = null)}
    >
      {x.map((v, i) => (
        <i key={i} style={{ opacity: 0.08 + (v / 16) * 0.92 }} />
      ))}
    </div>
  )
}

function NablaPanel() {
  const lang = useFilm((s) => s.lang)
  const pt = lang === 'pt'
  const pred = useNablaRoom((s) => s.pred)
  const note = useNablaRoom((s) => s.note)
  const samples = useNablaRoom((s) => s.samples)
  const acc = useNablaRoom((s) => s.acc)
  const test = useNablaRoom((s) => s.test)
  return (
    <Shell
      kicker={pt ? 'Sala 06 · nabla + nano-llm' : 'Room 06 · nabla + nano-llm'}
      title={pt ? 'A Rede' : 'The Network'}
      state={
        <>
          MLP 64→128→64→10 · {pt ? 'rodando no seu navegador' : 'running in your browser'}
          {acc ? ` · ${(acc * 100).toFixed(1)}% ${pt ? 'em' : 'on'} ${test} ${pt ? 'dígitos de teste' : 'test digits'}` : ''}
          {pred ? ` · ${pt ? 'diz' : 'says'} ${pred.digit} (${Math.round(pred.p * 100)}%)` : ''}
        </>
      }
      shots={NABLA_SHOTS[lang]}
      shoot={direct}
      help={pt ? 'arraste para girar · roda ou pinça para aproximar · desenhe no quadro (botão direito apaga)' : 'drag to turn · wheel or pinch to zoom · draw on the pad (right button erases)'}
    >
      <div className="room-actions nabla-actions">
        <Pad />
        <div className="nabla-side">
          <div className="room-trade">
            <button className="room-send room-alt" onClick={() => setPad(new Array(64).fill(0))}>
              {pt ? 'Limpar' : 'Clear'}
            </button>
            <button className="room-send room-alt" disabled={!samples.length} onClick={() => setPad(samples[Math.floor(Math.random() * samples.length)].x.slice())}>
              {pt ? 'Um dígito real do teste' : 'A real test digit'}
            </button>
          </div>
          <p className="room-note">{pt ? 'Ensinar: era um…' : 'Teach it: it was a…'}</p>
          <div className="nabla-digits">
            {Array.from({ length: 10 }, (_, d) => (
              <button key={d} className={pred?.digit === d ? 'on' : ''} onClick={() => useNablaRoom.setState((s) => ({ teach: { n: s.teach.n + 1, label: d } }))}>
                {d}
              </button>
            ))}
          </div>
          {note && <p className="room-note">{note}</p>}
          <CinemaWriter pt={pt} />
        </div>
      </div>
    </Shell>
  )
}

/** The room's small language model writes about the cinema (frame 29, scenes/rooms/nabla/llm.ts). */
function CinemaWriter({ pt }: { pt: boolean }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [rate, setRate] = useState<number | null>(null)
  const [params, setParams] = useState(0)
  const go = async () => {
    setBusy(true)
    setRate(null)
    const { loadModel, write } = await import('../scenes/rooms/nabla/llm')
    const m = await loadModel()
    setParams(m.params)
    const prompt = pt ? 'O projetor ' : 'The projector '
    let out = prompt
    setText(out)
    const cps = await write(m, prompt, 220, (c) => setText((out += c)))
    setRate(cps)
    setBusy(false)
    if (out.length > 150) findFrame('llm')
  }
  return (
    <div className="nabla-llm">
      <button className="room-send room-alt" disabled={busy} onClick={go}>
        ✎ {pt ? 'Escrever sobre o cinema' : 'Write about the cinema'}
      </button>
      {text && <p className="nabla-llm-text">{text}</p>}
      {rate !== null && (
        <p className="room-note">
          {pt
            ? `${Math.round(rate)} caracteres/s no seu navegador · GPT de ${(params / 1000).toFixed(0)} mil parâmetros treinado do zero (numpy) em 30 KB sobre este cinema: ele decora e remixa.`
            : `${Math.round(rate)} chars/s in your browser · a ${(params / 1000).toFixed(0)}k-parameter GPT trained from scratch (numpy) on 30 KB about this cinema: it memorises and remixes.`}
        </p>
      )}
    </div>
  )
}

/* HALE · A Catedral ------------------------------------------------------ */

const HALE_SHOTS: Record<Lang, string[]> = { en: ['The nave', 'The windows', 'From above', 'The rose window'], pt: ['A nave', 'Os vitrais', 'Do alto', 'A rosácea'] }

function HalePanel() {
  const lang = useFilm((s) => s.lang)
  const pt = lang === 'pt'
  const note = useHaleRoom((s) => s.note)
  const broken = useHaleRoom((s) => s.broken)
  const stage = useHaleRoom((s) => s.stage)
  const compiled = stage >= 6 && !broken
  const loc = pt ? 'pt-BR' : 'en-US'
  const compile = () => useHaleRoom.setState((s) => ({ compile: s.compile + 1, stage: -1, note: pt ? 'compilando…' : 'compiling…' }))
  const run = (mode: 'serial' | 'waves') => useHaleRoom.setState((s) => ({ run: { n: s.run.n + 1, mode }, note: mode === 'serial' ? (pt ? 'em série: uma requisição depois da outra' : 'serially: one request after another') : pt ? 'em ondas: as independentes, todas juntas' : 'in waves: the independent ones, all at once' }))
  return (
    <Shell
      kicker={pt ? 'Sala 02 · hale' : 'Room 02 · hale'}
      title={pt ? 'A Catedral' : 'The Cathedral'}
      state={
        <>
          lexer → parser → AST → {pt ? 'tipos' : 'types'} → IR → {pt ? 'otimizador' : 'optimizer'} → {pt ? 'executor em ondas' : 'wave executor'} · {BENCH.fetches} fetches: {BENCH.serial.toLocaleString(loc)} ms → {BENCH.parallel.toLocaleString(loc)} ms ({BENCH.speedup.toLocaleString(loc)}×)
        </>
      }
      shots={HALE_SHOTS[lang]}
      shoot={direct}
      help={pt ? 'arraste para girar · roda ou pinça para aproximar · as luzes dos pedidos vão até a rosácea e voltam, 10× mais lentas que o real' : 'drag to turn · wheel or pinch to zoom · the requests’ lights go to the rose window and back, 10× slower than real'}
    >
      <div className="room-actions">
        <div className="room-trade">
          <button className="room-send" onClick={compile}>
            ⛪ {pt ? 'Compilar' : 'Compile'}
          </button>
          <button className="room-send room-sell" disabled={!compiled} onClick={() => run('waves')}>
            ‖ {pt ? 'Rodar em ondas' : 'Run in waves'}
          </button>
          <button className="room-send room-alt" disabled={!compiled} onClick={() => run('serial')}>
            → {pt ? 'Rodar em série' : 'Run serially'}
          </button>
          <button className="room-send room-alt" onClick={() => useHaleRoom.setState((s) => ({ broken: !s.broken, stage: -1, compile: s.compile + 1, note: null }))}>
            {broken ? (pt ? '✓ Devolver o match' : '✓ Put the match back') : pt ? '✕ Tirar o tratamento de erro' : '✕ Remove the error handling'}
          </button>
        </div>
        {note && <pre className="room-note room-pre">{note}</pre>}
      </div>
    </Shell>
  )
}

/* FLIGHT · A Caixa-Preta ------------------------------------------------- */

const FLIGHT_SHOTS: Record<Lang, string[]> = { en: ['The hangar', 'The frames', 'From above', 'The object graph'], pt: ['O hangar', 'Os frames', 'Do alto', 'O grafo de objetos'] }

function FlightPanel() {
  const lang = useFilm((s) => s.lang)
  const pt = lang === 'pt'
  const step = useFlightRoom((s) => s.step)
  const [self, setSelf] = useState(false)
  const notes: Record<string, { en: string; pt: string }> = {
    idle: { en: 'a black box, left by a program that died', pt: 'uma caixa-preta, deixada por um programa que morreu' },
    replay: { en: 'python -m flight inspect crash.flight', pt: 'python -m flight inspect crash.flight' },
    crashed: { en: 'numbers is empty, and data is the same list: the traceback says where, not why', pt: 'numbers está vazia, e data é a mesma lista: o traceback diz onde, não por quê' },
    why: { en: 'python -m flight why crash.flight --var numbers', pt: 'python -m flight why crash.flight --var numbers' },
    fix: { en: 'python -m flight fix … replaying the recording against the fix', pt: 'python -m flight fix … reexecutando a gravação contra a correção' },
    verified: { en: 'FIX VERIFIED: the same recorded run, and the crash is gone', pt: 'FIX VERIFIED: a mesma execução gravada, e o crash sumiu' },
  }
  const after = step === 'crashed' || step === 'why' || step === 'verified'
  return (
    <Shell
      kicker={pt ? 'Sala 01 · flight' : 'Room 01 · flight'}
      title={pt ? 'A Caixa-Preta' : 'The Black Box'}
      state={<>pip install pyflight · Rust + Python · ~65 ns {pt ? 'por evento gravado' : 'per recorded event'} · Flask {pt ? 'a' : 'at'} 98% {pt ? 'da vazão sem ele' : 'of its throughput without it'}</>}
      shots={FLIGHT_SHOTS[lang]}
      shoot={direct}
      help={pt ? 'arraste para girar · roda ou pinça para aproximar · o exemplo é o do README do flight' : 'drag to turn · wheel or pinch to zoom · the example is the one in flight’s README'}
    >
      <div className="room-actions">
        <div className="room-trade">
          <button
            className="room-send"
            onClick={() => {
              // Frame 23: asking for the replay while it's replaying re-enters the recorder, and it crashes itself.
              if (step === 'replay') {
                setSelf(true)
                go('crashed')
                findFrame('flight')
              } else {
                setSelf(false)
                go('replay')
              }
            }}
          >
            ▶ {pt ? 'Reproduzir o crash' : 'Replay the crash'}
          </button>
          <button className="room-send room-sell" disabled={!after} onClick={() => go('why')}>
            ? {pt ? 'Perguntar por quê' : 'Ask why'}
          </button>
          <button className="room-send room-alt" disabled={!after} onClick={() => go('fix')}>
            ✓ {pt ? 'Provar a correção' : 'Prove the fix'}
          </button>
        </div>
        <p className="room-note">{notes[step][lang]}</p>
        {self && (
          <pre className="flight-self">
            {pt ? '✈ a caixa-preta gravou a própria queda:\n' : '✈ the black box recorded its own crash:\n'}
            {`RuntimeError: replay re-entered while replaying crash.flight
  #0 Replayer.replay      flight/replay.py:88   ring = self.ring  ↔
  #1 Replayer.replay      flight/replay.py:88   ring = self.ring  ↔  (the SAME ring)
  #2 inspect              flight/cli.py:41      path = 'crash.flight'
`}
            {pt
              ? '⇒ why: a reprodução leu o anel enquanto ele estava sendo reescrito pela mesma reprodução.\n  (a gravação de uma gravação: flight inspect crash.flight.flight)'
              : '⇒ why: the replay read the ring while that same replay was rewriting it.\n  (a recording of a recording: flight inspect crash.flight.flight)'}
          </pre>
        )}
      </div>
    </Shell>
  )
}

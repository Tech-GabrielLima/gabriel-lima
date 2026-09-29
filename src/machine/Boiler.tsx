import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Lang } from '../film/store'
import { findFrame } from '../cinema/progress'
import { usherSays } from '../cinema/usher'
import { L, useLoop, useOnScreen } from './common'
import { Runtime, pidStr, type ChildSpec } from './otp'
import './machine.css'

// THE BOILER (ROTEIRO §0.4.6, frame 41): a supervision tree drawn as the
// machine room's boilers. Click one and its process gets Process.exit(pid,
// :kill); its supervisor restarts it with a new pid. Kill faster than the
// restart intensity allows and the supervisor gives up, and its own
// supervisor has to deal with it. That's "let it crash", the idea behind the
// Elixir services Gabriel built at Grupo Bel (SUPERVISED in content/projects).

const APP: ChildSpec = {
  id: 'caldeira',
  kind: 'supervisor',
  strategy: 'one_for_one',
  intensity: 2,
  period: 10,
  children: [
    {
      id: 'pressao',
      kind: 'supervisor',
      strategy: 'rest_for_one',
      intensity: 3,
      period: 5,
      children: [
        { id: 'bomba', kind: 'worker' },
        { id: 'valvula', kind: 'worker' },
        { id: 'apito', kind: 'worker' },
      ],
    },
    {
      id: 'vapor',
      kind: 'supervisor',
      strategy: 'one_for_one',
      intensity: 3,
      period: 5,
      children: [
        { id: 'fornalha_1', kind: 'worker' },
        { id: 'fornalha_2', kind: 'worker' },
        { id: 'fornalha_3', kind: 'worker' },
      ],
    },
  ],
}

const WORKERS = ['bomba', 'valvula', 'apito', 'fornalha_1', 'fornalha_2', 'fornalha_3']

const NAMES: Record<string, [string, string]> = {
  caldeira: ['boiler', 'caldeira'],
  pressao: ['pressure line', 'linha de pressão'],
  vapor: ['steam line', 'linha de vapor'],
  bomba: ['pump', 'bomba'],
  valvula: ['valve', 'válvula'],
  apito: ['whistle', 'apito'],
  fornalha_1: ['furnace 1', 'fornalha 1'],
  fornalha_2: ['furnace 2', 'fornalha 2'],
  fornalha_3: ['furnace 3', 'fornalha 3'],
}

/** Where each process sits in the drawing (viewBox 600 × 330). */
const POS: Record<string, { x: number; y: number; parent?: string }> = {
  caldeira: { x: 300, y: 52 },
  pressao: { x: 150, y: 150, parent: 'caldeira' },
  vapor: { x: 450, y: 150, parent: 'caldeira' },
  bomba: { x: 60, y: 262, parent: 'pressao' },
  valvula: { x: 150, y: 262, parent: 'pressao' },
  apito: { x: 240, y: 262, parent: 'pressao' },
  fornalha_1: { x: 360, y: 262, parent: 'vapor' },
  fornalha_2: { x: 450, y: 262, parent: 'vapor' },
  fornalha_3: { x: 540, y: 262, parent: 'vapor' },
}

/** A boiler's pressure gauge: an arc and a needle. */
function Gauge({ x, y, r, v, warn }: { x: number; y: number; r: number; v: number; warn?: boolean }) {
  const a = Math.PI * (0.8 + v * 1.4)
  return (
    <g className={`bl-gauge${warn ? ' warn' : ''}`}>
      <circle cx={x} cy={y} r={r} />
      <path d={`M ${x + r * 0.72 * Math.cos(Math.PI * 0.8)} ${y + r * 0.72 * Math.sin(Math.PI * 0.8)} A ${r * 0.72} ${r * 0.72} 0 1 1 ${x + r * 0.72 * Math.cos(Math.PI * 2.2)} ${y + r * 0.72 * Math.sin(Math.PI * 2.2)}`} />
      <line x1={x} y1={y} x2={x + r * 0.8 * Math.cos(a)} y2={y + r * 0.8 * Math.sin(a)} />
    </g>
  )
}

export function Boiler({ lang }: { lang: Lang }) {
  const rt = useMemo(() => new Runtime(APP), [])
  const box = useRef<HTMLDivElement>(null)
  const on = useOnScreen(box)
  const [, setV] = useState(0)
  const n = useRef(0)
  /** When each child id last got a new pid: the burst of steam. */
  const seen = useRef(new Map<string, { pid: number; at: number }>())
  const [gaveUp, setGaveUp] = useState<string | null>(null)

  const beat = useCallback(() => {
    rt.step()
    n.current++
    // The outside world keeps asking for work: a request to a random worker every ~150 ms.
    if (n.current % 3 === 0) rt.request(WORKERS[Math.floor(Math.random() * WORKERS.length)])
    if (n.current % 8 === 0) rt.tick()
    setV(rt.version)
  }, [rt])
  useLoop(on, 50, beat)

  useEffect(
    () =>
      rt.onGiveUp((sup) => {
        setGaveUp(sup)
        findFrame('boiler')
        usherSays(
          L(lang, 'The supervisor gave up. Its boss restarted it. That’s the design, not a bug.', 'O supervisor desistiu. O chefe dele reiniciou. Isso é o projeto, não um bug.'),
        )
      }),
    [rt, lang],
  )

  const now = performance.now()
  const state = (id: string) => {
    const p = rt.lookup(id)
    const s = seen.current.get(id)
    if (p && (!s || s.pid !== p.pid)) seen.current.set(id, { pid: p.pid, at: s ? now : -1e9 })
    const fresh = p && now - (seen.current.get(id)?.at ?? -1e9) < 700
    return { p, fresh }
  }
  const st = rt.stats
  const okPct = st.ok + st.lost ? (100 * st.ok) / (st.ok + st.lost) : 100

  return (
    <div className="panel boiler" ref={box}>
      <svg className="bl-room" viewBox="0 0 600 330" role="img" aria-label={L(lang, 'A supervision tree drawn as boilers', 'Uma árvore de supervisão desenhada como caldeiras')}>
        {/* The pipes are the links. */}
        {Object.entries(POS).map(([id, q]) => {
          if (!q.parent) return null
          const a = POS[q.parent]
          const up = !!rt.lookup(id) && !!rt.lookup(q.parent)
          return <path key={id} className={`bl-pipe${up ? '' : ' cut'}`} d={`M ${a.x} ${a.y + 22} V ${(a.y + q.y) / 2 + 6} H ${q.x} V ${q.y - 26}`} />
        })}
        {Object.entries(POS).map(([id, q]) => {
          const { p, fresh } = state(id)
          const sup = id === 'caldeira' || id === 'pressao' || id === 'vapor'
          const cls = `bl-proc${p ? '' : ' down'}${fresh ? ' fresh' : ''}${sup ? ' sup' : ''}`
          const kill = () => p && rt.kill(p.pid)
          const label = `${L(lang, ...NAMES[id])} ${p ? pidStr(p.pid) : '✕'}`
          if (sup) {
            const w = rt.window(id)
            const big = id === 'caldeira'
            return (
              <g key={id} className={cls} onClick={kill} role="button" tabIndex={0} aria-label={label} onKeyDown={(e) => e.key === 'Enter' && kill()}>
                <rect className="bl-tank" x={q.x - (big ? 70 : 52)} y={q.y - 22} width={big ? 140 : 104} height={44} rx={22} />
                {[-1, 1].map((s) => (
                  <circle key={s} className="bl-rivet" cx={q.x + s * (big ? 58 : 40)} cy={q.y} r={2.2} />
                ))}
                {/* The restart window: one lamp per restart it still allows. */}
                {w &&
                  Array.from({ length: w.max + 1 }, (_, i) => (
                    <circle key={i} className={`bl-lamp${i < w.used ? ' lit' : ''}${i === w.max ? ' last' : ''}`} cx={q.x - ((w.max) * 9) / 2 + i * 9 + 16} cy={q.y} r={3.2} />
                  ))}
                <Gauge x={q.x - (big ? 42 : 28)} y={q.y} r={13} v={w ? w.used / (w.max + 1) : 0} warn={!!w && w.used >= w.max} />
                <text className="bl-name" x={q.x} y={q.y - 30}>
                  {label}
                </text>
                <text className="bl-strat" x={q.x} y={q.y + 36}>
                  {p?.sup ? `${p.sup.spec.strategy} · ${p.sup.spec.intensity}/${p.sup.spec.period}s` : L(lang, 'down', 'caída')}
                </text>
              </g>
            )
          }
          const pr = p?.work?.pressure ?? 0
          return (
            <g key={id} className={cls} onClick={kill} role="button" tabIndex={0} aria-label={label} onKeyDown={(e) => e.key === 'Enter' && kill()}>
              <rect className="bl-chimney" x={q.x + 10} y={q.y - 46} width={8} height={22} />
              {p && <circle className="bl-steam" cx={q.x + 14} cy={q.y - 52} r={4 + pr * 5} style={{ animationDuration: `${1.8 - pr}s` }} />}
              <rect className="bl-tank" x={q.x - 26} y={q.y - 26} width={52} height={60} rx={14} />
              {[-18, 18].map((s) => (
                <circle key={s} className="bl-rivet" cx={q.x + s} cy={q.y + 26} r={1.8} />
              ))}
              <Gauge x={q.x} y={q.y} r={14} v={pr} />
              {fresh && <circle className="bl-burst" cx={q.x} cy={q.y} r={30} />}
              <text className="bl-name" x={q.x} y={q.y + 50}>
                {L(lang, ...NAMES[id])}
              </text>
              <text className="bl-pid" x={q.x} y={q.y + 62}>
                {p ? `${pidStr(p.pid)} · ${p.work?.served ?? 0}` : '✕'}
              </text>
            </g>
          )
        })}
        {!rt.root && (
          <text className="bl-dead" x={300} y={200}>
            {L(lang, 'application stopped · heart restarts it in 3 s', 'aplicação parou · o heart reinicia em 3 s')}
          </text>
        )}
      </svg>
      <div className="panel-side">
        <p className="panel-lead">{L(lang, 'Click a boiler to kill its process. Kill four in five seconds.', 'Clique numa caldeira para matar o processo dela. Mate quatro em cinco segundos.')}</p>
        <p className="panel-note">
          {L(
            lang,
            'Each boiler is a process with its own mailbox. Its supervisor restarts it with a new pid (and its state starts over). Past the restart intensity the supervisor gives up, and the failure climbs one level.',
            'Cada caldeira é um processo com a sua caixa de mensagens. O supervisor o reinicia com um novo pid (e o estado começa do zero). Passou da intensidade de reinícios, o supervisor desiste, e a falha sobe um nível.',
          )}
        </p>
        <dl className="mini-stats">
          <div>
            <dt>{L(lang, 'requests', 'pedidos')}</dt>
            <dd>{st.requests.toLocaleString()}</dd>
          </div>
          <div>
            <dt>{L(lang, 'succeeded', 'com sucesso')}</dt>
            <dd>{okPct.toFixed(2)}%</dd>
          </div>
          <div>
            <dt>{L(lang, 'restarts', 'reinícios')}</dt>
            <dd>{st.restarts}</dd>
          </div>
          <div>
            <dt>{L(lang, 'gave up', 'desistências')}</dt>
            <dd>{st.giveups}</dd>
          </div>
        </dl>
        <p className="panel-result">
          {gaveUp
            ? L(lang, `${gaveUp} gave up (reached_max_restart_intensity). Its parent restarted it.`, `${gaveUp} desistiu (reached_max_restart_intensity). O pai dele o reiniciou.`)
            : L(lang, '“That’s how I built services with 99.98% success.”', '“Foi assim que eu fiz serviços com 99,98% de sucesso.”')}
        </p>
        <ol className="bl-log" aria-live="polite">
          {rt.log.slice(-7).map((l, i) => (
            <li key={`${l.at}-${i}-${l.text}`} className={l.kind}>
              {l.text}
            </li>
          ))}
        </ol>
        <p className="panel-note dim">
          {L(
            lang,
            'OTP semantics, in TypeScript, in this tab (the Elixir version runs on the BEAM). Elixir in the browser, on Popcorn, needs a cross-origin-isolated page: next.',
            'Semântica OTP, em TypeScript, nesta aba (a versão em Elixir roda na BEAM). Elixir no navegador, no Popcorn, pede uma página com isolamento cross-origin: fica para a próxima.',
          )}
        </p>
      </div>
    </div>
  )
}

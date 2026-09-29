import { useEffect, useState } from 'react'
import { fetchCompletions, findFrame, useProgress, type CompletionRow } from '../cinema/progress'
import { usherSays } from '../cinema/usher'
import { useFilm } from '../film/store'
import './mural.css'

// The mural of completions (ROTEIRO §0.4.6, frame 48): one torn stub per
// person who found all 48 frames, in order. Finding COMPLETION #1 is the frame.
// With nobody there yet, it says so, and keeps a space for the first.

const fmt = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`

export function Mural() {
  const lang = useFilm((s) => s.lang)
  const pt = lang === 'pt'
  const me = useProgress((s) => s.ticket?.n)
  const [rows, setRows] = useState<CompletionRow[] | null>(null)
  const [avg, setAvg] = useState<number | null>(null)
  useEffect(() => {
    void fetchCompletions().then((r) => {
      setRows(r?.completions ?? [])
      setAvg(r?.avg_ms ?? null)
    })
  }, [])
  const fastest = rows?.length ? Math.min(...rows.map((r) => r.ms)) : null
  return (
    <div className="mural">
      <dl className="mural-stats">
        <div>
          <dt>{pt ? 'terminaram' : 'finished'}</dt>
          <dd>{rows?.length ?? '—'}</dd>
        </div>
        <div>
          <dt>{pt ? 'mais rápido' : 'fastest'}</dt>
          <dd>{fastest !== null ? fmt(fastest) : '—'}</dd>
        </div>
        <div>
          <dt>{pt ? 'tempo médio' : 'average'}</dt>
          <dd>{avg !== null ? fmt(avg) : '—'}</dd>
        </div>
      </dl>
      {rows && rows.length > 0 && (
        <div className="mural-speed">
          <p className="mural-speed-title">
            {pt ? 'Sessão Relâmpago' : 'Lightning Session'} <small>{pt ? 'do ingresso aos 48, cronometrado e validado pelo servidor' : 'from ticket to 48, timed and validated by the server'}</small>
          </p>
          <ol>
            {[...rows]
              .sort((a, b) => a.ms - b.ms)
              .slice(0, 10)
              .map((r) => (
                <li key={r.completion} className={r.n === me ? 'mine' : ''}>
                  <span>explorer #{r.n}</span>
                  <b>{fmt(r.ms)}</b>
                </li>
              ))}
          </ol>
        </div>
      )}
      <div className="mural-wall">
        {rows?.map((r, i) => (
          <button
            key={r.completion}
            className={`mural-stub${r.completion === 1 ? ' first' : ''}${r.n === me ? ' mine' : ''}`}
            style={{ '--r': `${((r.completion * 53) % 13) - 6}deg`, '--i': i } as React.CSSProperties}
            onClick={() => {
              if (r.completion !== 1) return
              findFrame('first')
              usherSays(pt ? `O primeiro de todos: explorer #${r.n}, em ${fmt(r.ms)}.` : `The very first: explorer #${r.n}, in ${fmt(r.ms)}.`, true)
            }}
          >
            <small>COMPLETION</small>
            <b>#{r.completion}</b>
            <span>
              explorer #{r.n} · {fmt(r.ms)}
            </span>
          </button>
        ))}
        {rows && (
          <span className="mural-stub empty" style={{ '--r': '3deg' } as React.CSSProperties}>
            <small>COMPLETION</small>
            <b>#{rows.length + 1}</b>
            <span>{rows.length ? (pt ? 'o próximo' : 'the next one') : pt ? 'ninguém ainda: pode ser você' : 'nobody yet: it could be you'}</span>
          </span>
        )}
      </div>
    </div>
  )
}

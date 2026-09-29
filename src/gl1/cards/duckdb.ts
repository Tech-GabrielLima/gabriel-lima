import type { AsyncDuckDB, AsyncDuckDBConnection } from '@duckdb/duckdb-wasm'
import { fetchCompletions, useProgress } from '../../cinema/progress'
import { FRAMES } from '../../cinema/frames'
import { PROJECTS } from '../../content/projects'
import { recording } from '../../finale/record'
import type { CardCtx } from '../cards'
import { lineReader } from './line'

// duckdb on the expansion bus (ROTEIRO §0.4.6): DuckDB compiled to WebAssembly
// (loaded from jsDelivr only when typed), over the site's own data: the 48
// frames, the projects, the completions on the server, and your visit itself
// (the 2 Hz recording Cabin 0 replays), as tables.

let conn: Promise<{ db: AsyncDuckDB; c: AsyncDuckDBConnection; version: string }> | null = null

async function open() {
  conn ??= (async () => {
    const duckdb = await import('@duckdb/duckdb-wasm')
    const bundle = await duckdb.selectBundle(duckdb.getJsDelivrBundles())
    // A worker from another origin can't be started directly: a same-origin Blob that imports it.
    const url = URL.createObjectURL(new Blob([`importScripts("${bundle.mainWorker}");`], { type: 'text/javascript' }))
    const worker = new Worker(url)
    const db = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), worker)
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker)
    URL.revokeObjectURL(url)
    const c = await db.connect()
    const found = new Set(useProgress.getState().found)
    const rec = recording()
    const done = await fetchCompletions().catch(() => null)
    const tables: Record<string, unknown[]> = {
      fotogramas: FRAMES.map((f) => ({ n: f.n, id: f.id, ato: f.act, tipo: f.kind, achado: found.has(f.id) })),
      projetos: PROJECTS.map((p) => ({ id: p.id, titulo: p.title, papel: p.role.pt, stack: p.stack, gancho: p.hook.pt })),
      conclusoes: (done?.completions ?? []).map((r) => ({ conclusao: r.completion, ingresso: r.n, minutos: Math.round(r.ms / 60000), em: new Date(r.at).toISOString() })),
      minha_visita: (rec?.samples ?? []).map((s) => ({ ms: s.t, ato: s.act, filme_s: s.ft, luz_x: s.x, luz_y: s.y, sala: s.room })),
    }
    for (const [name, rows] of Object.entries(tables)) {
      if (!rows.length) {
        await c.query(name === 'conclusoes' ? `CREATE TABLE conclusoes (conclusao INT, ingresso INT, minutos INT, em TIMESTAMP)` : `CREATE TABLE ${name} (vazio BOOLEAN)`)
        continue
      }
      await db.registerFileText(`${name}.json`, JSON.stringify(rows))
      await c.query(`CREATE TABLE ${name} AS SELECT * FROM read_json_auto('${name}.json')`)
    }
    const version = String((await c.query('SELECT version() AS v')).toArray()[0]?.v ?? '')
    return { db, c, version }
  })()
  return conn
}

/** Rows the way the duckdb shell draws them. */
function duckbox(cols: string[], rows: unknown[][]) {
  const cell = (v: unknown) => (v === null || v === undefined ? 'NULL' : v instanceof Date ? v.toISOString().replace('T', ' ').slice(0, 19) : typeof v === 'object' ? JSON.stringify(v, (_, x) => (typeof x === 'bigint' ? String(x) : x)) : String(v))
  const shown = rows.slice(0, 40).map((r) => r.map(cell))
  const w = cols.map((c, i) => Math.min(32, Math.max(c.length, ...shown.map((r) => r[i].length))))
  const fit = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s.padEnd(n))
  const line = (l: string, m: string, r: string) => l + w.map((n) => '─'.repeat(n + 2)).join(m) + r
  const out = [line('┌', '┬', '┐'), '│' + cols.map((c, i) => ` ${fit(c, w[i])} `).join('│') + '│', line('├', '┼', '┤'), ...shown.map((r) => '│' + r.map((v, i) => ` ${fit(v, w[i])} `).join('│') + '│'), line('└', '┴', '┘')]
  if (rows.length > shown.length) out.push(`${rows.length} rows (${shown.length} shown)`)
  return out.join('\n') + '\n'
}

export async function duckdbCard(c: CardCtx): Promise<number> {
  const L = (en: string, pt: string) => (c.pt ? pt : en)
  c.out(`\x1b[90m${L('powering up DuckDB on the card (WebAssembly, from jsDelivr)…', 'ligando o DuckDB na placa (WebAssembly, pelo jsDelivr)…')}\x1b[0m\n`)
  let d: Awaited<ReturnType<typeof open>>
  try {
    d = await open()
  } catch (e) {
    conn = null
    c.out(`duckdb: ${L('the card didn’t power up', 'a placa não ligou')} (${(e as Error).message})\n`)
    return 1
  }
  const run = async (sql: string) => {
    for (const stmt of sql.split(/;\s*(?:\n|$)/).map((s) => s.trim()).filter(Boolean)) {
      try {
        const t = await d.c.query(stmt)
        const cols = t.schema.fields.map((f) => f.name)
        if (!cols.length) continue
        const rows = t.toArray().map((r) => cols.map((k) => {
          const v = (r as Record<string, unknown>)[k]
          return typeof v === 'bigint' ? Number(v) : v
        }))
        c.out(duckbox(cols, rows))
      } catch (e) {
        c.out(`\x1b[31m${(e as Error).message}\x1b[0m\n`)
      }
    }
  }
  const dot = async (cmd: string) => {
    const [m] = cmd.trim().split(/\s+/)
    if (m === '.quit' || m === '.exit') return false
    if (m === '.tables') await run('SHOW TABLES')
    else if (m === '.schema') await run('SELECT table_name, column_name, data_type FROM information_schema.columns ORDER BY table_name, ordinal_position')
    else c.out('.tables  .schema  .quit\n')
    return true
  }

  const ci = c.args.indexOf('-c')
  if (ci >= 0 && c.args[ci + 1]) {
    await run(c.args[ci + 1])
    return 0
  }
  const piped = await c.stdin()
  if (piped.trim()) {
    await run(piped)
    return 0
  }
  c.out(`${d.version} (${L('in your browser', 'no seu navegador')})\n${L('Tables: fotogramas, projetos, conclusoes, minha_visita. Try', 'Tabelas: fotogramas, projetos, conclusoes, minha_visita. Tente')}:\n  SELECT ato, count(*) FILTER (WHERE achado) AS achados, count(*) AS total FROM fotogramas GROUP BY ato ORDER BY ato;\n${L('Enter ".help" for usage hints.', 'Digite ".help" para dicas.')}\n`)
  const lr = lineReader(c)
  let acc = ''
  for (;;) {
    const line = await lr.read(acc ? '‣ ' : 'D ')
    if (line === null || c.interrupted()) break
    if (!acc && line.trim().startsWith('.')) {
      if (!(await dot(line))) break
      continue
    }
    acc += (acc ? '\n' : '') + line
    if (acc.trim().endsWith(';')) {
      await run(acc)
      acc = ''
    } else if (!acc.trim()) acc = ''
  }
  return 0
}

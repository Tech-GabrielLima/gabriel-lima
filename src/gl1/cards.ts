import { findFrame } from '../cinema/progress'
import { useFilm } from '../film/store'
import { assemble, type Gl1 } from './machine'

// Expansion cards (ROTEIRO §0.4.5). GL-OS's card driver (gl1/os/bin/card.s)
// sends "<command> <args>" over the GL-1's bus; the command runs here, in the
// browser, and its output goes back through the machine to stdout. The GL-1
// does the plumbing; the card does the heavy lifting, like a SoftCard in an
// Apple II. Heavy runtimes load only when their command is first typed.

export interface CardCtx {
  name: string
  args: string[]
  argline: string
  user: number
  m: Gl1
  cwd: string
  out(s: string): void
  /** Everything piped into the command (resolves at end of input; '' when stdin is the console). */
  stdin(): Promise<string>
  /** Keys typed while it runs (stdin is the console). */
  onKey(fn: (b: number) => void): void
  interrupted(): boolean
  pt: boolean
}

type Card = (c: CardCtx) => Promise<number>

const L = (c: CardCtx, en: string, pt: string) => (c.pt ? pt : en)

/** Quoted words: `a "b c" 'd'` → [a, b c, d]. */
export function words(s: string): string[] {
  const out: string[] = []
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g
  for (let m; (m = re.exec(s)); ) out.push(m[1] ?? m[2] ?? m[3])
  return out
}

/** A path as the program's shell would read it (relative to its home, in practice). */
export function resolvePath(c: CardCtx, p: string) {
  if (p.startsWith('/')) return p
  if (p.startsWith('~/')) return `${home(c.user)}/${p.slice(2)}`
  return `${c.cwd.replace(/\/$/, '')}/${p}`
}
const home = (u: number) => ['/root', '/home/visitante', '/opt/caixa'][u] ?? '/home/visitante'

/* ---------------------------------------------------------------- cards */

const glasm: Card = async (c) => {
  const [file, flag, outName] = c.args
  if (!file) {
    c.out(L(c, 'usage: glasm FILE.s [-o FILE.gl]\n  assembles for the GL-1 (the same assembler that built GL-OS)\n', 'uso: glasm ARQUIVO.s [-o ARQUIVO.gl]\n  monta para a GL-1 (o mesmo assembler que montou o GL-OS)\n'))
    return 2
  }
  const path = resolvePath(c, file)
  const src = c.m.readText(path)
  if (src === null) {
    c.out(`glasm: ${file}: ${L(c, 'no such file', 'arquivo inexistente')}\n`)
    return 1
  }
  const r = await assemble(src)
  if (!r.ok) {
    c.out(r.errors.replaceAll('program.s', file) + '\n')
    return 1
  }
  const target = resolvePath(c, flag === '-o' && outName ? outName : file.replace(/\.s$/, '') + '.gl')
  try {
    c.m.writeFile(target, r.bytes, c.user, 5)
  } catch (e) {
    c.out(`glasm: ${target}: ${(e as Error).message}\n`)
    return 1
  }
  c.out(`${target}: ${r.bytes.length} bytes ${L(c, 'of GL-1 machine code', 'de código de máquina da GL-1')}\n`)
  findFrame('gl1')
  return 0
}

const hale: Card = async (c) => {
  const { compileHale, loadHale } = await import('../live/hale')
  const version = await loadHale()
  const file = c.args[0]
  const src = file ? c.m.readText(resolvePath(c, file)) : (await c.stdin()) || null
  if (!src) {
    c.out(`hale ${version}\n${L(c, 'usage: hale FILE.hale   (examples in /projects/hale/examples)', 'uso: hale ARQUIVO.hale   (exemplos em /projects/hale/examples)')}\n`)
    return file ? 1 : 2
  }
  const r = await compileHale(src)
  if (r.diagnostics.trim()) c.out(r.diagnostics.trimEnd() + '\n')
  if (r.plan.trim()) c.out(`\x1b[36m${L(c, 'execution plan', 'plano de execução')}\x1b[0m\n${r.plan.trimEnd()}\n`)
  c.out(`\x1b[90m${r.errors} ${L(c, 'errors', 'erros')}, ${r.warnings} ${L(c, 'warnings', 'avisos')} · ${r.micros} µs ${L(c, 'in your browser', 'no seu navegador')}\x1b[0m\n`)
  if (/projetor/i.test(file ?? '')) {
    // A program named after the projector compiles into something hale never emits.
    c.out(
      `\x1b[33m; ${L(c, "IR that shouldn't exist", 'IR que não deveria existir')}\x1b[0m\n` +
        `wave 0  fetch PROJETOR /lampada      \x1b[90m; ${L(c, 'warms up to 3200 K', 'aquece a 3200 K')}\x1b[0m\n` +
        `wave 1  fetch PROJETOR /rolo         \x1b[90m; ${L(c, '2 reels, 48 frames missing', '2 rolos, 48 fotogramas faltando')}\x1b[0m\n` +
        `wave 2  emit  operador = ???         \x1b[90m; ${L(c, 'nobody switches the projector on', 'ninguém liga o projetor')}\x1b[0m\n`,
    )
    findFrame('hale')
  }
  return r.errors ? 1 : 0
}

const curl: Card = async (c) => {
  const url = c.args.find((a) => !a.startsWith('-'))
  if (!url) {
    c.out(L(c, 'usage: curl URL\n', 'uso: curl URL\n'))
    return 2
  }
  const full = /^https?:\/\//.test(url) ? url : `https://${url}`
  // The site's own domain answers terminals with the portfolio in ANSI (vercel.json → /curl.txt).
  if (new URL(full).host === location.host || /gabriel-lima.*\.vercel\.app|gabriellima/.test(full)) {
    const r = await fetch('/curl.txt')
    c.out((await r.text()).replace('${location}', location.host) + '\n')
    findFrame('dig')
    return 0
  }
  try {
    const r = await fetch(full, { headers: { accept: 'text/plain, application/json;q=0.9, */*;q=0.1' } })
    if (c.args.includes('-I')) {
      c.out(`HTTP ${r.status} ${r.statusText}\n`)
      r.headers.forEach((v, k) => c.out(`${k}: ${v}\n`))
      return 0
    }
    const t = await r.text()
    c.out(t.length > 4000 ? t.slice(0, 4000) + `\n\x1b[90m… (${t.length} bytes)\x1b[0m\n` : t.endsWith('\n') ? t : t + '\n')
    return r.ok ? 0 : 22
  } catch {
    c.out(L(c, `curl: ${full} didn't let this page read it (CORS). From a real terminal it would.\n`, `curl: ${full} não deixou esta página ler (CORS). De um terminal de verdade, deixaria.\n`))
    return 7
  }
}

const ping: Card = async (c) => {
  const host = c.args.find((a) => !a.startsWith('-')) ?? location.host
  const url = /^https?:\/\//.test(host) ? host : `https://${host}`
  c.out(`PING ${host} (${L(c, 'over HTTPS: browsers have no ICMP', 'por HTTPS: navegadores não têm ICMP')})\n`)
  const times: number[] = []
  for (let i = 0; i < 4 && !c.interrupted(); i++) {
    const t0 = performance.now()
    try {
      await fetch(url, { mode: 'no-cors', cache: 'no-store' })
      const ms = performance.now() - t0
      times.push(ms)
      c.out(`${L(c, 'reply from', 'resposta de')} ${host}: seq=${i} ${L(c, 'time', 'tempo')}=${ms.toFixed(1)} ms\n`)
    } catch {
      c.out(`${host}: seq=${i} ${L(c, 'no answer', 'sem resposta')}\n`)
    }
    await new Promise((r) => setTimeout(r, 400))
  }
  if (times.length) c.out(`min/avg/max = ${Math.min(...times).toFixed(1)}/${(times.reduce((a, b) => a + b, 0) / times.length).toFixed(1)}/${Math.max(...times).toFixed(1)} ms\n`)
  return times.length ? 0 : 1
}

const dig: Card = async (c) => {
  const ws = c.args.filter((a) => !a.startsWith('+'))
  const types = ['A', 'AAAA', 'TXT', 'MX', 'NS', 'CNAME', 'CAA', 'SOA']
  const type = ws.find((w) => types.includes(w.toUpperCase()))?.toUpperCase() ?? 'A'
  const name = ws.find((w) => !types.includes(w.toUpperCase())) ?? location.hostname
  try {
    const t0 = performance.now()
    const r = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`, { headers: { accept: 'application/dns-json' } })
    const j = (await r.json()) as { Status: number; Answer?: { name: string; TTL: number; type: number; data: string }[] }
    const names: Record<number, string> = { 1: 'A', 28: 'AAAA', 16: 'TXT', 15: 'MX', 2: 'NS', 5: 'CNAME', 257: 'CAA', 6: 'SOA' }
    c.out(`\x1b[90m;; ${name} ${type} · DNS-over-HTTPS (cloudflare-dns.com) · ${(performance.now() - t0).toFixed(0)} ms\x1b[0m\n`)
    if (!j.Answer?.length) c.out(L(c, ';; no answer\n', ';; sem resposta\n'))
    for (const a of j.Answer ?? []) c.out(`${a.name.padEnd(28)} ${String(a.TTL).padStart(6)}  ${(names[a.type] ?? a.type).toString().padEnd(5)} ${a.data}\n`)
    if (type === 'TXT' && j.Answer?.some((a) => /projecionista|sessao|gl-1/i.test(a.data))) findFrame('dig')
    return 0
  } catch {
    c.out(L(c, 'dig: no answer from the resolver\n', 'dig: o resolvedor não respondeu\n'))
    return 9
  }
}

const traceroute: Card = async (c) => {
  c.out(L(c, 'traceroute: browsers can\'t set a TTL, so here are the hops your requests really cross, read from their headers:\n', 'traceroute: navegadores não mexem no TTL; estes são os saltos que os seus pedidos realmente atravessam, lidos dos cabeçalhos:\n'))
  const hop = async (n: number, label: string, url: string, header: string) => {
    const t0 = performance.now()
    try {
      const r = await fetch(url, { cache: 'no-store' })
      const v = r.headers.get(header)
      c.out(` ${n}  ${label.padEnd(34)} ${(performance.now() - t0).toFixed(1).padStart(7)} ms  ${v ? `\x1b[90m${header}: ${v}\x1b[0m` : ''}\n`)
    } catch {
      c.out(` ${n}  ${label.padEnd(34)}       *\n`)
    }
  }
  c.out(` 0  ${L(c, 'your browser (the GL-1 is in it)', 'o seu navegador (a GL-1 está nele)')}\n`)
  await hop(1, 'Vercel edge', `${location.origin}/gl1/rom.bin`, 'x-vercel-id')
  const cinema = import.meta.env.VITE_CINEMA_URL as string | undefined
  if (cinema) await hop(2, 'Cloudflare Worker (cinema)', `${cinema}/v1/health`, 'cf-ray')
  const live = import.meta.env.VITE_LIVE_URL as string | undefined
  if (live) await hop(3, 'Render (Java: raft, match)', `${live}/live/health`, 'x-render-origin-server')
  return 0
}

/** Commands whose card is coming (said honestly, with where it will run). */
const soon = (what: string): Card => async (c) => {
  c.out(L(c, `${c.name}: this card (${what}) is on its way to the bus; it isn't installed yet.\n`, `${c.name}: esta placa (${what}) está a caminho do barramento; ainda não foi instalada.\n`))
  return 127
}

export const CARDS: Record<string, Card> = {
  glasm,
  hale,
  curl,
  ping,
  dig,
  traceroute,
  python: async (c) => (await import('./cards/python')).python(c),
  pip: async (c) => (await import('./cards/python')).pip(c),
  flight: async (c) => (await import('./cards/python')).flight(c),
  projetor: async (c) => (await import('./cards/projetor')).projetor(c),
  psql: async (c) => (await import('./cards/psql')).psql(c),
  espectro: async (c) => (await import('./cards/espectro')).espectro(c),
  duckdb: async (c) => (await import('./cards/duckdb')).duckdbCard(c),
  sqlite3: soon('SQLite WASM'),
  git: async (c) => (await import('./cards/git')).gitCard(c),
  vi: async (c) => (await import('./cards/vi')).vi(c),
  vim: async (c) => (await import('./cards/vi')).vi(c),
  go: soon('Go · Yaegi'),
  cc: soon('clang'),
  cargo: soon('rustc · Compiler Explorer'),
  node: soon('JavaScript'),
  java: soon('JVM'),
  iex: soon('Elixir · AtomVM'),
}

/* ---------------------------------------------------------------- the bus */

/** Drives one machine's card bus: call every frame. */
export class CardBus {
  private running: { keys: ((b: number) => void)[]; input: string; closed: boolean; waiters: ((s: string) => void)[] } | null = null
  private interrupted = false
  private m: Gl1
  private user: number
  constructor(m: Gl1, user: number) {
    this.m = m
    this.user = user
  }

  pump() {
    const req = this.m.card()
    if (req) this.start(req.cmd)
    const r = this.running
    if (!r) return
    const bytes = this.m.cardInput()
    if (bytes.length) {
      if (r.keys.length) bytes.forEach((b) => r.keys.forEach((k) => k(b)))
      else r.input += new TextDecoder().decode(bytes)
    }
    if (this.m.cardInterrupted()) this.interrupted = true
    if (this.m.cardInputClosed && !r.closed) {
      r.closed = true
      r.waiters.splice(0).forEach((w) => w(r.input))
    }
  }

  private start(raw: string) {
    // header from the driver: P (piped stdin) or T (console), the directory, then the command
    const [mode, cwd, cmd = ''] = raw.split('\x1f')
    const piped = mode === 'P'
    const [name, ...rest] = cmd.split(' ')
    const argline = rest.join(' ').trim()
    const run = CARDS[name]
    const state = { keys: [] as ((b: number) => void)[], input: '', closed: false, waiters: [] as ((s: string) => void)[] }
    this.running = state
    this.interrupted = false
    const m = this.m
    const ctx: CardCtx = {
      name,
      args: words(argline),
      argline,
      user: this.user,
      m,
      cwd: cwd || '/',
      pt: useFilm.getState().lang === 'pt',
      out: (s) => m.cardOutput(s.replace(/\r?\n/g, '\n')),
      stdin: () => (!piped ? Promise.resolve('') : state.closed ? Promise.resolve(state.input) : new Promise((res) => state.waiters.push(res))),
      onKey: (fn) => state.keys.push(fn),
      interrupted: () => this.interrupted,
    }
    ;(run ?? soon('?'))(ctx)
      .catch((e: Error) => {
        ctx.out(`${name}: ${e.message}\n`)
        return 1
      })
      .then((code) => {
        m.cardFinish(code)
        if (this.running === state) this.running = null
      })
  }
}

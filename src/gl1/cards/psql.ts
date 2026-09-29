import type { PGlite } from '@electric-sql/pglite'
import { findFrame, useProgress } from '../../cinema/progress'
import { MILESTONES } from '../../content/about'
import { PROJECTS } from '../../content/projects'
import type { CardCtx } from '../cards'
import { PROJECIONISTA_PASSWORD } from '../secrets'
import { lineReader } from './line'

// psql on the expansion bus: a real PostgreSQL (PGlite, Postgres compiled to
// WebAssembly) holding the box office (ROTEIRO §0.4.4). Roles and GRANTs are
// Postgres's own: as `caixa`, `SELECT * FROM segredos` fails with Postgres's
// real "permission denied". The projectionist's password lives in Act II.

let db: Promise<PGlite> | null = null

const q = (s: string) => `'${s.replace(/'/g, "''")}'`

async function open(): Promise<PGlite> {
  db ??= (async () => {
    const { PGlite } = await import('@electric-sql/pglite')
    const pg = await PGlite.create()
    const me = useProgress.getState().ticket?.n ?? 0
    await pg.exec(`
      CREATE TABLE sessoes (id int PRIMARY KEY, titulo text NOT NULL, sala int NOT NULL, inicio timestamptz NOT NULL);
      INSERT INTO sessoes VALUES (1, 'Sessão Noturna', 1, now() - interval '1 hour'), (2, 'EM BREVE', 2, now() + interval '1 year');
      CREATE TABLE ingressos (numero int PRIMARY KEY, sessao int REFERENCES sessoes, fila char(1), poltrona int, vendido_em timestamptz);
      CREATE TABLE projetos (id text PRIMARY KEY, titulo text, papel text, stack text, gancho text, url text);
      ${PROJECTS.map((p) => `INSERT INTO projetos VALUES (${q(p.id)}, ${q(p.title)}, ${q(p.role.pt)}, ${q(p.stack)}, ${q(p.hook.pt)}, ${p.url ? q(p.url) : 'NULL'});`).join('\n')}
      CREATE TABLE experiencia (ano text, titulo text, descricao text);
      ${MILESTONES.filter((m) => !m.future).map((m) => `INSERT INTO experiencia VALUES (${q(m.year)}, ${q(m.title.pt)}, ${q(m.line.pt)});`).join('\n')}
      CREATE TABLE segredos (id int PRIMARY KEY, conteudo text);
      INSERT INTO segredos VALUES
        (1, 'O projetor não liga sozinho.'),
        (2, 'Ele liga quando alguém entra. Toda sessão tem um operador: veja o log da cabine.'),
        (3, 'A cabine 0 lê cartões perfurados. 48 furos. Nem root abre sem eles.'),
        (4, 'Quem desce pelo bueiro chega antes na sala de máquinas.');
      CREATE ROLE caixa;
      CREATE ROLE projecionista;
      GRANT SELECT ON sessoes, ingressos, projetos, experiencia TO caixa;
      GRANT SELECT ON ALL TABLES IN SCHEMA public TO projecionista;
      GRANT caixa TO projecionista;
    `)
    // This visitor's own ticket, and a few before it.
    const rows = Array.from({ length: Math.min(me, 8) }, (_, i) => me - i).filter((n) => n > 0)
    for (const n of rows)
      await pg.query('INSERT INTO ingressos VALUES ($1, 1, $2, $3, now() - $4::interval)', [n, 'ABCDEFGHJKL'[n % 11], (n * 7) % 24 + 1, `${(me - n) * 7} minutes`])
    return pg
  })()
  return db
}

interface Field {
  name: string
}

/** Rows as psql prints them. */
function table(fields: Field[], rows: Record<string, unknown>[]) {
  const cols = fields.map((f) => f.name)
  const cell = (v: unknown) => (v === null ? '' : v instanceof Date ? v.toISOString().replace('T', ' ').slice(0, 19) : String(v))
  const w = cols.map((c) => Math.min(40, Math.max(c.length, ...rows.map((r) => cell(r[c]).length))))
  const fit = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s.padEnd(n))
  const lines = [
    ' ' + cols.map((c, i) => fit(c, w[i])).join(' | '),
    '-' + w.map((n) => '-'.repeat(n)).join('-+-') + '-',
    ...rows.map((r) => ' ' + cols.map((c, i) => fit(cell(r[c]), w[i])).join(' | ')),
    `(${rows.length} ${rows.length === 1 ? 'row' : 'rows'})`,
    '',
  ]
  return lines.join('\n') + '\n'
}

export async function psql(c: CardCtx): Promise<number> {
  c.out('\x1b[90m' + (c.pt ? 'ligando o PostgreSQL na placa (PGlite, Postgres em WebAssembly)…' : 'powering up PostgreSQL on the card (PGlite, Postgres in WebAssembly)…') + '\x1b[0m\n')
  const pg = await open()
  // The terminal's user decides the role: the box office is `caixa`, root is the superuser.
  let role = c.user === 0 ? 'postgres' : 'caixa'
  const setRole = async (r: string) => {
    await pg.exec(r === 'postgres' ? 'RESET ROLE' : `SET ROLE ${r}`)
    role = r
  }
  await setRole(role)
  const version = (await pg.query<{ v: string }>('SELECT version() AS v')).rows[0].v.split(' ').slice(0, 2).join(' ')

  const run = async (sql: string) => {
    try {
      const results = await pg.exec(sql)
      for (const r of results) {
        if (r.fields.length) c.out(table(r.fields, r.rows as Record<string, unknown>[]))
        else if (r.affectedRows !== undefined) c.out(`${sql.trim().split(/\s+/)[0].toUpperCase()} ${r.affectedRows ?? ''}\n`)
      }
      if (/\bsegredos\b/i.test(sql) && role === 'projecionista') c.out('\x1b[33m' + (c.pt ? 'O projecionista deixou isso aqui para você.' : 'The projectionist left this here for you.') + '\x1b[0m\n')
    } catch (e) {
      const msg = (e as Error).message
      c.out(`\x1b[31mERROR:\x1b[0m  ${msg}\n`)
      if (/permission denied for table segredos/.test(msg)) {
        findFrame('psql')
        c.out('\x1b[90m' + (c.pt ? 'dica: \\c - projecionista (a senha não está na bilheteria)' : "hint: \\c - projecionista (the password isn't in the box office)") + '\x1b[0m\n')
      }
    }
  }

  const meta = async (cmd: string, lr: ReturnType<typeof lineReader>): Promise<boolean> => {
    const [m, ...rest] = cmd.trim().split(/\s+/)
    switch (m) {
      case '\\q':
        return false
      case '\\?':
      case '\\h':
        c.out(
          '  \\dt           ' + (c.pt ? 'tabelas' : 'tables') + '\n  \\d TABELA     ' + (c.pt ? 'colunas de uma tabela' : "a table's columns") + '\n  \\du           roles\n  \\c - ROLE     ' + (c.pt ? 'trocar de role' : 'switch role') + '\n  \\conninfo     ' + (c.pt ? 'quem sou eu' : 'who am I') + '\n  \\q            ' + (c.pt ? 'sair' : 'quit') + '\n',
        )
        return true
      case '\\dt':
        await run(`SELECT schemaname AS "Schema", tablename AS "Name", tableowner AS "Owner" FROM pg_tables WHERE schemaname = 'public' ORDER BY 2`)
        return true
      case '\\d':
        if (!rest[0]) return (await meta('\\dt', lr), true)
        await run(`SELECT column_name AS "Column", data_type AS "Type", is_nullable AS "Nullable" FROM information_schema.columns WHERE table_name = ${q(rest[0])} ORDER BY ordinal_position`)
        return true
      case '\\du':
        await run(`SELECT rolname AS "Role", rolsuper AS "Superuser" FROM pg_roles WHERE rolname IN ('postgres', 'caixa', 'projecionista') ORDER BY 1`)
        return true
      case '\\conninfo':
        c.out(`You are connected to database "bilheteria" as role "${role}" (${version}, in your browser).\n`)
        return true
      case '\\c':
      case '\\connect': {
        const target = rest[1] ?? rest[0]
        if (!target || target === '-') {
          c.out('\\c - ROLE\n')
          return true
        }
        if (target === 'projecionista' && role !== 'postgres') {
          const pw = await lr.read(`Password for user projecionista: `, true)
          if (pw !== PROJECIONISTA_PASSWORD) {
            c.out('\x1b[31mFATAL:\x1b[0m  password authentication failed for user "projecionista"\n')
            return true
          }
        } else if (target === 'postgres' && role !== 'postgres') {
          c.out('\x1b[31mFATAL:\x1b[0m  ' + (c.pt ? 'o superusuário mora na sala de máquinas' : 'the superuser lives in the machine room') + '\n')
          return true
        } else if (!['caixa', 'projecionista', 'postgres'].includes(target)) {
          c.out(`\x1b[31mFATAL:\x1b[0m  role "${target}" does not exist\n`)
          return true
        }
        await setRole(target)
        c.out(`You are now connected as user "${target}".\n`)
        return true
      }
    }
    c.out(`invalid command ${m}\nTry \\? for help.\n`)
    return true
  }

  // psql -c "…"
  const ci = c.args.indexOf('-c')
  if (ci >= 0 && c.args[ci + 1]) {
    await run(c.args[ci + 1])
    return 0
  }
  // piped SQL
  const piped = await c.stdin()
  if (piped.trim()) {
    await run(piped)
    return 0
  }

  c.out(`psql (${version})\n${c.pt ? 'Digite \\? para ajuda.' : 'Type \\? for help.'}\n\n`)
  const lr = lineReader(c)
  let acc = ''
  for (;;) {
    const line = await lr.read(`bilheteria${acc ? '-' : '='}${role === 'postgres' ? '#' : '>'} `)
    if (line === null || c.interrupted()) break
    if (!acc && line.trim().startsWith('\\')) {
      if (!(await meta(line, lr))) break
      continue
    }
    acc += (acc ? '\n' : '') + line
    if (acc.trim().endsWith(';')) {
      await run(acc)
      acc = ''
    } else if (!acc.trim()) acc = ''
  }
  await pg.exec('RESET ROLE')
  return 0
}

import { cinemaBase, findFrame } from '../../cinema/progress'
import { usherSays } from '../../cinema/usher'
import type { CardCtx } from '../cards'

// The `git` card (ROTEIRO §0.4.6, frame 44): isomorphic-git in the browser,
// talking git's smart HTTP to GitHub through the cinema's Worker (GitHub sends
// no CORS headers; the Worker only forwards reads of Gabriel's repositories).
// Objects land in memory, fetched shallow: `git log` really fetches the pack.
// The portfolio's repository has a branch nobody mentions.

const OWNER = 'Tech-GabrielLima'
const REPO = 'gabriel-lima'
const SECRET = 'projecionista'

/* A filesystem in memory, just enough for isomorphic-git. */
type Node = { kind: 'file'; data: Uint8Array; mtime: number } | { kind: 'dir'; mtime: number }
function memfs() {
  const nodes = new Map<string, Node>([['/', { kind: 'dir', mtime: Date.now() }]])
  const norm = (p: string) => '/' + p.split('/').filter(Boolean).join('/')
  const parent = (p: string) => norm(p).replace(/\/[^/]*$/, '') || '/'
  const err = (code: string, p: string) => Object.assign(new Error(`${code}: ${p}`), { code })
  const enc = new TextEncoder()
  const dec = new TextDecoder()
  let ino = 1
  const stat = async (p: string) => {
    const n = nodes.get(norm(p))
    if (!n) throw err('ENOENT', p)
    const file = n.kind === 'file'
    return {
      type: file ? 'file' : 'dir',
      mode: file ? 0o100644 : 0o40000,
      size: file ? n.data.length : 0,
      ino: ino++,
      mtimeMs: n.mtime,
      ctimeMs: n.mtime,
      uid: 1,
      gid: 1,
      dev: 1,
      isFile: () => file,
      isDirectory: () => !file,
      isSymbolicLink: () => false,
    }
  }
  const promises = {
    async readFile(p: string, o?: { encoding?: string } | string) {
      const n = nodes.get(norm(p))
      if (!n || n.kind !== 'file') throw err('ENOENT', p)
      return (typeof o === 'string' ? o : o?.encoding) === 'utf8' ? dec.decode(n.data) : n.data
    },
    async writeFile(p: string, d: Uint8Array | string) {
      if (nodes.get(parent(p))?.kind !== 'dir') throw err('ENOENT', p)
      nodes.set(norm(p), { kind: 'file', data: typeof d === 'string' ? enc.encode(d) : new Uint8Array(d), mtime: Date.now() })
    },
    async unlink(p: string) {
      if (!nodes.delete(norm(p))) throw err('ENOENT', p)
    },
    async readdir(p: string) {
      const base = norm(p)
      if (nodes.get(base)?.kind !== 'dir') throw err('ENOTDIR', p)
      const pre = base === '/' ? '/' : base + '/'
      return [...nodes.keys()].filter((k) => k !== base && k.startsWith(pre) && !k.slice(pre.length).includes('/')).map((k) => k.slice(pre.length))
    },
    async mkdir(p: string) {
      if (nodes.has(norm(p))) throw err('EEXIST', p)
      if (nodes.get(parent(p))?.kind !== 'dir') throw err('ENOENT', p)
      nodes.set(norm(p), { kind: 'dir', mtime: Date.now() })
    },
    async rmdir(p: string) {
      if ((await promises.readdir(p)).length) throw err('ENOTEMPTY', p)
      nodes.delete(norm(p))
    },
    stat,
    lstat: stat,
    async readlink(p: string): Promise<string> {
      throw err('ENOENT', p)
    },
    async symlink(_t: string, p: string) {
      throw err('EPERM', p)
    },
    async chmod() {},
  }
  return { promises }
}

async function lib() {
  // isomorphic-git still reaches for Node's Buffer in places.
  const { Buffer } = await import('buffer')
  ;(globalThis as unknown as { Buffer: typeof Buffer }).Buffer ??= Buffer
  const [git, http] = await Promise.all([import('isomorphic-git'), import('isomorphic-git/http/web')])
  return { git: git.default ?? git, http: http.default ?? http }
}

const fmtDate = (t: number, tz: number, pt: boolean) => {
  const d = new Date((t - tz * 60) * 1000)
  const s = d.toLocaleString(pt ? 'pt-BR' : 'en-GB', { timeZone: 'UTC', weekday: 'short', year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const off = -tz
  return `${s} ${off >= 0 ? '+' : '-'}${String(Math.floor(Math.abs(off) / 60)).padStart(2, '0')}${String(Math.abs(off) % 60).padStart(2, '0')}`
}

export async function gitCard(c: CardCtx): Promise<number> {
  const L = (en: string, pt: string) => (c.pt ? pt : en)
  const base = cinemaBase()
  if (!base) {
    c.out(L('git: the cinema’s server is off, and GitHub only speaks CORS through it.\n', 'git: o servidor do cinema está desligado, e o GitHub só fala CORS através dele.\n'))
    return 128
  }
  const [sub, ...rest] = c.args
  const flags = rest.filter((a) => a.startsWith('-'))
  const pos = rest.filter((a) => !a.startsWith('-') && !/^\d+$/.test(a))
  const repoOf = (name?: string) => {
    const r = (name ?? REPO).replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').replace(new RegExp(`^${OWNER}/`), '')
    return { name: r, url: `${base}/git/${OWNER}/${r}.git` }
  }
  const { git, http } = await lib()
  try {
    switch (sub) {
      case 'ls-remote':
      case 'branch': {
        if (sub === 'branch' && !flags.some((f) => f === '-r' || f === '-a')) {
          c.out(L('* (no branch)  — this is a fresh clone of nothing. Try git branch -r.\n', '* (nenhum branch)  — isto é um clone novo de nada. Tente git branch -r.\n'))
          return 0
        }
        const repo = repoOf(sub === 'ls-remote' ? pos[0] : undefined)
        const refs = await git.listServerRefs({ http, url: repo.url, prefix: 'refs/heads/', symrefs: true })
        for (const r of refs) {
          const name = r.ref.replace('refs/heads/', '')
          c.out(sub === 'ls-remote' ? `${r.oid}\t${r.ref}\n` : `  origin/${name}\n`)
        }
        return 0
      }
      case 'log':
      case 'show':
      case 'checkout': {
        const ref = pos[0] ?? 'main'
        const n = Number(rest.find((a) => /^\d+$/.test(a)) ?? rest.find((a) => /^-n\d+$/.test(a))?.slice(2) ?? 10)
        const repo = repoOf(pos[1])
        const fs = memfs()
        const dir = '/repo'
        await fs.promises.mkdir(dir)
        c.out(`\x1b[90m${L('fetching', 'buscando')} ${OWNER}/${repo.name} ${ref} (depth ${n})…\x1b[0m\n`)
        await git.init({ fs, dir })
        await git.addRemote({ fs, dir, remote: 'origin', url: repo.url })
        const got = await git.fetch({ fs, http, dir, remote: 'origin', ref, singleBranch: true, depth: n, tags: false })
        const oid = got.fetchHead
        if (!oid) throw Object.assign(new Error(ref), { code: 'NotFoundError' })
        const log = await git.log({ fs, dir, ref: oid, depth: n })
        for (const e of log) {
          const a = e.commit.author
          c.out(`\x1b[33mcommit ${e.oid}\x1b[0m\nAuthor: ${a.name} <${a.email}>\nDate:   ${fmtDate(a.timestamp, a.timezoneOffset, c.pt)}\n\n${e.commit.message.trimEnd().replace(/^/gm, '    ')}\n\n`)
          if (sub === 'show') break
        }
        if (sub === 'checkout') {
          const { commit } = await git.readCommit({ fs, dir, oid })
          const tree = await git.readTree({ fs, dir, oid: commit.tree })
          c.out(`${L('Switched to branch', 'Mudou para o branch')} '${ref}'\n`)
          for (const t of tree.tree) c.out(`  ${t.type === 'tree' ? t.path + '/' : t.path}\n`)
          const note = tree.tree.find((t) => t.type === 'blob' && /\.md$/i.test(t.path)) ?? tree.tree.find((t) => t.type === 'blob' && /\.txt$/i.test(t.path))
          if (note) {
            const { blob } = await git.readBlob({ fs, dir, oid: note.oid })
            c.out(`\n\x1b[90m── ${note.path} ──\x1b[0m\n${new TextDecoder().decode(blob)}\n`)
          }
        }
        if (ref === SECRET && log.length) {
          findFrame('branch')
          const year = new Date(log[0].commit.author.timestamp * 1000).getUTCFullYear()
          if (year > new Date().getFullYear()) usherSays(L(`That commit is from ${year}. Don’t ask. Git trusts whatever date you give it.`, `Esse commit é de ${year}. Não pergunte. O git acredita em qualquer data que você der.`), true)
        }
        return 0
      }
      case 'clone':
        c.out(L('git clone: this disk has 56 KB. Try git log, git branch -r, git checkout BRANCH or git ls-remote REPO.\n', 'git clone: este disco tem 56 KB. Tente git log, git branch -r, git checkout BRANCH ou git ls-remote REPO.\n'))
        return 1
      case 'push':
        c.out(L('git push: nobody pushes through the cinema. Open a PR like everyone else.\n', 'git push: ninguém faz push pelo cinema. Abra um PR como todo mundo.\n'))
        return 1
      case 'blame':
        c.out(L('git blame: it was Gabriel. It’s always Gabriel.\n', 'git blame: foi o Gabriel. É sempre o Gabriel.\n'))
        return 0
      default:
        c.out(L(`usage: git log [BRANCH] [N] · git show BRANCH · git checkout BRANCH · git branch -r · git ls-remote [REPO]\n  (the repository is ${OWNER}/${REPO}, fetched live from GitHub)\n`, `uso: git log [BRANCH] [N] · git show BRANCH · git checkout BRANCH · git branch -r · git ls-remote [REPO]\n  (o repositório é ${OWNER}/${REPO}, buscado ao vivo no GitHub)\n`))
        return sub ? 1 : 0
    }
  } catch (e) {
    const err = e as { code?: string; message?: string; data?: { statusCode?: number } }
    if (err.code === 'NotFoundError' || /couldn't find|not find/i.test(err.message ?? '')) c.out(`fatal: ${L("couldn't find remote ref", 'não encontrei o ref remoto')} ${pos[0] ?? ''}\n`)
    else if ([401, 403, 404].includes(err.data?.statusCode ?? 0) || /401|403|404/.test(err.message ?? '')) c.out(`fatal: ${L('repository not found (or private)', 'repositório não encontrado (ou privado)')}\n`)
    else c.out(`fatal: ${err.message ?? String(e)}\n`)
    return 128
  }
}

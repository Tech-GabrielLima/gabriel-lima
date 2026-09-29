import { findFrame } from '../../cinema/progress'
import { usherSays } from '../../cinema/usher'
import { resolvePath, type CardCtx } from '../cards'
import { termSize } from '../term-size'

// vi on the expansion bus: a small modal editor drawn with ANSI escapes on the
// GL-1's terminal. Normal, insert and command-line modes; lines are arrays of
// code points, so UTF-8 is edited a character at a time. Files are GL-OS's,
// and so are the rules about who may write where (enforced here, because the
// card writes the disk directly).

type Mode = 'normal' | 'insert' | 'cmdline'
type Line = string[]
interface Snap {
  lines: Line[]
  cy: number
  cx: number
  ver: number
}

const WRITABLE: Record<number, string[]> = { 1: ['/home/visitante', '/tmp'], 2: ['/opt/caixa', '/tmp'] }

/** `/a/./b/../c` → `/a/c`. */
export function normalize(p: string) {
  const out: string[] = []
  for (const part of p.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') out.pop()
    else out.push(part)
  }
  return '/' + out.join('/')
}

/** GL-OS's write rule: root anywhere, everyone else in their home and /tmp. */
export function mayWrite(user: number, path: string) {
  if (user === 0) return true
  return (WRITABLE[user] ?? []).some((d) => path.startsWith(d + '/'))
}
/** /root is root's alone (mode 0 in fs.txt). */
export function mayRead(user: number, path: string) {
  return user === 0 || !(path === '/root' || path.startsWith('/root/'))
}

const cls = (ch: string | undefined) => (ch === undefined || /\s/.test(ch) ? 0 : /[\p{L}\p{N}_]/u.test(ch) ? 1 : 2)

let usherSpoke = false

export async function vi(c: CardCtx): Promise<number> {
  const L = (en: string, pt: string) => (c.pt ? pt : en)
  const isVim = c.name === 'vim'
  const enc = new TextEncoder()
  const dec = new TextDecoder()

  let lines: Line[] = [[]]
  let name = ''
  let path = ''
  let cy = 0
  let cx = 0
  let top = 0
  let left = 0
  let mode: Mode = 'normal'
  let cmd = ''
  let cmdKind: ':' | '/' | '?' = ':'
  let msg = ''
  let msgErr = false
  let ver = 0
  let savedVer = 0
  let undo: Snap[] = []
  let redo: Snap[] = []
  let reg: { text: Line[]; linewise: boolean } = { text: [], linewise: false }
  let pending = '' // an operator or prefix waiting for its motion: d y c g r Z
  let count = ''
  let lastSearch = ''
  let lastSearchBack = false
  let stuck = 0
  let hinted = false
  let done: ((code: number) => void) | null = null
  // A key can quit the editor mid-handling, which TS's narrowing can't see.
  const running = () => done !== null
  const modified = () => ver !== savedVer

  const say = (s: string, err = false) => {
    msg = s
    msgErr = err
  }
  const snapshot = (): Snap => ({ lines: lines.map((l) => l.slice()), cy, cx, ver })
  const change = () => {
    undo.push(snapshot())
    if (undo.length > 200) undo.shift()
    redo = []
    ver = Math.max(ver, ...undo.map((u) => u.ver), ...[savedVer]) + 1
  }

  /* ---------------------------------------------------------- files */

  const load = (file: string) => {
    name = file
    path = normalize(resolvePath(c, file))
    lines = [[]]
    cy = cx = top = left = 0
    undo = []
    redo = []
    ver = savedVer = 0
    if (!mayRead(c.user, path)) return say(`"${file}" [${L('Permission Denied', 'Permissão negada')}]`, true)
    const b = c.m.readFile(path)
    if (b === null) return say(`"${file}" [${L('New', 'Novo')}]`)
    const text = dec.decode(b)
    const parts = text.split('\n')
    if (parts.length > 1 && parts[parts.length - 1] === '') parts.pop()
    lines = parts.map((l) => Array.from(l.replace(/\r$/, '')))
    if (!lines.length) lines = [[]]
    say(`"${file}" ${lines.length}L, ${b.length}B`)
  }

  const write = (file?: string): boolean => {
    const target = file ?? name
    if (!target) {
      say(L('E32: No file name', 'E32: Nenhum nome de arquivo'), true)
      return false
    }
    const p = normalize(resolvePath(c, target))
    if (!mayWrite(c.user, p)) {
      say(L(`"${target}" E212: Can't open file for writing`, `"${target}" E212: Não foi possível abrir o arquivo para escrita`), true)
      return false
    }
    const data = enc.encode(lines.map((l) => l.join('')).join('\n') + '\n')
    try {
      c.m.writeFile(p, data, c.user, 1)
    } catch (e) {
      say(`"${target}" E212: ${L("Can't open file for writing", 'Não foi possível abrir o arquivo para escrita')} (${(e as Error).message})`, true)
      return false
    }
    if (!name) {
      name = target
      path = p
    }
    if (p === path) savedVer = ver
    say(`"${target}" ${lines.length}L, ${data.length}B ${L('written', 'gravado(s)')}`)
    return true
  }

  /* ---------------------------------------------------------- cursor */

  const line = () => lines[cy]
  const clamp = () => {
    cy = Math.max(0, Math.min(lines.length - 1, cy))
    const max = mode === 'insert' ? line().length : Math.max(0, line().length - 1)
    cx = Math.max(0, Math.min(max, cx))
  }
  const firstNonBlank = () => {
    const i = line().findIndex((ch) => !/\s/.test(ch))
    cx = i < 0 ? 0 : i
  }

  const wordFwd = () => {
    let y = cy
    let x = cx
    const k = cls(lines[y][x])
    if (k) while (x < lines[y].length && cls(lines[y][x]) === k) x++
    for (;;) {
      if (x >= lines[y].length) {
        if (y >= lines.length - 1) {
          x = Math.max(0, lines[y].length - 1)
          break
        }
        y++
        x = 0
        if (!lines[y].length) break
        continue
      }
      if (cls(lines[y][x]) === 0) x++
      else break
    }
    return [y, x] as const
  }
  const wordBack = () => {
    let y = cy
    let x = cx
    const back = () => {
      if (x > 0) x--
      else if (y > 0) {
        y--
        x = lines[y].length
        return true
      } else return false
      return true
    }
    back()
    while (cls(lines[y][x]) === 0 && lines[y].length && back());
    while (cls(lines[y][x]) === 0 && y > 0 && !lines[y].length) break
    const k = cls(lines[y][x])
    while (x > 0 && k && cls(lines[y][x - 1]) === k) x--
    return [y, Math.min(x, Math.max(0, lines[y].length - 1))] as const
  }
  const wordEnd = () => {
    let y = cy
    let x = cx + 1
    for (;;) {
      if (x >= lines[y].length) {
        if (y >= lines.length - 1) return [y, Math.max(0, lines[y].length - 1)] as const
        y++
        x = 0
        continue
      }
      if (cls(lines[y][x]) === 0) x++
      else break
    }
    const k = cls(lines[y][x])
    while (x + 1 < lines[y].length && cls(lines[y][x + 1]) === k) x++
    return [y, x] as const
  }

  const search = (pat: string, back: boolean) => {
    if (!pat) return
    let re: RegExp
    try {
      re = new RegExp(pat, 'u')
    } catch {
      re = new RegExp(pat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'u')
    }
    const n = lines.length
    const text = lines.map((l) => l.join(''))
    // offsets in code points ↔ UTF-16 for this line
    const cpIndex = (s: string, u16: number) => Array.from(s.slice(0, u16)).length
    for (let i = 0; i <= n; i++) {
      const y = (((back ? cy - i : cy + i) % n) + n) % n
      const s = text[y]
      const hits: number[] = []
      const g = new RegExp(re.source, 'gu')
      for (let m; (m = g.exec(s)); ) {
        hits.push(cpIndex(s, m.index))
        if (m[0] === '') g.lastIndex++
      }
      const pick = back
        ? hits.filter((h) => i > 0 || h < cx).pop()
        : hits.find((h) => i > 0 || h > cx)
      if (i === n && y === cy) {
        // wrapped all the way round: the match under the cursor counts
        const at = back ? hits.pop() : hits[0]
        if (at === undefined) break
        cx = at
        return say(L('search hit BOTTOM, continuing at TOP', 'a busca chegou ao FIM, continuando do INÍCIO'), true)
      }
      if (pick !== undefined) {
        if ((back && y > cy) || (!back && y < cy)) say(back ? L('search hit TOP, continuing at BOTTOM', 'a busca chegou ao INÍCIO, continuando do FIM') : L('search hit BOTTOM, continuing at TOP', 'a busca chegou ao FIM, continuando do INÍCIO'), true)
        else say((back ? '?' : '/') + pat)
        cy = y
        cx = pick
        return
      }
    }
    say(L(`E486: Pattern not found: ${pat}`, `E486: Padrão não encontrado: ${pat}`), true)
  }

  /* ---------------------------------------------------------- edits */

  const deleteLines = (n: number, yank = true) => {
    n = Math.min(n, lines.length - cy)
    const gone = lines.splice(cy, n)
    if (yank) reg = { text: gone.map((l) => l.slice()), linewise: true }
    if (!lines.length) lines = [[]]
    clamp()
    firstNonBlank()
  }
  /** The characters from [y,x) up to [toY,toX), in either order. */
  const grab = (y: number, x: number, toY: number, toX: number): Line[] => {
    if (toY < y || (toY === y && toX < x)) [y, x, toY, toX] = [toY, toX, y, x]
    if (y === toY) return [lines[y].slice(x, toX)]
    return [lines[y].slice(x), ...lines.slice(y + 1, toY).map((l) => l.slice()), lines[toY].slice(0, toX)]
  }
  const deleteRange = (y: number, x: number, toY: number, toX: number) => {
    if (toY < y || (toY === y && toX < x)) [y, x, toY, toX] = [toY, toX, y, x]
    reg = { text: grab(y, x, toY, toX), linewise: false }
    lines.splice(y, toY - y + 1, [...lines[y].slice(0, x), ...lines[toY].slice(toX)])
    cy = y
    cx = x
  }
  const put = (before: boolean) => {
    if (!reg.text.length) return say(L('E353: Nothing in register "', 'E353: Nada no registrador "'), true)
    change()
    if (reg.linewise) {
      const at = before ? cy : cy + 1
      lines.splice(at, 0, ...reg.text.map((l) => l.slice()))
      cy = at
      firstNonBlank()
      return
    }
    const at = before || !line().length ? cx : cx + 1
    const head = line().slice(0, at)
    const tail = line().slice(at)
    const t = reg.text
    if (t.length === 1) {
      lines[cy] = [...head, ...t[0], ...tail]
      cx = at + t[0].length - 1
    } else {
      const mid = t.slice(1, -1).map((l) => l.slice())
      lines.splice(cy, 1, [...head, ...t[0]], ...mid, [...t[t.length - 1], ...tail])
    }
  }
  const joinLines = () => {
    if (cy >= lines.length - 1) return
    change()
    const a = line()
    while (a.length && a[a.length - 1] === ' ') a.pop()
    const b = lines[cy + 1].slice()
    while (b.length && /\s/.test(b[0])) b.shift()
    cx = a.length
    lines[cy] = b.length && a.length ? [...a, ' ', ...b] : [...a, ...b]
    lines.splice(cy + 1, 1)
  }
  const leading = (l: Line) => {
    const i = l.findIndex((ch) => ch !== ' ' && ch !== '\t')
    return i < 0 ? [] : l.slice(0, i)
  }
  const openLine = (below: boolean) => {
    change()
    const indent = leading(line())
    const at = below ? cy + 1 : cy
    lines.splice(at, 0, indent.slice())
    cy = at
    cx = indent.length
    enterInsert(true)
  }
  const enterInsert = (snapped = false) => {
    if (!snapped) change()
    mode = 'insert'
    msg = ''
  }
  const applyUndo = (from: Snap[], to: Snap[]) => {
    const s = from.pop()
    if (!s) return say(from === undo ? L('Already at oldest change', 'Já na alteração mais antiga') : L('Already at newest change', 'Já na alteração mais recente'))
    to.push(snapshot())
    lines = s.lines
    cy = s.cy
    cx = s.cx
    ver = s.ver
    clamp()
    say(from === undo ? L('1 change; before #' + (undo.length + 1), '1 alteração; antes de #' + (undo.length + 1)) : L('1 change; after #' + undo.length, '1 alteração; depois de #' + undo.length))
  }

  /* ---------------------------------------------------------- leaving */

  const quit = (code = 0) => {
    if (isVim) findFrame('vim')
    c.out('\x1b[0m\x1b[2J\x1b[H')
    done?.(code)
    done = null
  }
  const stuckOnce = () => {
    if (!isVim) return
    if (++stuck < 3 || hinted) return
    hinted = true
    say(L('type :q and Enter to quit', 'digite :q e Enter para sair'), true)
    if (!usherSpoke) {
      usherSpoke = true
      usherSays(L('Easy. Everyone gets stuck in vim once.', 'Calma. Todo mundo fica preso no vim uma vez.'))
    }
  }

  const exCommand = (line0: string) => {
    const s = line0.trim()
    if (!s) return
    if (/^\d+$/.test(s)) {
      cy = Number(s) - 1
      clamp()
      firstNonBlank()
      return
    }
    if (s === '$') {
      cy = lines.length - 1
      firstNonBlank()
      return
    }
    const m = /^([a-zA-Z]+)(!?)\s*(.*)$/.exec(s)
    if (!m) return say(L(`E492: Not an editor command: ${s}`, `E492: Não é um comando do editor: ${s}`), true)
    const [, word, bang, arg] = m
    const force = bang === '!'
    const dirty = () => say(L('E37: No write since last change (add ! to override)', 'E37: Não salvo desde a última alteração (adicione ! para forçar)'), true)
    switch (word) {
      case 'q':
      case 'quit':
      case 'qa':
      case 'qall':
      case 'quita':
      case 'quitall':
        if (modified() && !force) return dirty()
        return quit()
      case 'w':
      case 'write':
        write(arg || undefined)
        return
      case 'wq':
      case 'x':
      case 'xit':
      case 'exi':
      case 'exit':
      case 'wqa':
      case 'wqall':
      case 'xa':
      case 'xall':
        if ((word.startsWith('x') || word.startsWith('exi')) && !modified() && !arg) return quit()
        if (write(arg || undefined)) quit()
        return
      case 'e':
      case 'edit':
        if (!arg) {
          if (!force) return modified() ? dirty() : load(name)
          return load(name)
        }
        if (modified() && !force) return dirty()
        return load(arg)
      case 'set':
        return say(L(`E518: Unknown option: ${arg}`, `E518: Opção desconhecida: ${arg}`), true)
      case 'h':
      case 'help':
        return say(L(':w save  :q quit  :wq both  :q! discard  i insert  Esc normal', ':w salvar  :q sair  :wq os dois  :q! descartar  i inserir  Esc normal'))
    }
    say(L(`E492: Not an editor command: ${s}`, `E492: Não é um comando do editor: ${s}`), true)
    stuckOnce()
  }

  /* ---------------------------------------------------------- keys */

  let typed = '' // the last letters typed in normal mode, to notice "exit" and "quit"

  const normal = (k: string) => {
    if (pending === 'r') {
      pending = ''
      if (k.length === 1 && line().length) {
        change()
        line()[cx] = k
      }
      return
    }
    if (/^[1-9]$/.test(k) || (count && k === '0')) {
      count += k
      return
    }
    const n = Math.max(1, Number(count || '1'))
    const hadCount = count !== ''
    count = ''
    if (k.length === 1 && /[a-z]/.test(k)) {
      typed = (typed + k).slice(-4)
      if (typed === 'exit' || typed === 'quit') stuckOnce()
    }

    if (pending === 'g') {
      pending = ''
      if (k === 'g') {
        cy = hadCount ? n - 1 : 0
        clamp()
        firstNonBlank()
      }
      return
    }
    if (pending === 'Z') {
      pending = ''
      if (k === 'Z') {
        if (!modified() || write()) quit()
      } else if (k === 'Q') quit()
      return
    }
    if (pending === 'd' || pending === 'y' || pending === 'c') {
      const op = pending
      pending = ''
      if (k === op) {
        if (op === 'y') {
          reg = { text: lines.slice(cy, cy + n).map((l) => l.slice()), linewise: true }
          return say(n > 1 ? L(`${n} lines yanked`, `${n} linhas copiadas`) : '')
        }
        change()
        if (op === 'd') return deleteLines(n)
        // cc: the line's text goes, the line stays
        reg = { text: lines.slice(cy, cy + n).map((l) => l.slice()), linewise: true }
        lines.splice(cy, n, [])
        cx = 0
        return enterInsert(true)
      }
      let to: readonly [number, number] | null = null
      const walk = (f: () => readonly [number, number]) => {
        const [sy, sx] = [cy, cx]
        let r: readonly [number, number] = [cy, cx]
        for (let i = 0; i < n; i++) {
          r = f()
          ;[cy, cx] = r
        }
        ;[cy, cx] = [sy, sx]
        return r
      }
      if (k === 'e' || (k === 'w' && op === 'c')) {
        const [y, x] = walk(wordEnd)
        to = [y, Math.min(lines[y].length, x + 1)]
      } else if (k === 'w') {
        const [y, x] = walk(wordFwd)
        to = y > cy || (y === cy && x <= cx) ? [cy, line().length] : [y, x]
      } else if (k === 'b') to = walk(wordBack)
      else if (k === '$' || k === 'End') to = [cy, line().length]
      else if (k === '0' || k === 'Home') to = [cy, 0]
      else if (k === 'l' || k === ' ' || k === 'Right') to = [cy, Math.min(line().length, cx + n)]
      else if (k === 'h' || k === 'Left') to = [cy, Math.max(0, cx - n)]
      else if (k === 'j' || k === 'k' || k === 'G') {
        const other = k === 'j' ? Math.min(lines.length - 1, cy + n) : k === 'k' ? Math.max(0, cy - n) : lines.length - 1
        const from = Math.min(cy, other)
        const cnt = Math.abs(other - cy) + 1
        if (op === 'y') {
          reg = { text: lines.slice(from, from + cnt).map((l) => l.slice()), linewise: true }
          return
        }
        change()
        cy = from
        if (op === 'd') return deleteLines(cnt)
        reg = { text: lines.slice(from, from + cnt).map((l) => l.slice()), linewise: true }
        lines.splice(from, cnt, [])
        cx = 0
        return enterInsert(true)
      }
      if (!to) return
      if (op === 'y') {
        reg = { text: grab(cy, cx, to[0], to[1]), linewise: false }
        if (to[0] < cy || (to[0] === cy && to[1] < cx)) [cy, cx] = to
        clamp()
        return
      }
      change()
      deleteRange(cy, cx, to[0], to[1])
      if (op === 'c') return enterInsert(true)
      clamp()
      return
    }

    switch (k) {
      case 'h':
      case 'Left':
      case 'BS':
        cx -= n
        break
      case 'l':
      case 'Right':
      case ' ':
        cx = Math.min(cx + n, Math.max(0, line().length - 1))
        break
      case 'j':
      case 'Down':
      case 'C-n':
        cy += n
        break
      case 'k':
      case 'Up':
      case 'C-p':
        cy -= n
        break
      case 'Enter':
      case '+':
        cy += n
        clamp()
        firstNonBlank()
        break
      case '-':
        cy -= n
        clamp()
        firstNonBlank()
        break
      case '0':
      case 'Home':
        cx = 0
        break
      case '^':
        firstNonBlank()
        break
      case '$':
      case 'End':
        cy += n - 1
        clamp()
        cx = line().length
        break
      case 'w':
      case 'W':
        for (let i = 0; i < n; i++) [cy, cx] = wordFwd()
        break
      case 'b':
      case 'B':
        for (let i = 0; i < n; i++) [cy, cx] = wordBack()
        break
      case 'e':
      case 'E':
        for (let i = 0; i < n; i++) [cy, cx] = wordEnd()
        break
      case 'G':
        cy = hadCount ? n - 1 : lines.length - 1
        clamp()
        firstNonBlank()
        break
      case 'C-f':
      case 'PgDn':
        cy += Math.max(1, termSize(c.m).rows - 4) * n
        break
      case 'C-b':
      case 'PgUp':
        cy -= Math.max(1, termSize(c.m).rows - 4) * n
        break
      case 'C-d':
        cy += Math.max(1, (termSize(c.m).rows - 2) >> 1)
        break
      case 'C-u':
        cy -= Math.max(1, (termSize(c.m).rows - 2) >> 1)
        break
      case 'g':
      case 'd':
      case 'y':
      case 'c':
      case 'r':
      case 'Z':
        pending = k
        if (hadCount) count = String(n)
        return
      case 'i':
      case 'Ins':
        enterInsert()
        break
      case 'I':
        firstNonBlank()
        enterInsert()
        break
      case 'a':
        cx = Math.min(cx + 1, line().length)
        enterInsert()
        return
      case 'A':
        cx = line().length
        enterInsert()
        return
      case 'o':
        openLine(true)
        return
      case 'O':
        openLine(false)
        return
      case 'x':
      case 'Del':
        if (!line().length) break
        change()
        reg = { text: [line().splice(cx, n)], linewise: false }
        break
      case 'X':
        if (!cx) break
        change()
        reg = { text: [line().splice(Math.max(0, cx - n), Math.min(n, cx))], linewise: false }
        cx -= Math.min(n, cx)
        break
      case 's':
        change()
        if (line().length) reg = { text: [line().splice(cx, n)], linewise: false }
        enterInsert(true)
        return
      case 'S':
        change()
        reg = { text: [line().slice()], linewise: true }
        lines[cy] = []
        cx = 0
        enterInsert(true)
        return
      case 'D':
      case 'C':
        change()
        reg = { text: [line().splice(cx)], linewise: false }
        if (k === 'C') {
          enterInsert(true)
          return
        }
        break
      case 'Y':
        reg = { text: lines.slice(cy, cy + n).map((l) => l.slice()), linewise: true }
        break
      case 'p':
        for (let i = 0; i < n; i++) put(false)
        break
      case 'P':
        for (let i = 0; i < n; i++) put(true)
        break
      case 'J':
        for (let i = 0; i < Math.max(1, n - 1); i++) joinLines()
        break
      case '~': {
        if (!line().length) break
        change()
        for (let i = 0; i < n && cx < line().length; i++, cx++) {
          const ch = line()[cx]
          line()[cx] = ch === ch.toUpperCase() ? ch.toLowerCase() : ch.toUpperCase()
        }
        break
      }
      case 'u':
        for (let i = 0; i < n; i++) applyUndo(undo, redo)
        break
      case 'C-r':
        for (let i = 0; i < n; i++) applyUndo(redo, undo)
        break
      case 'n':
        search(lastSearch, lastSearchBack)
        break
      case 'N':
        search(lastSearch, !lastSearchBack)
        break
      case ':':
      case '/':
      case '?':
        mode = 'cmdline'
        cmdKind = k
        cmd = ''
        msg = ''
        return
      case 'Esc':
        stuckOnce()
        break
      case 'C-c':
        if (isVim) say(L('Type  :qa  and press <Enter> to exit Vim', 'Digite  :qa  e aperte <Enter> para sair do Vim'))
        stuckOnce()
        break
      case 'C-g':
        say(`"${name || '[No Name]'}"${modified() ? ' [+]' : ''} ${lines.length} ${L('lines', 'linhas')} --${Math.round(((cy + 1) / lines.length) * 100)}%--`)
        break
      case 'C-l':
        prev = []
        break
    }
    clamp()
  }

  const insert = (k: string) => {
    const l = line()
    switch (k) {
      case 'Esc':
      case 'C-c':
        mode = 'normal'
        cx--
        clamp()
        return
      case 'Enter': {
        const tail = l.splice(cx)
        const indent = leading(l)
        lines.splice(cy + 1, 0, [...indent, ...tail])
        cy++
        cx = indent.length
        return
      }
      case 'BS':
      case 'C-h':
        if (cx > 0) {
          l.splice(cx - 1, 1)
          cx--
        } else if (cy > 0) {
          cx = lines[cy - 1].length
          lines[cy - 1].push(...l)
          lines.splice(cy, 1)
          cy--
        }
        return
      case 'Del':
        if (cx < l.length) l.splice(cx, 1)
        else if (cy < lines.length - 1) l.push(...lines.splice(cy + 1, 1)[0])
        return
      case 'C-w': {
        const start = cx
        while (cx > 0 && /\s/.test(l[cx - 1])) cx--
        const k0 = cls(l[cx - 1])
        while (cx > 0 && cls(l[cx - 1]) === k0 && k0) cx--
        l.splice(cx, start - cx)
        return
      }
      case 'Tab':
        l.splice(cx++, 0, '\t')
        return
      case 'Left':
        cx = Math.max(0, cx - 1)
        return
      case 'Right':
        cx = Math.min(l.length, cx + 1)
        return
      case 'Up':
        cy = Math.max(0, cy - 1)
        clamp()
        return
      case 'Down':
        cy = Math.min(lines.length - 1, cy + 1)
        clamp()
        return
      case 'Home':
        cx = 0
        return
      case 'End':
        cx = l.length
        return
    }
    if ([...k].length !== 1) return
    l.splice(cx++, 0, k)
  }

  const cmdline = (k: string) => {
    if (k === 'Esc' || k === 'C-c') {
      mode = 'normal'
      cmd = ''
      if (k === 'C-c') stuckOnce()
      return
    }
    if (k === 'BS' || k === 'C-h') {
      if (!cmd) {
        mode = 'normal'
        return
      }
      cmd = Array.from(cmd).slice(0, -1).join('')
      return
    }
    if (k === 'Enter') {
      mode = 'normal'
      const s = cmd
      cmd = ''
      if (cmdKind === ':') exCommand(s)
      else {
        lastSearch = s || lastSearch
        lastSearchBack = cmdKind === '?'
        search(lastSearch, lastSearchBack)
      }
      clamp()
      return
    }
    if (k === 'Tab') k = ' '
    if ([...k].length === 1) cmd += k
  }

  const key = (k: string) => {
    if (!done) return
    if (mode === 'normal') {
      if (msg && !msgErr) msg = ''
      normal(k)
    } else if (mode === 'insert') insert(k)
    else cmdline(k)
    if (running()) draw()
  }

  /* ---------------------------------------------------------- input bytes → keys */

  let utf: number[] = []
  let need = 0
  let esc: number[] | null = null
  let escTimer: ReturnType<typeof setTimeout> | null = null
  const CSI: Record<string, string> = { A: 'Up', B: 'Down', C: 'Right', D: 'Left', H: 'Home', F: 'End', '1~': 'Home', '2~': 'Ins', '3~': 'Del', '4~': 'End', '5~': 'PgUp', '6~': 'PgDn', '7~': 'Home', '8~': 'End' }
  const CTRL: Record<number, string> = { 8: 'BS', 9: 'Tab', 10: 'Enter', 13: 'Enter', 127: 'BS' }
  const flushEsc = () => {
    if (escTimer) clearTimeout(escTimer)
    escTimer = null
    const seq = esc
    esc = null
    if (!seq) return
    // a lone Esc, or Esc followed by something that isn't a sequence
    key('Esc')
    for (const b of seq.slice(1)) byte(b)
  }
  const byte = (b: number) => {
    if (esc) {
      esc.push(b)
      if (esc.length === 2) {
        if (b !== 91 && b !== 79) return flushEsc()
        return
      }
      if ((b >= 48 && b <= 57) || b === 59) return
      const body = String.fromCharCode(...esc.slice(2))
      if (escTimer) clearTimeout(escTimer)
      escTimer = null
      esc = null
      const name = CSI[body] ?? CSI[body.replace(/^1;\d/, '')]
      if (name) key(name)
      return
    }
    if (need) {
      utf.push(b)
      if (--need === 0) {
        key(dec.decode(new Uint8Array(utf)))
        utf = []
      }
      return
    }
    if (b === 27) {
      esc = [27]
      escTimer = setTimeout(flushEsc, 40)
      return
    }
    if (b < 32 || b === 127) {
      key(CTRL[b] ?? `C-${String.fromCharCode(b + 96)}`)
      return
    }
    if (b < 0x80) return key(String.fromCharCode(b))
    if ((b & 0xe0) === 0xc0) need = 1
    else if ((b & 0xf0) === 0xe0) need = 2
    else if ((b & 0xf8) === 0xf0) need = 3
    else return
    utf = [b]
  }

  /* ---------------------------------------------------------- drawing */

  let prev: string[] = []
  let prevSize = ''
  const TAB = 8
  const cells = (l: Line) => {
    const out: string[] = []
    for (const ch of l) {
      if (ch === '\t') do out.push(' ')
      while (out.length % TAB)
      else out.push(ch < ' ' ? '?' : ch)
    }
    return out
  }
  const dcol = (l: Line, x: number) => cells(l.slice(0, x)).length

  const draw = () => {
    const { cols, rows } = termSize(c.m)
    const textRows = Math.max(1, rows - 2)
    const size = `${cols}x${rows}`
    if (size !== prevSize) {
      prevSize = size
      prev = []
      c.out('\x1b[0m\x1b[2J')
    }
    clamp()
    if (cy < top) top = cy
    if (cy >= top + textRows) top = cy - textRows + 1
    let cursorCol = dcol(line(), cx)
    if (mode === 'normal' && line()[cx] === '\t') cursorCol = dcol(line(), cx + 1) - 1
    if (cursorCol < left) left = cursorCol
    if (cursorCol >= left + cols) left = cursorCol - cols + 1
    const want: string[] = []
    for (let r = 0; r < textRows; r++) {
      const y = top + r
      if (y >= lines.length) want.push('\x1b[94m~\x1b[0m')
      else want.push(cells(lines[y]).slice(left, left + cols).join(''))
    }
    // the status line: file, [+], mode, line:col
    const modeName = mode === 'insert' ? L('INSERT', 'INSERÇÃO') : mode === 'cmdline' ? L('COMMAND', 'COMANDO') : 'NORMAL'
    const fileLabel = (name || L('[No Name]', '[Sem nome]')) + (modified() ? ' [+]' : '')
    const pos = `${cy + 1}:${cx + 1}`
    const right = `${modeName}  ${pos} `
    const leftPart = ` ${fileLabel}`
    const room = Math.max(0, cols - [...right].length - 1)
    const lp = [...leftPart].slice(0, room).join('')
    const pad = ' '.repeat(Math.max(1, cols - [...lp].length - [...right].length))
    want.push(`\x1b[1;36m${lp}\x1b[0;90m${pad}\x1b[${mode === 'insert' ? '33' : '37'}m${right}\x1b[0m`)
    // the command line / messages
    let bottom: string
    let cursorRow = cy - top
    let cursorX = cursorCol - left
    if (mode === 'cmdline') {
      const visible = [...(cmdKind + cmd)]
      const shown = visible.slice(Math.max(0, visible.length - cols + 1))
      bottom = shown.join('')
      cursorRow = rows - 1
      cursorX = shown.length
    } else if (msg) bottom = (msgErr ? '\x1b[31m' : '') + [...msg].slice(0, cols - 1).join('') + '\x1b[0m'
    else bottom = mode === 'insert' ? `\x1b[1m-- ${L('INSERT', 'INSERÇÃO')} --\x1b[0m` : pending || count ? `\x1b[90m${' '.repeat(Math.max(0, cols - 12))}${count}${pending}\x1b[0m` : ''
    want.push(bottom)
    let s = ''
    want.forEach((row, i) => {
      if (prev[i] === row) return
      s += `\x1b[${i + 1};1H${row}\x1b[0m\x1b[K`
    })
    prev = want
    s += `\x1b[${Math.min(rows, cursorRow + 1)};${Math.min(cols, cursorX + 1)}H`
    c.out(s)
  }

  /* ---------------------------------------------------------- run */

  const file = c.args.find((a) => !a.startsWith('-') && !a.startsWith('+'))
  const plus = c.args.find((a) => a.startsWith('+'))
  if (file) load(file)
  else say(isVim ? L('VIM - Vi IMproved (this one is a vi card on the GL-1 bus)  ·  :q to quit', 'VIM - Vi IMproved (este é uma placa vi no barramento da GL-1)  ·  :q para sair') : L('vi on the GL-1 bus  ·  :q to quit', 'vi no barramento da GL-1  ·  :q para sair'))
  if (plus) {
    const t = plus.slice(1)
    if (t.startsWith('/')) {
      lastSearch = t.slice(1)
      search(lastSearch, false)
    } else {
      cy = t ? Number(t) - 1 : lines.length - 1
      if (Number.isNaN(cy)) cy = 0
      clamp()
      firstNonBlank()
    }
  }

  return new Promise<number>((resolve) => {
    done = resolve
    c.onKey(byte)
    draw()
    // Ctrl+C reaches cards as an interrupt, not a key; the terminal may also be resized.
    let wasInterrupted = false
    const poll = setInterval(() => {
      if (!done) return clearInterval(poll)
      if (c.interrupted() && !wasInterrupted) {
        wasInterrupted = true
        key('C-c')
      }
      const { cols, rows } = termSize(c.m)
      if (`${cols}x${rows}` !== prevSize) draw()
    }, 150)
  })
}

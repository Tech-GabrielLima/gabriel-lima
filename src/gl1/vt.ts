// A small VT100: what GL-OS prints goes through here. Text, newlines (as
// CR+LF), backspace, tabs, and the escapes GL-OS and the cards use: colours
// (SGR 0 1 2 22 30-37 39 90-97), cursor moves (A B C D H f), erase (J K),
// save/restore (s u). Lines that scroll off the top are kept (500 of them).

export interface Cell {
  ch: string
  fg: number
  bold: boolean
}

import { noteScreen } from './term-size'

const BLANK = (fg = 7): Cell => ({ ch: ' ', fg, bold: false })
const SCROLLBACK = 500

export class Screen {
  cols: number
  rows: number
  lines: Cell[][]
  scrollback: Cell[][] = []
  x = 0
  y = 0
  fg = 7
  bold = false
  /** Bumped on every change, for renderers. */
  version = 0
  private saved = { x: 0, y: 0 }
  private dec = new TextDecoder('utf-8')
  private esc: '' | 'esc' | 'csi' = ''
  private params = ''

  constructor(cols: number, rows: number) {
    this.cols = cols
    this.rows = rows
    this.lines = Array.from({ length: rows }, () => this.blankLine())
    noteScreen(cols, rows)
  }

  private blankLine() {
    return Array.from({ length: this.cols }, () => BLANK())
  }

  resize(cols: number, rows: number) {
    if (cols === this.cols && rows === this.rows) return
    const fit = (l: Cell[]) => (l.length >= cols ? l.slice(0, cols) : [...l, ...Array.from({ length: cols - l.length }, () => BLANK())])
    this.lines = this.lines.map(fit)
    this.scrollback = this.scrollback.map(fit)
    this.cols = cols
    while (this.lines.length > rows) {
      this.scrollback.push(this.lines.shift()!)
      this.y = Math.max(0, this.y - 1)
    }
    while (this.lines.length < rows) this.lines.push(this.blankLine())
    this.rows = rows
    this.x = Math.min(this.x, cols - 1)
    noteScreen(cols, rows)
    this.version++
  }

  write(bytes: Uint8Array) {
    if (!bytes.length) return
    for (const ch of this.dec.decode(bytes, { stream: true })) this.char(ch)
    this.version++
  }

  private newline() {
    this.x = 0
    if (this.y < this.rows - 1) {
      this.y++
      return
    }
    this.scrollback.push(this.lines.shift()!)
    if (this.scrollback.length > SCROLLBACK) this.scrollback.shift()
    this.lines.push(this.blankLine())
  }

  private char(ch: string) {
    if (this.esc === 'esc') {
      this.esc = ch === '[' ? 'csi' : ''
      this.params = ''
      return
    }
    if (this.esc === 'csi') {
      if (/[0-9;?]/.test(ch)) {
        this.params += ch
        return
      }
      this.esc = ''
      this.csi(ch, this.params)
      return
    }
    switch (ch) {
      case '\x1b':
        this.esc = 'esc'
        return
      case '\n':
        this.newline()
        return
      case '\r':
        this.x = 0
        return
      case '\b':
        this.x = Math.max(0, this.x - 1)
        return
      case '\t':
        this.x = Math.min(this.cols - 1, (Math.floor(this.x / 8) + 1) * 8)
        return
      case '\x07':
        return
    }
    if (ch < ' ') return
    if (this.x >= this.cols) this.newline()
    this.lines[this.y][this.x] = { ch, fg: this.fg, bold: this.bold }
    this.x++
  }

  private csi(cmd: string, params: string) {
    const n = params.replace('?', '').split(';').map((p) => (p === '' ? NaN : Number(p)))
    const a = Number.isNaN(n[0]) ? 1 : n[0]
    switch (cmd) {
      case 'm':
        for (const p of params === '' ? [0] : n.map((v) => (Number.isNaN(v) ? 0 : v))) {
          if (p === 0) {
            this.fg = 7
            this.bold = false
          } else if (p === 1) this.bold = true
          else if (p === 2) this.fg = 8
          else if (p === 22) this.bold = false
          else if (p >= 30 && p <= 37) this.fg = p - 30
          else if (p === 39) this.fg = 7
          else if (p >= 90 && p <= 97) this.fg = p - 90 + 8
        }
        return
      case 'A':
        this.y = Math.max(0, this.y - a)
        return
      case 'B':
        this.y = Math.min(this.rows - 1, this.y + a)
        return
      case 'C':
        this.x = Math.min(this.cols - 1, this.x + a)
        return
      case 'D':
        this.x = Math.max(0, this.x - a)
        return
      case 'H':
      case 'f': {
        const row = Number.isNaN(n[0]) ? 1 : n[0]
        const col = Number.isNaN(n[1]) || n[1] === undefined ? 1 : n[1]
        this.y = Math.min(this.rows - 1, Math.max(0, row - 1))
        this.x = Math.min(this.cols - 1, Math.max(0, col - 1))
        return
      }
      case 'J':
        if (n[0] === 2 || n[0] === 3) {
          this.lines = Array.from({ length: this.rows }, () => this.blankLine())
          if (n[0] === 3) this.scrollback = []
        } else if (Number.isNaN(n[0]) || n[0] === 0) {
          for (let x = this.x; x < this.cols; x++) this.lines[this.y][x] = BLANK()
          for (let y = this.y + 1; y < this.rows; y++) this.lines[y] = this.blankLine()
        }
        return
      case 'K': {
        const mode = Number.isNaN(n[0]) ? 0 : n[0]
        const [from, to] = mode === 1 ? [0, this.x + 1] : mode === 2 ? [0, this.cols] : [this.x, this.cols]
        for (let x = from; x < to; x++) this.lines[this.y][x] = BLANK()
        return
      }
      case 's':
        this.saved = { x: this.x, y: this.y }
        return
      case 'u':
        this.x = this.saved.x
        this.y = this.saved.y
        return
    }
  }

  /** The screen as plain text (for tests, and for copying). */
  text() {
    return [...this.scrollback, ...this.lines].map((l) => l.map((c) => c.ch).join('').trimEnd()).join('\n').trimEnd()
  }
}

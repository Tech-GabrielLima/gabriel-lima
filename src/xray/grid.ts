import { CanvasTexture, DataTexture, LinearFilter, LinearMipmapLinearFilter, NearestFilter, RGBAFormat, UnsignedByteType } from 'three'

// The X-ray's text layers are drawn by the shader from two textures: an atlas
// of glyphs (printable ASCII in the site's mono face) and a screen-sized grid
// of cells, one texel each — r: character, g: colour class, b: brightness.
// The grid is tiny (≈190×60), so rewriting it every frame costs nothing, and
// the same machinery shows source code, packets falling and the wireframe
// turned to type.

export const ATLAS_COLS = 16
export const ATLAS_ROWS = 6
const GLYPH_W = 48
const GLYPH_H = 80

/** Colour classes (their colours live in the shader's palette). */
export const C = { plain: 0, keyword: 1, number: 2, comment: 3, string: 4, live: 5, packet: 6, hot: 7 } as const

/** Printable ASCII in the site's mono face, white on black; waits for the font. */
export async function makeAtlas() {
  await document.fonts.load(`${GLYPH_H * 0.7}px "JetBrains Mono"`).catch(() => {})
  const c = document.createElement('canvas')
  c.width = ATLAS_COLS * GLYPH_W
  c.height = ATLAS_ROWS * GLYPH_H
  const g = c.getContext('2d')!
  g.fillStyle = '#000'
  g.fillRect(0, 0, c.width, c.height)
  g.fillStyle = '#fff'
  g.font = `${GLYPH_H * 0.7}px "JetBrains Mono", ui-monospace, monospace`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  for (let i = 0; i < ATLAS_COLS * ATLAS_ROWS; i++) {
    const ch = String.fromCharCode(32 + i)
    g.fillText(ch, (i % ATLAS_COLS) * GLYPH_W + GLYPH_W / 2, Math.floor(i / ATLAS_COLS) * GLYPH_H + GLYPH_H * 0.54)
  }
  const tex = new CanvasTexture(c)
  tex.minFilter = LinearMipmapLinearFilter
  tex.magFilter = LinearFilter
  tex.generateMipmaps = true
  return tex
}

export class Grid {
  cols = 1
  rows = 1
  data = new Uint8Array(4)
  tex = new DataTexture(this.data, 1, 1, RGBAFormat, UnsignedByteType)

  resize(cols: number, rows: number) {
    if (cols === this.cols && rows === this.rows) return
    this.cols = cols
    this.rows = rows
    this.data = new Uint8Array(cols * rows * 4)
    this.tex.dispose()
    this.tex = new DataTexture(this.data, cols, rows, RGBAFormat, UnsignedByteType)
    this.tex.minFilter = this.tex.magFilter = NearestFilter
  }

  clear() {
    this.data.fill(0)
  }

  put(col: number, row: number, code: number, cls: number, bright: number) {
    if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) return
    const i = (row * this.cols + col) * 4
    this.data[i] = code
    this.data[i + 1] = cls
    this.data[i + 2] = Math.max(0, Math.min(255, bright * 255))
    this.data[i + 3] = 255
  }

  /** Lays a highlighted listing over the grid, from `first` (wrapping round if it's shorter than the screen). */
  listing(lines: Line[], first = 0, dim = 1) {
    if (!lines.length) return
    for (let r = 0; r < this.rows; r++) {
      const line = lines[(first + r) % lines.length]
      const n = Math.min(line.text.length, this.cols - 1)
      for (let c = 0; c < n; c++) {
        const code = line.text.charCodeAt(c)
        if (code <= 32 || code > 126) continue
        this.put(c + 1, r, code, line.cls[c], (line.bright ?? 0.55) * dim)
      }
    }
  }

  upload() {
    this.tex.needsUpdate = true
  }
}

/* ---------------------------------------------------------------- a small highlighter */

export interface Line {
  text: string
  cls: Uint8Array
  bright?: number
}

const KEYWORDS = new Set(
  'const let var function return if else for while switch case break continue new class extends implements import export from type interface public private protected static final void int float vec2 vec3 vec4 uniform uniform sampler2D in out true false null this await async try catch throws long boolean double record sealed permits'.split(' '),
)

/** Splits source into lines with a colour class per character (keywords, numbers, strings, comments). */
export function highlight(src: string): Line[] {
  return src
    .replace(/\t/g, '  ')
    .split('\n')
    .map((text) => {
      const cls = new Uint8Array(text.length)
      const comment = text.search(/\/\/|^\s*\*|^\s*\/\*/)
      for (const m of text.matchAll(/[A-Za-z_]\w*|\d+(\.\d+)?|"[^"]*"|'[^']*'|`[^`]*`/g)) {
        const w = m[0]
        const k = /^\d/.test(w) ? C.number : /^["'`]/.test(w) ? C.string : KEYWORDS.has(w) ? C.keyword : C.plain
        cls.fill(k, m.index!, m.index! + w.length)
      }
      if (comment >= 0) cls.fill(C.comment, comment)
      return { text, cls }
    })
}

/** One line in a single colour (a live value, a packet). */
export const plainLine = (text: string, k: number, bright = 1): Line => ({ text, cls: new Uint8Array(text.length).fill(k), bright })

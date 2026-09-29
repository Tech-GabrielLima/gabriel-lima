import type { CardCtx } from '../cards'

// A line editor for interactive cards (psql, python). While a card runs,
// GL-OS's driver forwards raw keys, so echo and editing happen here.

export interface LineReader {
  /** The next line (null at Ctrl+D or Ctrl+C on an empty line). `hidden` for passwords. */
  read(prompt: string, hidden?: boolean): Promise<string | null>
}

export function lineReader(c: CardCtx): LineReader {
  let buf: number[] = []
  let esc = 0
  let pending = 0
  let hidden = false
  let waiting: ((s: string | null) => void) | null = null
  const history: string[] = []
  let hi = 0
  const dec = new TextDecoder()
  const enc = new TextEncoder()
  const show = (s: string) => c.out(s)
  const replace = (line: string) => {
    while (buf.length) erase()
    buf = [...enc.encode(line)]
    if (!hidden) show(line)
  }
  const erase = () => {
    if (!buf.length) return
    // a whole UTF-8 character
    do buf.pop()
    while (buf.length && (buf[buf.length - 1] & 0xc0) === 0x80)
    if (!hidden) show('\b \b')
  }
  c.onKey((b) => {
    if (!waiting) return
    if (esc === 1) {
      esc = b === 91 ? 2 : 0
      return
    }
    if (esc === 2) {
      esc = 0
      if (b === 65 && history.length) replace(history[(hi = Math.max(0, hi - 1))] ?? '')
      if (b === 66 && history.length) replace(history[(hi = Math.min(history.length, hi + 1))] ?? '')
      return
    }
    if (b === 27) {
      esc = 1
      return
    }
    if (b === 13 || b === 10) {
      show('\n')
      const line = dec.decode(new Uint8Array(buf))
      buf = []
      if (line.trim() && !hidden) {
        history.push(line)
        hi = history.length
      }
      const w = waiting
      waiting = null
      w(line)
      return
    }
    if (b === 127 || b === 8) return erase()
    if (b === 4 && !buf.length) {
      const w = waiting
      waiting = null
      show('\n')
      w(null)
      return
    }
    if (b === 3) {
      show('^C\n')
      buf = []
      const w = waiting
      waiting = null
      w('')
      return
    }
    if (b < 32) return
    buf.push(b)
    if (hidden) return
    // Echo a character once all its bytes are in (1 for ASCII, 2-4 for the rest of UTF-8).
    if (b < 0x80) return show(String.fromCharCode(b))
    if ((b & 0xc0) !== 0x80) {
      pending = (b & 0xe0) === 0xc0 ? 1 : (b & 0xf0) === 0xe0 ? 2 : 3
      return
    }
    if (--pending === 0) {
      let start = buf.length - 1
      while (start > 0 && (buf[start] & 0xc0) === 0x80) start--
      show(dec.decode(new Uint8Array(buf.slice(start))))
    }
  })
  return {
    read(prompt, h = false) {
      hidden = h
      show(prompt)
      return new Promise((res) => (waiting = res))
    },
  }
}

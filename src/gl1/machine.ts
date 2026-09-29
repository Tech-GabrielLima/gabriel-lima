// The GL-1 in the browser (ROTEIRO §0.4): Gabriel's 8-bit computer, compiled
// from Rust (gl1/) to WebAssembly with a plain C ABI, running GL-OS from the
// disk image built by `npm run gl1`. Each terminal on the site is its own
// GL-1 (the box office, the booth, the machine room, the arcade), and they
// share one filesystem: what one writes, the others read, and it's still
// there on the next visit.

interface Exports {
  memory: WebAssembly.Memory
  gl1_alloc(n: number): number
  gl1_free(p: number, n: number): void
  gl1_new(rom: number, romLen: number, disk: number, diskLen: number, user: number, lang: number): number
  gl1_drop(h: number): void
  gl1_out(h: number): number
  gl1_run(h: number, ms: number): number
  gl1_key(h: number, b: number): void
  gl1_set_size(h: number, cols: number, rows: number): void
  gl1_set_time(h: number, unix: number): void
  gl1_set_lang(h: number, lang: number): void
  gl1_set_pad(h: number, pad: number): void
  gl1_tone(h: number): number
  gl1_set_cards(h: number, mask: number): void
  gl1_power(h: number): number
  gl1_reset(h: number): void
  gl1_revert(h: number): void
  gl1_take_console(h: number): number
  gl1_take_message(h: number): number
  gl1_reply(h: number, p: number, n: number): void
  gl1_take_card(h: number): number
  gl1_card_output(h: number, p: number, n: number): void
  gl1_card_input(h: number): number
  gl1_card_input_closed(h: number): number
  gl1_card_interrupt(h: number): number
  gl1_card_finish(h: number, code: number): void
  gl1_display_mode(h: number): number
  gl1_frames(h: number): number
  gl1_mem(h: number): number
  gl1_regs(h: number): number
  gl1_instructions(h: number): number
  gl1_fs_read(h: number, p: number, n: number): number
  gl1_fs_list(h: number, p: number, n: number): number
  gl1_fs_write(h: number, p: number, pn: number, d: number, dn: number, owner: number, mode: number): number
  gl1_overlay_export(h: number): number
  gl1_overlay_import(h: number, p: number, n: number): void
  gl1_assemble(p: number, n: number): number
  gl1_scratch(): number
}

export const USER = { root: 0, visitante: 1, caixa: 2 } as const
export type Power = 'on' | 'off' | 'reboot' | 'panic'

const enc = new TextEncoder()
const dec = new TextDecoder()

interface Image {
  w: Exports
  rom: Uint8Array
  disk: Uint8Array
}

let image: Promise<Image> | null = null

/** The module, the ROM and the disk, fetched once (about 320 KB, only when a terminal is opened). */
export function loadGl1(): Promise<Image> {
  image ??= (async () => {
    const [wasm, rom, disk] = await Promise.all(['gl1.wasm', 'rom.bin', 'disk.img'].map((f) => fetch(`/gl1/${f}`).then((r) => r.arrayBuffer())))
    const { instance } = await WebAssembly.instantiate(wasm, {})
    return { w: instance.exports as unknown as Exports, rom: new Uint8Array(rom), disk: new Uint8Array(disk) }
  })()
  return image
}

/* ---------------------------------------------------------------- the shared disk */

// Every write any terminal made, as [sector][512 bytes] records, kept between visits.
const DISK_KEY = 'sn.gl1.disk'
let shared: Uint8Array | null = (() => {
  try {
    const b64 = localStorage.getItem(DISK_KEY)
    return b64 ? Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)) : null
  } catch {
    return null
  }
})()

function keepDisk(bytes: Uint8Array | null) {
  shared = bytes
  try {
    if (!bytes || bytes.length === 0) localStorage.removeItem(DISK_KEY)
    // Past ~1.5 MB of writes, it simply isn't remembered.
    else if (bytes.length < 1_500_000) {
      let bin = ''
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
      localStorage.setItem(DISK_KEY, btoa(bin))
    }
  } catch {
    /* private mode: the files last as long as the page */
  }
}

/** Forget every file anyone wrote (the disk goes back to how it shipped). */
export function forgetDisk() {
  keepDisk(null)
}

/* ---------------------------------------------------------------- one machine */

export class Gl1 {
  private w: Exports
  readonly h: number
  private constructor(w: Exports, h: number) {
    this.w = w
    this.h = h
  }

  static async boot(user: number, lang: 'en' | 'pt'): Promise<Gl1> {
    const { w, rom, disk } = await loadGl1()
    const put = (b: Uint8Array) => {
      const p = w.gl1_alloc(b.length)
      new Uint8Array(w.memory.buffer, p, b.length).set(b)
      return [p, b.length] as const
    }
    const [rp, rn] = put(rom)
    const [dp, dn] = put(disk)
    const h = w.gl1_new(rp, rn, dp, dn, user, lang === 'pt' ? 1 : 0)
    w.gl1_free(rp, rn)
    w.gl1_free(dp, dn)
    const m = new Gl1(w, h)
    if (shared?.length) m.withBytes(shared, (p, n) => w.gl1_overlay_import(h, p, n))
    // The card bus: one controller (id 1) that routes every command by name (see cards.ts).
    w.gl1_set_cards(h, 1 << 1)
    w.gl1_set_time(h, Date.now() / 1000)
    return m
  }

  private withBytes<T>(b: Uint8Array, f: (p: number, n: number) => T): T {
    const p = this.w.gl1_alloc(b.length)
    new Uint8Array(this.w.memory.buffer, p, b.length).set(b)
    try {
      return f(p, b.length)
    } finally {
      this.w.gl1_free(p, b.length)
    }
  }
  private out(n: number) {
    return new Uint8Array(this.w.memory.buffer, this.w.gl1_out(this.h), n).slice()
  }

  run(ms: number) {
    this.w.gl1_set_time(this.h, Date.now() / 1000)
    return this.w.gl1_run(this.h, ms)
  }
  key(b: number) {
    this.w.gl1_key(this.h, b)
  }
  type(s: string) {
    for (const b of enc.encode(s)) this.key(b)
  }
  setSize(cols: number, rows: number) {
    this.w.gl1_set_size(this.h, Math.min(255, cols), Math.min(255, rows))
  }
  setLang(lang: 'en' | 'pt') {
    this.w.gl1_set_lang(this.h, lang === 'pt' ? 1 : 0)
  }
  setPad(bits: number) {
    this.w.gl1_set_pad(this.h, bits)
  }
  get tone() {
    return this.w.gl1_tone(this.h)
  }
  get power(): Power {
    return (['on', 'off', 'reboot', 'panic'] as const)[this.w.gl1_power(this.h)] ?? 'off'
  }
  reset() {
    this.w.gl1_reset(this.h)
  }
  /** Copy-on-write: every write since the disk was loaded, gone. */
  revert() {
    this.w.gl1_revert(this.h)
  }
  console(): Uint8Array {
    return this.out(this.w.gl1_take_console(this.h))
  }
  message(): string | null {
    const n = this.w.gl1_take_message(this.h)
    return n < 0 ? null : dec.decode(this.out(n))
  }
  reply(s: string) {
    this.withBytes(enc.encode(s), (p, n) => this.w.gl1_reply(this.h, p, n))
  }
  card(): { id: number; cmd: string } | null {
    const n = this.w.gl1_take_card(this.h)
    if (n < 0) return null
    const b = this.out(n)
    return { id: b[0], cmd: dec.decode(b.subarray(1)) }
  }
  cardOutput(s: string | Uint8Array) {
    this.withBytes(typeof s === 'string' ? enc.encode(s) : s, (p, n) => this.w.gl1_card_output(this.h, p, n))
  }
  cardInput(): Uint8Array {
    return this.out(this.w.gl1_card_input(this.h))
  }
  get cardInputClosed() {
    return this.w.gl1_card_input_closed(this.h) === 1
  }
  cardInterrupted() {
    return this.w.gl1_card_interrupt(this.h) === 1
  }
  cardFinish(code = 0) {
    this.w.gl1_card_finish(this.h, code)
  }
  get displayMode() {
    return this.w.gl1_display_mode(this.h)
  }
  get frames() {
    return this.w.gl1_frames(this.h)
  }
  /** The 64 KB address space, live (VRAM is $E000). */
  memory(): Uint8Array {
    return new Uint8Array(this.w.memory.buffer, this.w.gl1_mem(this.h), 0x10000)
  }
  regs() {
    const b = this.out(this.w.gl1_regs(this.h))
    const w = (i: number) => b[i] | (b[i + 1] << 8)
    return { a: b[0], b: b[1], c: b[2], d: b[3], x: w(4), y: w(6), sp: w(8), pc: w(10), f: b[12], halted: b[13] === 1 }
  }
  get instructions() {
    return this.w.gl1_instructions(this.h)
  }
  readFile(path: string): Uint8Array | null {
    const n = this.withBytes(enc.encode(path), (p, l) => this.w.gl1_fs_read(this.h, p, l))
    return n < 0 ? null : this.out(n)
  }
  /** A directory's entries (kind 1 file, 2 directory, 3 device), or null if it isn't one. */
  list(path: string): { name: string; kind: number; size: number }[] | null {
    const n = this.withBytes(enc.encode(path), (p, l) => this.w.gl1_fs_list(this.h, p, l))
    if (n < 0) return null
    return dec
      .decode(this.out(n))
      .split('\n')
      .filter(Boolean)
      .map((l) => {
        const [name, kind, size] = l.split('\t')
        return { name, kind: Number(kind), size: Number(size) }
      })
  }
  readText(path: string) {
    const b = this.readFile(path)
    return b && dec.decode(b)
  }
  /** Writes a file on the shared disk (mode 1 = readable, 5 = executable). Throws the reason. */
  writeFile(path: string, data: string | Uint8Array, owner: number = USER.visitante, mode = 1) {
    const d = typeof data === 'string' ? enc.encode(data) : data
    const pb = enc.encode(path)
    const r = this.withBytes(pb, (pp, pn) => this.withBytes(d, (dp, dn) => this.w.gl1_fs_write(this.h, pp, pn, dp, dn, owner, mode)))
    if (r < 0) throw new Error(dec.decode(this.out(64)).replace(/\0.*$/s, ''))
  }
  /** Loads everyone's writes (the shared disk) into this machine. */
  importShared() {
    if (shared?.length) this.withBytes(shared, (p, n) => this.w.gl1_overlay_import(this.h, p, n))
  }
  /** This machine's writes become everyone's (and the next visit's). */
  saveDisk() {
    const n = this.w.gl1_overlay_export(this.h)
    keepDisk(this.out(n))
  }
  drop() {
    this.saveDisk()
    this.w.gl1_drop(this.h)
  }
}

/** glasm in the browser: the same assembler that built GL-OS. */
export async function assemble(src: string): Promise<{ ok: true; bytes: Uint8Array } | { ok: false; errors: string }> {
  const { w } = await loadGl1()
  const b = enc.encode(src)
  const p = w.gl1_alloc(b.length)
  new Uint8Array(w.memory.buffer, p, b.length).set(b)
  const n = w.gl1_assemble(p, b.length)
  w.gl1_free(p, b.length)
  const out = new Uint8Array(w.memory.buffer, w.gl1_scratch(), Math.abs(n)).slice()
  return n >= 0 ? { ok: true, bytes: out } : { ok: false, errors: dec.decode(out) }
}

/**
 * The shared disk as it is right now, for code outside any terminal (the
 * projector's daemon): a GL-1 that never runs, loaded with everyone's writes.
 */
let reader: Promise<Gl1> | null = null
export async function readShared(path: string): Promise<string | null> {
  reader ??= Gl1.boot(USER.root, 'en')
  const m = await reader
  m.revert()
  m.importShared()
  return m.readText(path)
}

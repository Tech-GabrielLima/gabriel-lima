// The LEDGER room's engine: a double-entry ledger in miniature that follows
// event-sourced-ledger's own saga, step by step, with its event names. The
// accounts are funded from SYSTEM (MoneyDeposited), so the sum of every
// balance, SYSTEM included, is always 0. A transfer claims its idempotency key
// (a key already claimed is replayed: nothing moves twice), then TransferRequested
// → TransferDebited (the source, locked) → TransferCredited (the destination,
// locked) → TransferSettled. If the credit fails the saga compensates: the
// money goes back to the source and TransferFailed is recorded. Money in
// flight between debit and credit is counted too, so the total never moves.

export type Tone = 'ok' | 'warn' | 'bad' | 'dim'
export interface Ev {
  seq: number
  text: string
  tone: Tone
}
export interface Flight {
  id: number
  src: number
  dst: number
  amt: number
  fail: boolean
  /** 0..1 along the arc; back = returning to the source (compensation). */
  t: number
  dur: number
  back: boolean
}

export const ACCOUNTS = 8
/** The test's total: 1000000 across the accounts. */
export const TOTAL = 1_000_000

const short = () => Math.random().toString(16).slice(2, 6)

export class Ledger {
  bal = new Array<number>(ACCOUNTS).fill(0)
  system = 0
  seq = 0
  events: Ev[] = []
  flights: Flight[] = []
  keys = new Set<string>()
  published = 0
  completed = 0
  failed = 0
  /** When each account was last locked (SELECT … FOR UPDATE), performance.now() seconds. */
  lockedAt = new Array<number>(ACCOUNTS).fill(-99)
  private id = 0
  private queue: { src: number; dst: number; amt: number; key: string }[] = []
  private batch: { total: number; done: number } | null = null

  constructor() {
    for (let i = 0; i < ACCOUNTS; i++) {
      const amt = TOTAL / ACCOUNTS
      this.bal[i] += amt
      this.system -= amt
      this.log(`MoneyDeposited      SYSTEM → A${i + 1}  ${cents(amt)}`, 'dim')
    }
  }

  get inFlight() {
    return this.flights.reduce((s, f) => s + f.amt, 0)
  }
  /** Money in the accounts plus money on its way between them: always TOTAL. */
  get total() {
    return this.bal.reduce((a, b) => a + b, 0) + this.inFlight
  }
  get batchState() {
    return this.batch
  }

  private log(text: string, tone: Tone) {
    this.events.unshift({ seq: ++this.seq, text: `#${String(this.seq).padStart(5, '0')}  ${text}`, tone })
    if (this.events.length > 40) this.events.length = 40
    this.published++
  }

  /** One transfer, from the idempotency claim to the debit. Returns what happened at once. */
  transfer(src: number, dst: number, amt: number, key: string, opts: { fail?: boolean; dur?: number; quiet?: boolean } = {}): 'started' | 'replay' | 'insufficient' {
    const now = performance.now() / 1000
    if (this.keys.has(key)) {
      this.log(`Idempotency-Key ${key}  já usada: replay, nada se move`, 'warn')
      return 'replay'
    }
    this.keys.add(key)
    const id = ++this.id
    if (!opts.quiet) this.log(`TransferRequested   A${src + 1} → A${dst + 1}  ${cents(amt)}  key=${key}  PENDING`, 'dim')
    if (this.bal[src] < amt) {
      this.log(`TransferFailed      A${src + 1}  saldo insuficiente  FAILED`, 'bad')
      this.failed++
      return 'insufficient'
    }
    this.bal[src] -= amt
    this.lockedAt[src] = now
    if (!opts.quiet) this.log(`TransferDebited     A${src + 1}  −${cents(amt)}  DEBITED`, 'ok')
    this.flights.push({ id, src, dst, amt, fail: !!opts.fail, t: 0, dur: opts.dur ?? 1.1, back: false })
    return 'started'
  }

  /** The concurrency test: `n` transfers at once, between random accounts, each with its own key. */
  storm(n: number) {
    if (this.batch && this.batch.done < this.batch.total) return
    for (let k = 0; k < n; k++) {
      const src = Math.floor(Math.random() * ACCOUNTS)
      let dst = Math.floor(Math.random() * (ACCOUNTS - 1))
      if (dst >= src) dst++
      this.queue.push({ src, dst, amt: 100 * (1 + Math.floor(Math.random() * 40)), key: short() + short() })
    }
    this.batch = { total: n, done: 0 }
    this.log(`— ${n} transferências simultâneas —`, 'warn')
  }

  step(dt: number, onArrive?: (f: Flight) => void) {
    const now = performance.now() / 1000
    // The storm is fed in fast; a transfer whose source can't cover it waits for money to arrive.
    for (let k = 0; k < Math.ceil(dt * 220) && this.queue.length; k++) {
      const q = this.queue.findIndex((x) => this.bal[x.src] >= x.amt)
      if (q < 0) break
      const [x] = this.queue.splice(q, 1)
      this.transfer(x.src, x.dst, x.amt, x.key, { dur: 0.55 + Math.random() * 0.6, quiet: true })
    }
    for (let i = this.flights.length - 1; i >= 0; i--) {
      const f = this.flights[i]
      f.t += dt / f.dur
      if (f.t < 1) continue
      onArrive?.(f)
      if (f.back) {
        // Compensation lands: the source gets its money back.
        this.bal[f.src] += f.amt
        this.lockedAt[f.src] = now
        this.log(`TransferFailed      A${f.src + 1}  +${cents(f.amt)} devolvido  COMPENSATED`, 'bad')
        this.failed++
        this.flights.splice(i, 1)
      } else if (f.fail) {
        this.log(`crédito em A${f.dst + 1} falhou: a saga compensa`, 'bad')
        f.back = true
        f.t = 0
      } else {
        this.bal[f.dst] += f.amt
        this.lockedAt[f.dst] = now
        this.completed++
        const quiet = this.batch && this.batch.done < this.batch.total
        if (!quiet) {
          this.log(`TransferCredited    A${f.dst + 1}  +${cents(f.amt)}  COMPLETED`, 'ok')
          this.log(`TransferSettled     #${f.id}`, 'dim')
        }
        this.flights.splice(i, 1)
        if (this.batch && this.batch.done < this.batch.total) {
          this.batch.done++
          if (this.batch.done % 100 === 0) this.log(`${this.batch.done}/${this.batch.total} concluídas · total=${this.total}`, 'dim')
          if (this.batch.done === this.batch.total) this.log(`concurrency: ${this.batch.total}/${this.batch.total} transfers completed, money conserved exactly (total=${this.total})`, 'ok')
        }
      }
    }
  }
}

/** Cents as reais, the way the wall shows them. */
export const cents = (c: number) => `R$ ${(c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
export const newKey = () => short() + short()

import type { LiveState } from '../../../live/live'

// The MATCH room without the server: a small price-time order book with a
// market maker quoting round the touch and takers hitting it now and then, in
// the same shape as the live engine's `book`, so the room draws either the same
// way. It's a stand-in, and the room says so.

type Book = LiveState['book']
type Side = 'BUY' | 'SELL'
export type Fill = { filled: number; remaining: number; lastPrice: number; trades: number }

const DEPTH = 10

export class BookSim {
  bids = new Map<number, number>()
  asks = new Map<number, number>()
  last: Book['last'] = []
  trades = 0
  orders = 0
  private id = 0
  private acc = 0

  constructor(mid = 10000) {
    for (let i = 1; i <= DEPTH; i++) {
      this.bids.set(mid - i, 3 + Math.floor(Math.random() * 20))
      this.asks.set(mid + i - 1, 3 + Math.floor(Math.random() * 20))
    }
  }

  get bestBid() {
    return this.bids.size ? Math.max(...this.bids.keys()) : 0
  }
  get bestAsk() {
    return this.asks.size ? Math.min(...this.asks.keys()) : 0
  }

  step(dt: number) {
    this.acc += dt
    while (this.acc > 0.22) {
      this.acc -= 0.22
      this.tick()
    }
  }

  private tick() {
    const r = Math.random()
    const side: Side = Math.random() < 0.5 ? 'BUY' : 'SELL'
    if (r < 0.6) {
      // The market maker rests an order a few ticks behind its side's touch (never crossing).
      const bb = this.bestBid || this.bestAsk - 1
      const ba = this.bestAsk || this.bestBid + 1
      const back = Math.floor(Math.random() * 6)
      const price = side === 'BUY' ? Math.min(ba - 1, bb - back + (back === 0 && ba - bb > 1 ? 1 : 0)) : Math.max(bb + 1, ba + back - (back === 0 && ba - bb > 1 ? 1 : 0))
      this.order(side, 'LIMIT', price, 1 + Math.floor(Math.random() * 6))
    } else if (r < 0.85) {
      this.order(side, 'MARKET', 0, 1 + Math.floor(Math.random() * 5))
    } else {
      // A cancel, somewhere in the book.
      const m = side === 'BUY' ? this.bids : this.asks
      const keys = [...m.keys()]
      const k = keys[Math.floor(Math.random() * keys.length)]
      if (k !== undefined) this.reduce(m, k, 1 + Math.floor(Math.random() * 3))
    }
    // Both sides always keep some depth.
    for (const [m, dir] of [
      [this.bids, -1],
      [this.asks, 1],
    ] as const) {
      while (m.size < 7) {
        const edge = dir < 0 ? Math.min(...m.keys(), this.bestAsk) : Math.max(...m.keys(), this.bestBid)
        m.set(edge + dir, 4 + Math.floor(Math.random() * 12))
      }
    }
  }

  private reduce(m: Map<number, number>, price: number, q: number) {
    const left = (m.get(price) ?? 0) - q
    if (left > 0) m.set(price, left)
    else m.delete(price)
  }

  /** Price-time matching against the other side, from its best level out; a limit's remainder rests. */
  order(side: Side, type: 'LIMIT' | 'MARKET', price: number, qty: number): Fill {
    this.orders++
    const book = side === 'BUY' ? this.asks : this.bids
    let left = qty
    let lastPrice = 0
    let trades = 0
    while (left > 0 && book.size) {
      const best = side === 'BUY' ? Math.min(...book.keys()) : Math.max(...book.keys())
      if (type === 'LIMIT' && (side === 'BUY' ? best > price : best < price)) break
      const take = Math.min(left, book.get(best)!)
      this.reduce(book, best, take)
      left -= take
      lastPrice = best
      trades++
      this.trades++
      this.last.unshift([++this.id, best, take, side, Date.now()])
    }
    this.last.length = Math.min(this.last.length, 12)
    if (type === 'LIMIT' && left > 0) {
      const own = side === 'BUY' ? this.bids : this.asks
      own.set(price, (own.get(price) ?? 0) + left)
    }
    return { filled: qty - left, remaining: type === 'LIMIT' ? left : 0, lastPrice, trades }
  }

  snapshot(): Book {
    const bids = [...this.bids.entries()].sort((a, b) => b[0] - a[0]).slice(0, DEPTH)
    const asks = [...this.asks.entries()].sort((a, b) => a[0] - b[0]).slice(0, DEPTH)
    return { bids, asks, last: this.last, trades: this.trades, orders: this.orders, bestBid: bids[0]?.[0] ?? 0, bestAsk: asks[0]?.[0] ?? 0 }
  }
}

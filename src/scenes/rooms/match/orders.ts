import { useFilm } from '../../../film/store'
import { live, px, useLive, type LiveState } from '../../../live/live'
import { BookSim } from './sim'
import { useMatchRoom } from './state'
import { findFrame } from '../../../cinema/progress'
import { usherSays } from '../../../cinema/usher'

// The visitor's orders in the MATCH room, from the DOM buttons or a click on a
// tower: to the real engine when the server is live, else to the local book.
// A limit order that rests is followed up the queue by the scene (Mine).

/** The offline book: one per page, so it keeps its history between visits to the room. */
export const sim = new BookSim()

export const isLive = () => useLive.getState().status === 'live' && !!useLive.getState().state?.book

/** The book the room is drawing right now. */
export const currentBook = (): LiveState['book'] => (isLive() ? useLive.getState().state!.book : sim.snapshot())

/** A price as the tape shows it, in the visitor's language. */
export const price = (ticks: number) => (useFilm.getState().lang === 'pt' ? px(ticks).replace('.', ',') : px(ticks))

let busy = false

export async function placeOrder(side: 'BUY' | 'SELL', type: 'LIMIT' | 'MARKET', at: number, qty: number) {
  if (busy) return
  busy = true
  const pt = useFilm.getState().lang === 'pt'
  if (type === 'MARKET') useMatchRoom.setState((s) => ({ sent: { n: s.sent.n + 1, side } }))
  // What rests ahead at that price now fills before this order (price-time priority).
  const own = side === 'BUY' ? currentBook().bids : currentBook().asks
  const ahead = own.find((l) => l[0] === at)?.[1] ?? 0
  useMatchRoom.setState({ note: pt ? 'enviando ao engine…' : 'sending to the engine…' })

  let filled = 0
  let remaining = 0
  let last = 0
  let trades = 0
  if (isLive()) {
    const r = await live.order(type === 'LIMIT' ? { side, type, price: at, qty } : { side, type, qty })
    busy = false
    if (!r) return useMatchRoom.setState({ note: pt ? 'o engine não respondeu: tente de novo' : 'the engine didn’t answer: try again' })
    const rep = r.reports[r.reports.length - 1]
    filled = rep?.filled ?? 0
    remaining = type === 'LIMIT' ? (rep?.remaining ?? 0) : 0
    last = r.trades[r.trades.length - 1]?.[0] ?? rep?.lastPrice ?? 0
    trades = r.trades.length
  } else {
    const f = sim.order(side, type, at, qty)
    busy = false
    ;({ filled, remaining, lastPrice: last, trades } = f)
  }

  // Frame 26: the other side of the visitor's own resting order, filled at its price, is a wash trade.
  const prev = useMatchRoom.getState().mine
  const crosses = prev && prev.side !== side && (type === 'MARKET' || (side === 'BUY' ? at >= prev.price : at <= prev.price))
  const wash = !!(crosses && filled && last === prev!.price)

  const verb = side === 'BUY' ? (pt ? 'comprou' : 'bought') : pt ? 'vendeu' : 'sold'
  const where = isLive() ? '' : pt ? ' (simulação local)' : ' (local simulation)'
  let note: string
  if (filled && remaining) note = pt ? `${verb} ${filled} a ${price(last)}; ${remaining} ficam na fila em ${price(at)}` : `${verb} ${filled} at ${price(last)}; ${remaining} rest in the queue at ${price(at)}`
  else if (filled) note = pt ? `${verb} ${filled} a ${price(last)} em ${trades} ${trades === 1 ? 'negócio' : 'negócios'}` : `${verb} ${filled} at ${price(last)} in ${trades} ${trades === 1 ? 'trade' : 'trades'}`
  else if (remaining) note = pt ? `sua ordem entrou na fila em ${price(at)}, com ${ahead} ${ahead === 1 ? 'lote' : 'lotes'} na frente` : `your order joined the queue at ${price(at)}, ${ahead} ${ahead === 1 ? 'lot' : 'lots'} ahead`
  else note = pt ? 'nada executado: o livro estava vazio desse lado' : 'nothing filled: that side of the book was empty'
  if (wash) {
    note = pt
      ? `você negociou consigo mesmo a ${price(last)}: um wash trade. Engines de bolsa impedem isso (self-trade prevention); este não tem contas, então não sabe quem é quem.`
      : `you traded with yourself at ${price(last)}: a wash trade. Exchange engines prevent it (self-trade prevention); this one has no accounts, so it can't tell who's who.`
    usherSays(pt ? 'Isso é crime. A CVM foi avisada. (Mentira.)' : "That's a crime. The SEC has been told. (Not really.)", true)
    findFrame('match')
  }
  useMatchRoom.setState({ note: note + where, mine: remaining ? { side, price: at, ahead: filled ? 0 : ahead, qty: remaining } : wash ? null : useMatchRoom.getState().mine })
}

// The editing room's slate: a real component of this site. In Act III you can
// open this very file, change it, and the site recompiles it in your browser
// and swaps it in (see ./EditingRoom.tsx).

const TEXT = 'Sessão Noturna'
const TAKE = 1
const COLOR = '#ffb36b'

export default function Slate() {
  return (
    <div className="slate" style={{ borderColor: COLOR }}>
      <span className="slate-stripes" aria-hidden />
      <p className="slate-kicker">CENA 09 · TAKE {TAKE}</p>
      <p className="slate-title" style={{ color: COLOR }}>
        {TEXT}
      </p>
      <p className="slate-by">dir. Gabriel Lima</p>
    </div>
  )
}

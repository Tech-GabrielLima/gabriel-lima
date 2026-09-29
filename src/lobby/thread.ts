// The GL monogram is one continuous stroke; in the lobby that stroke keeps
// going. It leaves the marquee, winds down past every section, and at the
// bottom runs around the cinema door, drawing its frame (ROTEIRO §0.1).
//
// Two paths: the winding one is drawn by the scroll (its tip stays a little
// ahead of the reader), the door frame burns around in one go, like a fuse,
// once the winding one reaches the floor.

const NS = 'http://www.w3.org/2000/svg'

interface Sample {
  len: number
  y: number
}

export interface Thread {
  layout(): void
  draw(scrollTop: number): void
  dispose(): void
}

/**
 * `data-anchor="fx,fy"`: a point on an element, as fractions of its box (may lie outside it).
 * `fx` = `g` puts the point in the element's left gutter, halfway to its content, so the line never crosses text.
 * Several points on one element are separated by `;`.
 */
function anchorPoints(content: HTMLElement) {
  const base = content.getBoundingClientRect()
  return [...content.querySelectorAll<HTMLElement>('[data-anchor]')].flatMap((el) => {
    const r = el.getBoundingClientRect()
    return el.dataset.anchor!.split(';').map((a) => {
      const [fx, fy] = a.split(',')
      const inner = el.firstElementChild?.getBoundingClientRect().left ?? r.left
      const x = fx === 'g' ? Math.max(8, (inner - base.left) / 2) : r.left - base.left + r.width * Number(fx)
      return { x, y: r.top - base.top + r.height * Number(fy) }
    })
  })
}

/** A smooth path through the points that always leaves and arrives vertically, like a hanging cable. */
function wind(pts: { x: number; y: number }[]) {
  let d = `M ${pts[0].x} ${pts[0].y}`
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    const h = (b.y - a.y) * 0.55
    d += ` C ${a.x} ${a.y + h} ${b.x} ${b.y - h} ${b.x} ${b.y}`
  }
  return d
}

export function createThread(content: HTMLElement, svg: SVGSVGElement, door: HTMLElement): Thread {
  const path = document.createElementNS(NS, 'path')
  const frame = document.createElementNS(NS, 'path')
  path.setAttribute('class', 'thread-line')
  frame.setAttribute('class', 'thread-line thread-frame')
  svg.append(path, frame)

  let samples: Sample[] = []
  let total = 0
  let height = 0
  let burnt = false

  const layout = () => {
    // The visible width, not scrollWidth: anything overflowing sideways would otherwise widen the viewBox and
    // shrink the whole drawing to fit, sliding the thread off the things it hangs on.
    const w = content.clientWidth
    height = content.scrollHeight
    svg.setAttribute('viewBox', `0 0 ${w} ${height}`)
    svg.setAttribute('preserveAspectRatio', 'none')
    svg.style.width = `${w}px`
    svg.style.height = `${height}px`

    const pts = anchorPoints(content)
    if (pts.length < 2) return
    const base = content.getBoundingClientRect()
    const d = door.getBoundingClientRect()
    const L = d.left - base.left
    const R = d.right - base.left
    const T = d.top - base.top
    const B = d.bottom - base.top
    // The winding line lands on the floor, left of the door; the frame goes up, across, down, and off along the floor.
    const floorL = Math.max(12, L - Math.min(160, w * 0.2))
    const floorR = Math.min(w - 12, R + Math.min(160, w * 0.2))
    path.setAttribute('d', `${wind([...pts, { x: floorL, y: B }])}`)
    frame.setAttribute('d', `M ${floorL} ${B} L ${L} ${B} L ${L} ${T} L ${R} ${T} L ${R} ${B} L ${floorR} ${B}`)

    total = path.getTotalLength()
    samples = []
    for (let i = 0; i <= 200; i++) {
      const len = (total * i) / 200
      samples.push({ len, y: path.getPointAtLength(len).y })
    }
    path.style.strokeDasharray = `${total} ${total}`
    const fl = frame.getTotalLength()
    frame.style.strokeDasharray = `${fl} ${fl}`
    frame.style.setProperty('--len', String(fl))
    if (!burnt) frame.style.strokeDashoffset = String(fl)
  }

  const draw = (scrollTop: number) => {
    if (!samples.length) return
    const vh = innerHeight
    const max = Math.max(1, height - vh)
    // The tip hangs low on the first screen and reaches the very bottom as the scroll does.
    const tipY = scrollTop + vh * (0.82 + 0.18 * Math.min(1, scrollTop / max))
    let len = 0
    for (const s of samples) {
      if (s.y > tipY) break
      len = s.len
    }
    path.style.strokeDashoffset = String(total - len)
    const done = len >= total - 1
    if (done !== burnt) {
      burnt = done
      frame.classList.toggle('burn', done)
      frame.style.strokeDashoffset = done ? '0' : String(frame.style.getPropertyValue('--len'))
      door.classList.toggle('framed', done)
    }
  }

  return { layout, draw, dispose: () => svg.replaceChildren() }
}

// Act I's one animation loop. Everything that follows the pointer or the
// scroll is written here, straight to the few elements that need it (never to
// the root, so a pointer move never restyles the whole page): the lantern,
// the lit writings, the tilting objects, the fps readout.

export const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches
const TOUCH = matchMedia('(pointer: coarse)').matches

interface Tilt {
  el: HTMLElement
  x: number
  y: number
  /** Only reacts while the pointer is over it (else it drifts back to rest). */
  hover: boolean
}

export interface LoopHooks {
  /** Called every frame with the scroller's position, for the thread and the reel. */
  onFrame?: (t: number, scrollTop: number) => void
}

export function runLoop(root: HTMLElement, scroller: HTMLElement, hooks: LoopHooks) {
  const light = root.querySelector<HTMLElement>('.lobby-dark')!
  const fps = root.querySelector<HTMLElement>('[data-fps]')
  const tilts: Tilt[] = [...root.querySelectorAll<HTMLElement>('[data-tilt]')].map((el) => ({ el, x: 0, y: 0, hover: el.dataset.tilt === 'hover' }))

  const p = { x: innerWidth / 2, y: innerHeight * 0.4, tx: innerWidth / 2, ty: innerHeight * 0.4, active: false, lastTouch: -1e9 }
  const onMove = (e: PointerEvent) => {
    p.tx = e.clientX
    p.ty = e.clientY
    p.active = true
    if (e.pointerType !== 'mouse') p.lastTouch = performance.now()
  }
  addEventListener('pointermove', onMove, { passive: true })
  addEventListener('pointerdown', onMove, { passive: true })

  let raf = 0
  let frames = 0
  let fpsAt = performance.now()
  const tick = (now: number) => {
    raf = requestAnimationFrame(tick)
    const t = now / 1000

    // Nobody holding the light (a phone, or a mouse that hasn't moved yet): it wanders by itself.
    if (!p.active || (TOUCH && now - p.lastTouch > 3500)) {
      p.tx = innerWidth * (0.5 + 0.28 * Math.sin(t * 0.37))
      p.ty = innerHeight * (0.42 + 0.18 * Math.sin(t * 0.53 + 1))
    }
    const k = REDUCED ? 1 : 0.14
    p.x += (p.tx - p.x) * k
    p.y += (p.ty - p.y) * k

    // All layout reads first, then all writes: interleaving them would force a layout per element.
    const lit = [...root.querySelectorAll<HTMLElement>('[data-lit]')].map((el) => [el, el.getBoundingClientRect()] as const)
    const tiltRects = tilts.map((o) => o.el.getBoundingClientRect())
    const top = scroller.scrollTop

    light.style.setProperty('--lx', `${p.x.toFixed(1)}px`)
    light.style.setProperty('--ly', `${p.y.toFixed(1)}px`)

    // Writings on the wall: masked by the lantern, in their own coordinates.
    for (const [el, r] of lit) {
      if (r.bottom < 0 || r.top > innerHeight) continue
      el.style.setProperty('--mx', `${(p.x - r.left).toFixed(1)}px`)
      el.style.setProperty('--my', `${(p.y - r.top).toFixed(1)}px`)
    }

    tilts.forEach((o, i) => {
      const r = tiltRects[i]
      if (r.bottom < 0 || r.top > innerHeight) return
      const inside = p.x > r.left && p.x < r.right && p.y > r.top && p.y < r.bottom
      const nx = (p.x - (r.left + r.width / 2)) / (r.width / 2)
      const ny = (p.y - (r.top + r.height / 2)) / (r.height / 2)
      const on = !REDUCED && (!o.hover || inside)
      o.x += ((on ? Math.max(-1.5, Math.min(1.5, nx)) : 0) - o.x) * 0.08
      o.y += ((on ? Math.max(-1.5, Math.min(1.5, ny)) : 0) - o.y) * 0.08
      o.el.style.setProperty('--tx', o.x.toFixed(3))
      o.el.style.setProperty('--ty', o.y.toFixed(3))
    })

    hooks.onFrame?.(t, top)

    frames++
    if (fps && now - fpsAt > 500) {
      fps.textContent = String(Math.round((frames * 1000) / (now - fpsAt)))
      frames = 0
      fpsAt = now
    }
  }
  raf = requestAnimationFrame(tick)
  return () => {
    cancelAnimationFrame(raf)
    removeEventListener('pointermove', onMove)
    removeEventListener('pointerdown', onMove)
  }
}

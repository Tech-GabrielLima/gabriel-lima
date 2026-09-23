import { useEffect, useRef } from 'react'

/**
 * The visitor's pointer over the picture: a small amber ring (the light's
 * "handle") that lags a touch behind and swells over things that react.
 * Scenes signal interactivity by setting body.style.cursor = 'pointer'.
 */
export function CursorRing() {
  const ring = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (matchMedia('(pointer: coarse)').matches) return
    const pos = { x: innerWidth / 2, y: innerHeight / 2, tx: innerWidth / 2, ty: innerHeight / 2 }
    const move = (e: PointerEvent) => {
      pos.tx = e.clientX
      pos.ty = e.clientY
      const overCanvas = (e.target as HTMLElement).tagName === 'CANVAS'
      ring.current!.classList.toggle('hidden', !overCanvas)
    }
    let raf = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      pos.x += (pos.tx - pos.x) * 0.3
      pos.y += (pos.ty - pos.y) * 0.3
      const el = ring.current!
      el.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`
      el.classList.toggle('hot', document.body.style.cursor === 'pointer')
    }
    addEventListener('pointermove', move, { passive: true })
    raf = requestAnimationFrame(tick)
    document.documentElement.classList.add('has-ring')
    return () => {
      removeEventListener('pointermove', move)
      cancelAnimationFrame(raf)
    }
  }, [])
  return (
    <div ref={ring} className="cursor-ring hidden" aria-hidden>
      <span />
    </div>
  )
}

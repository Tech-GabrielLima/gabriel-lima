import { useEffect, useState, type RefObject } from 'react'
import type { Lang } from '../film/store'

// Small things the backstage pieces share.

export const L = <T,>(lang: Lang, en: T, pt: T) => (lang === 'pt' ? pt : en)

/** True while the element is (nearly) on screen: the simulations only run while someone is looking. */
export function useOnScreen(ref: RefObject<Element | null>, margin = '200px') {
  const [on, setOn] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setOn(e.isIntersecting), { rootMargin: margin })
    io.observe(el)
    return () => io.disconnect()
  }, [ref, margin])
  return on
}

/** A fixed-rate loop that only runs while `on`. */
export function useLoop(on: boolean, ms: number, f: () => void) {
  useEffect(() => {
    if (!on) return
    const t = setInterval(f, ms)
    return () => clearInterval(t)
  }, [on, ms, f])
}

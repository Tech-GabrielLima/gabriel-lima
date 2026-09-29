import { useEffect, useRef } from 'react'
import { useFilm } from '../film/store'

// Lost frame 21 (ROTEIRO §0.4.5): hold R while the projection fault tears the
// alley open and you fall through the tear into a frame that isn't in the
// film. The reel's head leader, the blank film spliced in before the picture,
// with a note someone in the booth wrote on it, projected for a few seconds
// with the gate slipped (the frame line and the perforations in view). Then
// the alley again.
//
// Drawn in 2D over everything: the film's canvas is paused underneath, and
// this shot has no 3D in it, only light through acetate.

/** How long the visitor stays in the lost frame. */
export const LOST_S = 3.4
const FACE = 'SnHandLost'

const NOTE = {
  pt: ['Nota pra quem estiver na cabine:', 'este fotograma não entra no filme.', 'o projetor ligou sozinho de novo, às 3h.', 'não fui eu.  — G.'],
  en: ['Note for whoever is in the booth:', 'this frame is not in the film.', 'the projector switched itself on again, at 3 a.m.', 'it wasn’t me.  — G.'],
}
const EDGE = { pt: 'SESSÃO NOTURNA · ROLO 1 · CABEÇA · NÃO EXIBIR · ', en: 'SESSÃO NOTURNA · REEL 1 · HEAD · DO NOT SCREEN · ' }

export function LostFrame() {
  const lang = useFilm((s) => s.lang)
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const c = ref.current!
    const g = c.getContext('2d')!
    let raf = 0
    let ready = false
    const face = new FontFace(FACE, 'url(/fonts/Caveat.ttf)')
    face
      .load()
      .then((f) => (document.fonts.add(f), (ready = true)))
      .catch(() => (ready = true))
    const t0 = performance.now()
    // Dust and scratches are the same few for the whole shot, like on a real strip; only some flicker.
    const scratches = Array.from({ length: 5 }, () => [Math.random(), Math.random() * 0.4])
    const frame = () => {
      raf = requestAnimationFrame(frame)
      const t = (performance.now() - t0) / 1000
      const dpr = Math.min(devicePixelRatio, 2)
      const W = (c.width = innerWidth * dpr)
      const H = (c.height = innerHeight * dpr)
      const u = H / 900
      // In and out of the tear: a flash of white, the leader, then gone.
      const env = Math.min(1, t / 0.12) * Math.min(1, Math.max(0, (LOST_S - t) / 0.35))
      c.style.opacity = String(env)
      g.fillStyle = '#000'
      g.fillRect(0, 0, W, H)

      // The gate weaves; the frame has slipped, so the frame line rides a third of the way down.
      g.save()
      g.translate(Math.sin(t * 23) * 2 * u, Math.sin(t * 17) * 3 * u + ((t * 40 * u) % (H * 0.02)))
      const flicker = 0.9 + Math.random() * 0.1
      const grad = g.createRadialGradient(W / 2, H / 2, H * 0.1, W / 2, H / 2, H * 0.95)
      grad.addColorStop(0, `rgba(248, 236, 208, ${flicker})`)
      grad.addColorStop(1, `rgba(150, 118, 76, ${flicker})`)
      g.fillStyle = grad
      g.fillRect(-20, -20, W + 40, H + 40)
      const line = H * 0.31
      g.fillStyle = 'rgba(20, 12, 6, .92)'
      g.fillRect(-20, line - 9 * u, W + 40, 18 * u)

      // Perforations down both edges, and the edge print between them and the picture.
      const pitch = 68 * u
      g.fillStyle = '#0b0805'
      for (const x of [W * 0.035, W * 0.965]) for (let y = -pitch + (line % pitch); y < H + pitch; y += pitch) {
        g.beginPath()
        g.roundRect(x - 16 * u, y - 22 * u, 32 * u, 44 * u, 7 * u)
        g.fill()
      }
      g.save()
      g.translate(W * 0.075, H)
      g.rotate(-Math.PI / 2)
      g.font = `${15 * u}px 'JetBrains Mono', monospace`
      g.fillStyle = 'rgba(70, 40, 20, .7)'
      g.fillText(EDGE[lang].repeat(4) + '21', 0, 0)
      g.restore()

      // The splice's start mark: a punched circle with an X through it.
      g.strokeStyle = 'rgba(40, 20, 10, .8)'
      g.lineWidth = 4 * u
      g.beginPath()
      g.arc(W * 0.82, line + 120 * u, 34 * u, 0, Math.PI * 2)
      g.moveTo(W * 0.82 - 24 * u, line + 96 * u)
      g.lineTo(W * 0.82 + 24 * u, line + 144 * u)
      g.moveTo(W * 0.82 + 24 * u, line + 96 * u)
      g.lineTo(W * 0.82 - 24 * u, line + 144 * u)
      g.stroke()

      // The note, in ink, a bit crooked, as written on a bench with the reel on it.
      if (ready) {
        g.save()
        g.translate(W / 2, line + (H - line) * 0.42)
        g.rotate(-0.035)
        g.fillStyle = 'rgba(28, 30, 70, .88)'
        g.textAlign = 'center'
        const size = Math.min(58 * u, (W * 0.8) / 22)
        g.font = `${size}px ${FACE}, cursive`
        NOTE[lang].forEach((l, i) => g.fillText(l, (i % 2 ? 10 : -6) * u, (i - 1.5) * size * 1.2))
        g.restore()
      }

      // Scratches that run the length of the reel, and dust on this frame only.
      g.strokeStyle = 'rgba(255, 255, 255, .35)'
      g.lineWidth = 1.2 * u
      for (const [x, w] of scratches) {
        g.beginPath()
        g.moveTo((x + Math.sin(t * 3 + w * 9) * 0.002) * W, 0)
        g.lineTo((x + w * 0.01) * W, H)
        g.stroke()
      }
      g.fillStyle = 'rgba(15, 8, 4, .7)'
      for (let i = 0; i < 14; i++) {
        g.beginPath()
        g.arc(Math.random() * W, Math.random() * H, (0.6 + Math.random() * 2.4) * u, 0, Math.PI * 2)
        g.fill()
      }
      g.restore()
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [lang])

  return (
    <canvas
      ref={ref}
      aria-label={lang === 'pt' ? 'Um fotograma que não está no filme: a ponta do rolo, com um bilhete escrito à mão.' : 'A frame that isn’t in the film: the head of the reel, with a handwritten note.'}
      role="img"
      style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh', zIndex: 9000, pointerEvents: 'none', opacity: 0 }}
    />
  )
}

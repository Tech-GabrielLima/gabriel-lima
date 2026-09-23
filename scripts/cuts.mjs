// Plays across every cut and measures the worst frame (ms) around each one.
// usage: node scripts/cuts.mjs   (with `npm run preview` running)
import puppeteer from 'puppeteer-core'
import { readFileSync } from 'node:fs'
const src = readFileSync(new URL('../src/film/chapters.ts', import.meta.url), 'utf8')
const edit = [...src.matchAll(/\['(\w+)', (\d+),/g)].map((m) => [m[1], +m[2]])
let t = 0
const cuts = edit.map(([id, d]) => ((t += d), [id, t])).slice(0, -1)
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--use-angle=vulkan', '--enable-gpu'] })
for (const [from, at] of cuts) {
  const p = await b.newPage()
  await p.setViewport({ width: 1440, height: 810 })
  // Start 25 s before the cut, like a real viewer: the next scene has had time to prefetch.
  await p.goto(`http://localhost:4173/?t=${Math.max(0.5, at - 25)}&start&debug`, { waitUntil: 'networkidle0' })
  await p.evaluate((at) => {
    window.__f = []
    let l = performance.now()
    const f = () => {
      const n = performance.now()
      const t = window.__film.getState().time
      if (t > at - 2 && t < at + 3 && !window.__warm?.getState().warming) window.__f.push(n - l)
      l = n
      requestAnimationFrame(f)
    }
    requestAnimationFrame(f)
  }, at)
  await new Promise((r) => setTimeout(r, 29000))
  const frames = await p.evaluate(() => window.__f)
  const worst = Math.max(...frames)
  const long = frames.filter((x) => x > 50).length
  console.log(`${from.padEnd(10)} → cut at ${String(at).padStart(3)}s   worst frame ${worst.toFixed(0).padStart(4)} ms   frames >50ms: ${long}`)
  await p.close()
}
await b.close()

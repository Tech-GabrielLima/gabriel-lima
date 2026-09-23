// Visits every chapter headless and reports errors and frame rate.
// usage: node scripts/smoke.mjs   (with `npm run preview` running)
import puppeteer from 'puppeteer-core'
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--use-angle=vulkan', '--enable-gpu'] })
let failed = 0
for (const [w, h] of [[1440, 810], [390, 844]])
  for (const t of [12, 35, 60, 110, 150, 185, 205, 240, 250]) {
    const p = await b.newPage()
    const errs = []
    p.on('pageerror', (e) => errs.push(e.message))
    await p.setViewport({ width: w, height: h })
    await p.goto(`http://localhost:4173/?t=${t}&start&mode=explore`, { waitUntil: 'networkidle0' })
    await new Promise((r) => setTimeout(r, 2000))
    const fps = await p.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => (performance.now() - t0 < 1500 ? (n++, requestAnimationFrame(f)) : res(Math.round(n / 1.5))); requestAnimationFrame(f) }))
    const ch = await p.evaluate(() => document.querySelector('.chapter')?.textContent)
    if (errs.length) failed++
    console.log(`${w}x${h}`.padEnd(9), String(t).padStart(4), (ch ?? '').padEnd(20), 'fps', fps, errs.length ? 'ERR ' + errs[0] : 'ok')
    await p.close()
  }
await b.close()
process.exit(failed ? 1 : 0)

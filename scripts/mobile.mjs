// Emulates a mid-range phone (touch, DPR 3, 4× CPU throttle) and records each
// chapter in watch mode: a screenshot, the frame rate, and the worst frame.
// usage: node scripts/mobile.mjs <out_dir> [base_url]
import puppeteer, { KnownDevices } from 'puppeteer-core'
const [out, base = 'http://localhost:4173'] = process.argv.slice(2)
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--use-angle=vulkan', '--enable-gpu'] })
for (const [t, name] of [[18, 'booth'], [45, 'studio'], [68, 'alley-door'], [100, 'alley-tree'], [165, 'pier'], [215, 'moon'], [238, 'credits']]) {
  const p = await b.newPage()
  await p.emulate(KnownDevices['iPhone 13'])
  const cdp = await p.createCDPSession()
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  const errs = []
  p.on('pageerror', (e) => errs.push(e.message))
  await p.goto(`${base}/?t=${t - 6}&start&lang=pt`, { waitUntil: 'networkidle0', timeout: 90000 })
  await new Promise((r) => setTimeout(r, 6000))
  const stats = await p.evaluate(() => new Promise((res) => { const f = []; let l = performance.now(); const t0 = l; const k = () => { const n = performance.now(); f.push(n - l); l = n; n - t0 < 3000 ? requestAnimationFrame(k) : res({ fps: Math.round(f.length / 3), worst: Math.round(Math.max(...f)) }) }; requestAnimationFrame(k) }))
  await p.screenshot({ path: `${out}/m_${name}.png` })
  console.log(name.padEnd(12), 'fps', stats.fps, 'worst', stats.worst, 'ms', errs[0] ?? '')
  await p.close()
}
await b.close()

import puppeteer from 'puppeteer-core'
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--use-angle=vulkan', '--enable-gpu'] })
const p = await b.newPage()
const hist = {}
p.on('console', async (m) => {
  if (!m.text().includes('Mismatch')) return
  const t = await p.evaluate(() => window.__film.getState().time.toFixed(1)).catch(() => '?')
  hist[t] = (hist[t] ?? 0) + 1
})
await p.goto('http://localhost:4173/?t=52&start&debug', { waitUntil: 'networkidle0' })
await new Promise((r) => setTimeout(r, 16000))
console.log(hist)
await b.close()

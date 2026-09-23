import puppeteer from 'puppeteer-core'
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--use-angle=vulkan', '--enable-gpu'] })
for (const t of [12, 35, 70, 160, 205, 240]) {
  const p = await b.newPage()
  let n = 0
  p.on('console', (m) => m.text().includes('Mismatch') && n++)
  await p.goto(`http://localhost:4173/?t=${t}&start&mode=explore`, { waitUntil: 'networkidle0' })
  await new Promise((r) => setTimeout(r, 3500))
  console.log(t, 'mismatch errors:', n)
  await p.close()
}
await b.close()

// Screenshots the running site with the local Chrome, for reviewing scenes.
// usage: node scripts/shot.mjs <out.png> [query] [--w=1600 --h=900 --mouse=x,y --wait=ms]
//   e.g. node scripts/shot.mjs /tmp/booth.png "t=18&start"
// Expects a server on http://localhost:4173 (npm run preview) unless --url is given.

import puppeteer from 'puppeteer-core'

const args = process.argv.slice(2)
const flag = (k, d) => args.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d
const [out, query = 'start'] = args.filter((a) => !a.startsWith('--'))
const w = Number(flag('w', 1600))
const h = Number(flag('h', 900))
const base = flag('url', 'http://localhost:4173/')

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: true,
  args: ['--use-angle=vulkan', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu', '--autoplay-policy=no-user-gesture-required'],
})
const page = await browser.newPage()
await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 })
const logs = []
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`))
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`))

await page.goto(`${base}?${query}`, { waitUntil: 'networkidle0' })
const mouse = flag('mouse')
if (mouse) {
  const [x, y] = mouse.split(',').map(Number)
  await page.mouse.move(x, y, { steps: 10 })
}
const click = flag('click')
if (click) {
  await new Promise((r) => setTimeout(r, 2500))
  const [x, y] = click.split(',').map(Number)
  await page.mouse.move(x, y, { steps: 8 })
  await new Promise((r) => setTimeout(r, 400))
  await page.mouse.click(x, y)
}
await new Promise((r) => setTimeout(r, Number(flag('wait', 2500))))

const info = await page.evaluate(() => {
  const c = document.querySelector('canvas')
  const gl = c?.getContext('webgl2')
  const dbg = gl?.getExtension('WEBGL_debug_renderer_info')
  return { renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'n/a' }
})
if (args.includes('--fps')) {
  info.fps = await page.evaluate(
    () =>
      new Promise((res) => {
        let n = 0
        const t0 = performance.now()
        const tick = () => (performance.now() - t0 < 3000 ? (n++, requestAnimationFrame(tick)) : res(Math.round(n / 3)))
        requestAnimationFrame(tick)
      }),
  )
}
await page.screenshot({ path: out })
await browser.close()
console.log(JSON.stringify(info))
for (const l of logs.filter((l) => !l.includes('THREE.WebGLRenderer: Context Lost'))) console.log(l)

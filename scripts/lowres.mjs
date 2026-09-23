// Phone variants of every model (public/models/low/*.glb): same geometry,
// textures capped at 512 px — a quarter of the video memory. The site picks
// them on the 'low' quality tier (film/quality.ts → asset()).
// usage: node scripts/lowres.mjs
import { execFileSync } from 'node:child_process'
import { mkdirSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const src = join(root, 'public/models')
const out = join(src, 'low')
mkdirSync(out, { recursive: true })
let a = 0
let b = 0
for (const f of readdirSync(src).filter((f) => f.endsWith('.glb'))) {
  execFileSync(join(root, 'node_modules/.bin/gltf-transform'), ['resize', join(src, f), join(out, f), '--width', '512', '--height', '512'], { stdio: 'ignore' })
  a += statSync(join(src, f)).size
  b += statSync(join(out, f)).size
}
console.log(`low models: ${(a / 1e6).toFixed(1)} MB → ${(b / 1e6).toFixed(1)} MB`)

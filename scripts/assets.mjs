// Downloads the Poly Haven assets listed in scripts/assets.json and writes
// web-ready versions to public/:
//   models   → public/models/<slug>.glb   (meshopt + webp, via gltf-transform)
//   textures → public/textures/<slug>/{diff,nor,rough}.jpg
//   hdris    → public/hdri/<slug>.hdr
// Raw downloads are cached in .cache/polyhaven so re-runs are cheap.
//
// usage: node scripts/assets.mjs [slug ...]   (no args = everything)

import { mkdir, readFile, writeFile, access } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { execFileSync } from 'node:child_process'

const ROOT = join(dirname(new URL(import.meta.url).pathname), '..')
const CACHE = join(ROOT, '.cache/polyhaven')
const API = 'https://api.polyhaven.com'
const UA = { 'User-Agent': 'sessao-noturna-portfolio' }
const RES = '1k'

const manifest = JSON.parse(await readFile(join(ROOT, 'scripts/assets.json'), 'utf8'))
const only = new Set(process.argv.slice(2))
const wanted = (list) => list.filter((a) => only.size === 0 || only.has(a.slug))

const exists = (p) => access(p).then(() => true, () => false)

async function download(url, dest) {
  if (await exists(dest)) return
  const res = await fetch(url, { headers: UA })
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  await mkdir(dirname(dest), { recursive: true })
  await writeFile(dest, Buffer.from(await res.arrayBuffer()))
}

async function files(slug) {
  const res = await fetch(`${API}/files/${slug}`, { headers: UA })
  if (!res.ok) throw new Error(`${res.status} files/${slug}`)
  return res.json()
}

async function model(slug, opts = {}) {
  const gltf = (await files(slug)).gltf[RES].gltf
  const dir = join(CACHE, 'models', slug)
  const src = join(dir, `${slug}.gltf`)
  await download(gltf.url, src)
  // The .gltf references its .bin and textures by relative path.
  for (const [rel, f] of Object.entries(gltf.include ?? {})) await download(f.url, join(dir, rel))

  // Baked into a scene by Blender (web: false): the raw download in .cache is all we need.
  if (opts.web === false) return
  const out = join(ROOT, 'public/models', `${slug}.glb`)
  await mkdir(dirname(out), { recursive: true })
  execFileSync(
    join(ROOT, 'node_modules/.bin/gltf-transform'),
    // `join: false` keeps separately-animated parts (e.g. a manhole cover and its frame) apart.
    ['optimize', src, out, '--compress', 'meshopt', '--texture-compress', 'webp', '--texture-size', '1024', ...(opts.join === false ? ['--join', 'false'] : []), ...(opts.simplify ? ['--simplify-ratio', String(opts.simplify), '--simplify-error', '0.01'] : [])],
    { stdio: 'inherit' },
  )
}

async function texture(slug) {
  const f = await files(slug)
  const maps = { diff: f.Diffuse, nor: f.nor_gl, rough: f.Rough }
  for (const [name, map] of Object.entries(maps)) {
    if (!map) continue
    const dest = join(ROOT, 'public/textures', slug, `${name}.jpg`)
    if (await exists(dest.replace(/\.jpg$/, '.webp'))) continue
    await download(map[RES].jpg.url, dest)
  }
}

async function hdri(slug) {
  const f = await files(slug)
  await download(f.hdri[RES].hdr.url, join(ROOT, 'public/hdri', `${slug}.hdr`))
}

for (const a of wanted(manifest.models)) { console.log('model  ', a.slug); await model(a.slug, a) }
for (const a of wanted(manifest.textures)) { console.log('texture', a.slug); await texture(a.slug) }
for (const a of wanted(manifest.hdris)) { console.log('hdri   ', a.slug); await hdri(a.slug) }
// Textures ship as WebP (scripts/webp.py converts and removes the JPGs).
if (wanted(manifest.textures).length) execFileSync('python3', [join(ROOT, 'scripts/webp.py')], { stdio: 'inherit' })
console.log('done')

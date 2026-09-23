// Prints the node tree of optimized models with world-space bounds, to plan scene layout.
// usage: node scripts/inspect.mjs public/models/<a>.glb [...]

import { NodeIO, getBounds } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { MeshoptDecoder } from 'meshoptimizer'

await MeshoptDecoder.ready
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder })
const f = (v) => v.map((x) => x.toFixed(2)).join(',')

for (const file of process.argv.slice(2)) {
  const doc = await io.read(file)
  const scene = doc.getRoot().listScenes()[0]
  const b = getBounds(scene)
  console.log(`\n# ${file.split('/').pop()}  size=${f(b.max.map((v, i) => v - b.min[i]))}  min=${f(b.min)}  max=${f(b.max)}`)
  const walk = (n, d) => {
    const nb = n.getMesh() ? getBounds(n) : null
    const tris = n.getMesh()?.listPrimitives().reduce((s, p) => s + (p.getIndices()?.getCount() ?? 0) / 3, 0)
    console.log(`${'  '.repeat(d)}- ${n.getName()}${nb ? `  [${f(nb.min)} → ${f(nb.max)}] ${tris} tris` : ''}`)
    n.listChildren().forEach((c) => walk(c, d + 1))
  }
  scene.listChildren().forEach((n) => walk(n, 0))
}

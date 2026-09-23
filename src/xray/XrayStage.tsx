import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Color, DoubleSide, Light, MeshBasicMaterial, SpotLight, Vector2, Vector3, Vector4, WebGLRenderTarget, type Texture } from 'three'
import { sfx } from '../film/audio'
import { chapterById } from '../film/chapters'
import { cursor } from '../film/cursor'
import { useCurtain } from '../film/curtain'
import { FILM_FRAGMENT } from '../film/FilmEffect'
import { filmPass } from '../film/Post'
import { useFilm } from '../film/store'
import { onLiveFrame, useLive } from '../live/live'
import liveSource from '../live/live.ts?raw'
import raftSource from '../../live/src/live/RaftCluster.java?raw'
import { C, Grid, highlight, makeAtlas, plainLine, type Line } from './grid'
import { probe } from './probe'
import { BEAMS, xrayEffect } from './XrayEffect'
import { DEEPEST, DESCENT_S, markGlitchSeen, remembered, TAP_MS, useXray } from './xray'

// Inside the canvas: everything the X-ray pass needs, every frame. The
// wireframe (a depth pre-pass so hidden lines stay hidden, then the lines, at
// half resolution), the frame's own numbers (draw calls, triangles, the GPU's
// real time where the browser exposes its clock), the pixel under the cursor,
// the light the visitor holds, the source code and the packets written into
// the cell grids, the peel eased from layer to layer — and, once per visitor,
// the projection fault in the alley.

const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches
/** Cell size in CSS pixels. */
const CELL = { w: 9, h: 17 }
/** The fault's envelope over its 1.7 s: it tears, lets go, tears again, and settles. */
function faultAt(t: number) {
  if (t < 0 || t > 1.7) return 0
  const g = t < 0.12 ? t / 0.12 : t < 0.55 ? 1 : t < 0.72 ? 0.25 : t < 1.2 ? 1 : 1 - (t - 1.2) / 0.5
  return Math.max(0, g)
}
const ALLEY = chapterById('alley')

interface Beam {
  col: number
  born: number
  text: string
}

export function XrayStage() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const u = xrayEffect.uniforms

  const kit = useMemo(() => {
    const rt = new WebGLRenderTarget(2, 2)
    const depthOnly = new MeshBasicMaterial({ colorWrite: false, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1, side: DoubleSide })
    const wire = new MeshBasicMaterial({ color: new Color('#9fe6ff'), wireframe: true, transparent: true, opacity: 0.85, depthWrite: false, fog: false })
    return { rt, depthOnly, wire, grids: [new Grid(), new Grid(), new Grid()], sources: { shader: highlight(FILM_FRAGMENT.trim()), live: highlight(liveSource), raft: highlight(raftSource) } }
  }, [])

  // The glyph atlas, once the mono face has arrived.
  useEffect(() => {
    let alive = true
    makeAtlas().then((t) => alive && (u.get('tAtlas')!.value = t))
    return () => {
      alive = false
      kit.rt.dispose()
    }
  }, [kit, u])

  // Every packet from the live server becomes a beam falling through the network layer.
  const beams = useRef<Beam[]>([])
  const rate = useRef({ n: 0, bytes: 0, at: performance.now() })
  useEffect(
    () =>
      onLiveFrame((raw) => {
        probe.packets++
        probe.lastPacket = raw.length
        rate.current.n++
        rate.current.bytes += raw.length
        const cols = kit.grids[1].cols
        if (beams.current.length >= BEAMS) beams.current.shift()
        beams.current.push({ col: 2 + Math.floor(Math.random() * Math.max(1, cols - 4)), born: performance.now(), text: raw.replace(/\s+/g, '') })
      }),
    [kit],
  )

  // GPU clock (EXT_disjoint_timer_query_webgl2): only some browsers expose it.
  const timer = useMemo(() => {
    const g2 = gl.getContext() as WebGL2RenderingContext
    const ext = g2.getExtension('EXT_disjoint_timer_query_webgl2') as null | { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number }
    const dbg = g2.getExtension('WEBGL_debug_renderer_info')
    probe.renderer = dbg ? String(g2.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : String(g2.getParameter(g2.RENDERER))
    probe.vendor = dbg ? String(g2.getParameter(dbg.UNMASKED_VENDOR_WEBGL)) : String(g2.getParameter(g2.VENDOR))
    probe.maxTexture = g2.getParameter(g2.MAX_TEXTURE_SIZE)
    probe.gpuSupported = !!ext
    return { g2, ext, active: null as WebGLQuery | null, pending: [] as WebGLQuery[] }
  }, [gl])

  const live = useRef({ active: false, uOn: 0, openedAt: 0, cpu0: 0, lastPixel: 0, lastLight: 0, lastLeader: -1, leaderAt: 0, fault: -1, faultFired: false, clock: 0 })
  const tmp = useMemo(() => ({ v: new Vector3(), px: new Uint8Array(4) }), [])

  // 1. Before anything is drawn: ease the peel, and draw the wireframe for this frame.
  useFrame((state, delta) => {
    const L = live.current
    const x = useXray.getState()
    const dt = Math.min(delta, 0.1)
    L.clock = state.clock.elapsedTime

    // The peel follows the depth asked for: one layer per DESCENT_S going down, faster coming back up.
    if (x.on && !L.active) {
      L.active = true
      L.openedAt = performance.now()
      sfx('click', 0, 0.6)
    }
    let { depth, shown } = x
    if (x.on && x.holding && performance.now() - x.holdSince > TAP_MS) {
      const next = Math.min(DEEPEST, Math.floor(shown + 1e-4) + 1)
      if (next !== depth) useXray.setState({ depth: (depth = next) })
    }
    const target = x.on ? depth : 0
    const step = (target > shown ? 1 / DESCENT_S : 2.6 / DESCENT_S) * dt
    const was = Math.floor(shown + 1e-4)
    shown = Math.abs(target - shown) <= step ? target : shown + Math.sign(target - shown) * step
    if (shown !== x.shown) useXray.setState({ shown })
    if (Math.floor(shown + 1e-4) !== was && x.on) sfx('static', 0, 0.35)
    L.uOn += ((x.on || shown > 0.01 ? 1 : 0) - L.uOn) * Math.min(1, dt * (x.on ? 9 : 5))
    if (!x.on && shown <= 0.001 && L.uOn < 0.01) L.active = false

    // The one-off projection fault, a few seconds into the alley, for anyone who hasn't found the X-ray.
    const film = useFilm.getState()
    const t = film.time
    if (!L.faultFired && L.fault < 0 && !x.on && film.started && film.playing && film.mode === 'watch' && t > ALLEY.start + 5 && t < ALLEY.start + 30 && useCurtain.getState().phase === 'open' && !remembered('glitch') && !remembered('used')) {
      L.faultFired = true
      if (REDUCED) {
        showHint()
      } else {
        L.fault = 0
        useFilm.setState({ playing: false })
        sfx('zap', 0, 0.35)
        sfx('static', 0, 0.9)
      }
    }
    let glitch = 0
    if (L.fault >= 0) {
      const before = L.fault
      L.fault += dt
      glitch = faultAt(L.fault) * (0.75 + 0.25 * Math.random())
      if (before < 0.72 && L.fault >= 0.72) sfx('static', 0.3, 0.8)
      if (L.fault > 1.7) {
        L.fault = -1
        glitch = 0
        useFilm.setState({ playing: true })
        markGlitchSeen()
        showHint()
      }
    }
    if (glitch !== x.glitch) useXray.setState({ glitch })

    const drawing = L.active || glitch > 0
    u.get('uOn')!.value = L.active ? L.uOn : 0
    u.get('uGlitch')!.value = glitch
    if (!drawing) {
      gl.info.autoReset = true
      return
    }
    u.get('uDepth')!.value = shown
    u.get('uTime')!.value = L.clock
    u.get('uEnter')!.value = Math.min(1, (performance.now() - L.openedAt) / 900)
    ;(u.get('uOrigin')!.value as Vector2).set((cursor.pos.x + 1) / 2, (cursor.pos.y + 1) / 2)
    ;(u.get('uLens')!.value as Vector3).set((cursor.target.x + 1) / 2, (cursor.target.y + 1) / 2, L.active && shown < 0.5 ? 0.085 * (1 - shown * 2) : 0)

    // The wireframe: needed while geometry (or type made of it) can be on screen, and during the fault.
    const size = gl.getDrawingBufferSize(new Vector2())
    if ((shown > 0.2 && shown < 2.2) || glitch > 0) {
      const w = Math.max(2, Math.floor(size.x / 2))
      const h = Math.max(2, Math.floor(size.y / 2))
      if (kit.rt.width !== w || kit.rt.height !== h) kit.rt.setSize(w, h)
      const bg = scene.background
      const fog = scene.fog
      const autoClear = gl.autoClear
      const shadows = gl.shadowMap.autoUpdate
      const clear = gl.getClearColor(new Color())
      const alpha = gl.getClearAlpha()
      scene.background = null
      scene.fog = null
      gl.autoClear = false
      gl.shadowMap.autoUpdate = false
      gl.setRenderTarget(kit.rt)
      gl.setClearColor(0x000000, 1)
      gl.clear()
      scene.overrideMaterial = kit.depthOnly
      gl.render(scene, camera)
      scene.overrideMaterial = kit.wire
      gl.render(scene, camera)
      scene.overrideMaterial = null
      gl.setRenderTarget(null)
      gl.setClearColor(clear, alpha)
      gl.autoClear = autoClear
      gl.shadowMap.autoUpdate = shadows
      scene.background = bg
      scene.fog = fog
      u.get('tWire')!.value = kit.rt.texture as Texture
    }

    // The cell grids, sized to the screen.
    const dpr = gl.getPixelRatio()
    const cols = Math.ceil(size.x / (CELL.w * dpr))
    const rows = Math.ceil(size.y / (CELL.h * dpr))
    ;(u.get('uGrid')!.value as Vector2).set(cols, rows)
    for (const g of kit.grids) g.resize(cols, rows)
    writeGrids(kit.grids, kit.sources, cols, rows, L)
    u.get('tCode2')!.value = kit.grids[0].tex
    u.get('tCode3')!.value = kit.grids[1].tex
    u.get('tCode4')!.value = kit.grids[2].tex

    // Measure the real frame from here: reset the counters and start the GPU clock.
    gl.info.autoReset = false
    gl.info.reset()
    L.cpu0 = performance.now()
    if (timer.ext && !timer.active && timer.pending.length < 4) {
      timer.active = timer.g2.createQuery()
      timer.g2.beginQuery(timer.ext.TIME_ELAPSED_EXT, timer.active!)
    }
  }, 0.9)

  // 2. After the composer has drawn the frame: read what it cost, and the pixel under the cursor.
  useFrame((state, delta) => {
    const L = live.current
    if (!L.active && useXray.getState().glitch <= 0) return
    probe.cpuMs = performance.now() - L.cpu0
    probe.fps += (1 / Math.max(delta, 1e-3) - probe.fps) * 0.1
    const info = gl.info
    probe.calls = info.render.calls
    probe.triangles = info.render.triangles
    probe.lines = info.render.lines
    probe.points = info.render.points
    probe.geometries = info.memory.geometries
    probe.textures = info.memory.textures
    probe.programs = info.programs?.length ?? 0
    const size = gl.getDrawingBufferSize(new Vector2())
    probe.width = size.x
    probe.height = size.y
    probe.dpr = gl.getPixelRatio()
    probe.time = state.clock.elapsedTime

    if (timer.ext && timer.active) {
      timer.g2.endQuery(timer.ext.TIME_ELAPSED_EXT)
      timer.pending.push(timer.active)
      timer.active = null
    }
    if (timer.ext && timer.pending.length) {
      const q = timer.pending[0]
      if (timer.g2.getQueryParameter(q, timer.g2.QUERY_RESULT_AVAILABLE)) {
        const disjoint = timer.g2.getParameter(timer.ext.GPU_DISJOINT_EXT)
        const ns = timer.g2.getQueryParameter(q, timer.g2.QUERY_RESULT) as number
        timer.g2.deleteQuery(q)
        timer.pending.shift()
        if (!disjoint) {
          probe.gpuMs += (ns / 1e6 - probe.gpuMs) * 0.15
          probe.gpuHistory.push(ns / 1e6)
          if (probe.gpuHistory.length > 120) probe.gpuHistory.shift()
        }
      }
    }
    xrayEffect.uniforms.get('uGpu')!.value = Math.min(1, (probe.gpuSupported ? probe.gpuMs : probe.cpuMs) / 16)

    // The pixel under the cursor, as it was actually drawn (the loupe's centre is that same pixel).
    const now = performance.now()
    if (useXray.getState().shown < 0.6 && now - L.lastPixel > 90) {
      L.lastPixel = now
      const x = Math.floor(((cursor.target.x + 1) / 2) * size.x)
      const y = Math.floor(((cursor.target.y + 1) / 2) * size.y)
      const g2 = gl.getContext()
      g2.readPixels(Math.max(0, Math.min(size.x - 1, x)), Math.max(0, Math.min(size.y - 1, y)), 1, 1, g2.RGBA, g2.UNSIGNED_BYTE, tmp.px)
      probe.rgb = [tmp.px[0], tmp.px[1], tmp.px[2]]
      probe.px = [Math.round(x / probe.dpr), Math.round((size.y - y) / probe.dpr)]
    }
    // The light the visitor holds (each scene names its cursor light).
    if (now - L.lastLight > 150) {
      L.lastLight = now
      const light = scene.getObjectByName('cursor-light') as Light | undefined
      if (light) {
        light.getWorldPosition(tmp.v)
        probe.light = {
          type: light.type,
          intensity: light.intensity,
          color: `#${light.color.getHexString()}`,
          x: tmp.v.x,
          y: tmp.v.y,
          z: tmp.v.z,
          angle: (light as SpotLight).isSpotLight ? (light as SpotLight).angle : undefined,
        }
      } else probe.light = null
    }
    const r = rate.current
    if (now - r.at > 1000) {
      probe.packetRate = (r.n * 1000) / (now - r.at)
      probe.bytesRate = (r.bytes * 1000) / (now - r.at)
      r.n = 0
      r.bytes = 0
      r.at = now
    }
  }, 2)

  /** The grids' contents for this frame: the shader with its live values, the wire with packets in it, the server. */
  function writeGrids(grids: Grid[], src: { shader: Line[]; live: Line[]; raft: Line[] }, cols: number, rows: number, L: typeof live.current) {
    const [shader, net, server] = grids
    const fx = filmPass.current?.uniforms
    const val = (k: string) => {
      const v = fx?.get(k)?.value
      return typeof v === 'number' ? v.toFixed(3) : v && 'x' in v ? `(${(v as Vector3).x.toFixed(2)}, ${(v as Vector3).y.toFixed(2)}${'z' in v ? `, ${(v as Vector3).z.toFixed(2)}` : ''})` : '—'
    }
    const l = probe.light
    const head: Line[] = [
      plainLine(`// FilmEffect · running on every pixel of this frame: ${probe.width} × ${probe.height} = ${((probe.width * probe.height) / 1e6).toFixed(2)} M, ${Math.round(probe.fps)} times a second`, C.comment, 0.9),
      plainLine(`uniform float uTime     = ${val('uTime')};`, C.live, 1),
      plainLine(`uniform float uGrain    = ${val('uGrain')};   uniform float uWeave = ${val('uWeave')};   uniform float uContrast = ${val('uContrast')};`, C.live, 1),
      plainLine(`uniform vec3  uShadow   = ${val('uShadow')};   uniform vec3 uHigh = ${val('uHigh')};`, C.live, 1),
      plainLine(l ? `// your light · ${l.type} · intensity ${l.intensity.toFixed(1)} · ${l.color} · at (${l.x.toFixed(2)}, ${l.y.toFixed(2)}, ${l.z.toFixed(2)})${l.angle !== undefined ? ` · cone ${((l.angle * 180) / Math.PI).toFixed(1)}°` : ''}` : '// your light · (none in this shot)', C.hot, 1),
      plainLine('', C.plain),
    ]
    shader.clear()
    shader.listing([...head, ...src.shader])
    shader.upload()

    // Network: the live wire's own source, dim, with each packet falling through it as its real text.
    net.clear()
    const state = useLive.getState()
    const status = state.status === 'live' ? `// live · ${probe.packetRate.toFixed(1)} packets/s · ${(probe.bytesRate / 1024).toFixed(1)} KB/s · ${probe.packets} received` : `// ${state.status} · the server sends nothing right now`
    net.listing([plainLine(status, C.hot, 1), plainLine('', C.plain), ...src.live], 0, 0.45)
    const now = performance.now()
    const speed = rows / 1.8
    const len = Math.min(rows * 0.45, 26)
    const bv = xrayEffect.uniforms.get('uBeams')!.value as Vector4[]
    beams.current = beams.current.filter((b) => (now - b.born) / 1000 * speed - len < rows)
    for (let i = 0; i < BEAMS; i++) {
      const b = beams.current[i]
      if (!b) {
        bv[i].set(0, 0, 0, 0)
        continue
      }
      const headRow = ((now - b.born) / 1000) * speed
      for (let k = 0; k < len; k++) {
        const row = Math.floor(headRow) - k
        if (row < 0 || row >= rows) continue
        const ch = b.text.charCodeAt(k % b.text.length)
        if (ch > 32 && ch < 127) net.put(b.col, row, ch, k === 0 ? C.hot : C.packet, 1 - k / len)
      }
      bv[i].set((b.col + 0.5) / cols, headRow / rows, len / rows, 1)
    }
    net.upload()

    // Server: the Java that runs the cluster, lines lighting up when the leader changes.
    server.clear()
    const s = state.state
    if (s && s.raft.leader !== L.lastLeader) {
      L.lastLeader = s.raft.leader
      L.leaderAt = now
    }
    const hot = now - L.leaderAt < 1800
    const m = s?.machine
    const serverHead: Line[] = s
      ? [
          plainLine(`// ${m!.java} · ${m!.threads} threads · heap ${m!.heapMb} MB · up ${Math.floor(m!.uptime / 3600)}h ${Math.floor((m!.uptime % 3600) / 60)}m · ${m!.requests} requests`, C.live, 1),
          plainLine(`// raft · leader N${s.raft.leader + 1} · term ${s.raft.nodes[s.raft.leader]?.term ?? '—'} · ${s.raft.rpcs} RPCs · book: ${s.book.trades} trades, ${s.book.orders} orders`, C.live, 1),
          plainLine('', C.plain),
        ]
      : [plainLine('// the server is asleep: this is the code it runs when it wakes', C.comment, 1), plainLine('', C.plain)]
    const body = src.raft.map((line) => (hot && /leader|elect|term/i.test(line.text) ? { ...line, cls: new Uint8Array(line.text.length).fill(C.hot), bright: 1 } : line))
    server.listing([...serverHead, ...body])
    server.upload()
  }

  return null
}

function showHint() {
  useXray.setState({ hint: true })
  setTimeout(() => useXray.setState({ hint: false }), 11000)
}

import { useTexture } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  LatheGeometry,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  RepeatWrapping,
  ShaderMaterial,
  Sprite,
  SpriteMaterial,
  TorusGeometry,
  Vector2,
  type Texture,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

// A lighthouse, built here rather than downloaded: a tapering plastered tower
// with a red band, a stone plinth, a gallery and its railing, a glazed lantern
// room — and inside it, a working Fresnel lens. The beam comes out of the
// lens's bullseye panels, and the lens turns: on the leader it sweeps the sea;
// on a follower it faces the leader; on a node that's down it is dark.
// Local frame: y up from the island's top, the tower on the origin.

export const LANTERN_Y = 19.7
const TOWER = { base: 1.4, top: 17.4 }
/** The tower's radius at height y: a gentle concave taper, like a real one. */
const radiusAt = (y: number) => {
  const t = (y - TOWER.base) / (TOWER.top - TOWER.base)
  return 3.05 - 1.0 * t - 0.18 * Math.sin(t * Math.PI)
}

const o = new Object3D()

function lathe(y0: number, y1: number, steps = 14) {
  const pts: Vector2[] = []
  for (let i = 0; i <= steps; i++) {
    const y = y0 + ((y1 - y0) * i) / steps
    pts.push(new Vector2(radiusAt(y), y))
  }
  return new LatheGeometry(pts, 48)
}

/** Soft round glow for the lamp, drawn once. */
function glowTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  r.addColorStop(0, 'rgba(255,244,214,1)')
  r.addColorStop(0.18, 'rgba(255,214,150,0.55)')
  r.addColorStop(0.5, 'rgba(255,170,90,0.12)')
  r.addColorStop(1, 'rgba(255,150,70,0)')
  g.fillStyle = r
  g.fillRect(0, 0, 128, 128)
  return new CanvasTexture(c)
}

/** The beam: a long open cone of light, bright at the lens, fading into the night, soft at its edges. */
function beamMaterial() {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
    fog: false,
    uniforms: { uIntensity: { value: 0 }, uColor: { value: new Color('#ffe2b0') } },
    vertexShader: /* glsl */ `
      varying float vAlong;
      varying vec3 vN;
      varying vec3 vView;
      void main() {
        vAlong = position.y;               // 0 at the lens, 1 at the far end (see the geometry)
        vec4 w = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vView = normalize(-w.xyz);
        gl_Position = projectionMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uIntensity;
      uniform vec3 uColor;
      varying float vAlong;
      varying vec3 vN;
      varying vec3 vView;
      void main() {
        float edge = pow(abs(dot(normalize(vN), normalize(vView))), 1.6);
        float fall = pow(1.0 - clamp(vAlong, 0.0, 1.0), 1.8);
        gl_FragColor = vec4(uColor * edge * fall * uIntensity * 0.55, 1.0);
      }`,
  })
}

/** A unit cone, apex at the origin, widening to radius 1 at y = 1 (the shader reads y as the distance along it). */
function beamGeometry() {
  const g = new ConeGeometry(1, 1, 40, 1, true)
  g.rotateX(Math.PI)
  g.translate(0, 0.5, 0)
  return g
}

export interface LighthouseState {
  /** 0..1: how lit the lamp is (0 = the node is down). */
  lit: { current: number }
  /** Leader: the lens sweeps and throws two long beams. */
  leader: { current: boolean }
  /** Heading of the lens (radians about y): the sweep for the leader, the leader's bearing for followers. */
  heading: { current: number }
}

interface Props extends LighthouseState {
  maps: Record<'plaster' | 'stone' | 'metal' | 'roof', Record<'map' | 'normalMap' | 'roughnessMap', Texture>>
  /** A little variety between the five. */
  seed: number
}

export function Lighthouse({ maps, seed, lit, leader, heading }: Props) {
  const lens = useRef<Group>(null!)
  const beams = useRef<Mesh[]>([])
  const glow = useRef<Sprite>(null!)
  const lampMat = useRef<MeshStandardMaterial>(null!)
  const ringMat = useRef<MeshStandardMaterial>(null!)
  const windowMat = useRef<MeshStandardMaterial>(null!)

  const kit = useMemo(() => {
    const white = new MeshStandardMaterial({ ...maps.plaster, color: new Color('#f1ece2'), roughness: 0.9 })
    const red = new MeshStandardMaterial({ ...maps.plaster, color: new Color('#9c2a1f'), roughness: 0.85 })
    const stone = new MeshStandardMaterial({ ...maps.stone, color: new Color('#b9b0a2'), roughness: 1 })
    const metal = new MeshStandardMaterial({ ...maps.metal, color: new Color('#3a1612'), metalness: 0.6, roughness: 0.55 })
    const black = new MeshStandardMaterial({ color: '#15110f', metalness: 0.7, roughness: 0.45 })
    const roofTiles = new MeshStandardMaterial({ ...maps.roof, color: new Color('#b4553f') })
    const glass = new MeshStandardMaterial({ color: '#9fb7c4', transparent: true, opacity: 0.16, roughness: 0.04, metalness: 0.1, depthWrite: false })
    for (const m of [white, red, stone, metal, roofTiles]) for (const t of [m.map, m.normalMap, m.roughnessMap]) if (t) ((t.wrapS = t.wrapT = RepeatWrapping), t.repeat.set(4, 3))
    // The lens: a beehive of glass prisms, merged into one mesh.
    const rings = mergeGeometries(
      Array.from({ length: 11 }, (_, i) => {
        const y = (i - 5) * 0.16
        const g = new TorusGeometry(0.62 - Math.abs(i - 5) * 0.045, 0.045, 8, 40)
        g.rotateX(Math.PI / 2)
        g.translate(0, y, 0)
        return g
      }),
    )
    const bullseye = mergeGeometries(
      Array.from({ length: 5 }, (_, i) => {
        return new TorusGeometry(0.12 + i * 0.1, 0.03, 6, 32)
      }),
    )
    return {
      white, red, stone, metal, black, roofTiles, glass, rings, bullseye,
      glowTex: glowTexture(),
      beamGeo: beamGeometry(),
      beamMat: beamMaterial(),
    }
  }, [maps])

  // Instanced details: gallery posts, lantern mullions, corbels, stair windows, cottage windows.
  const posts = useRef<InstancedMesh>(null!)
  const mullions = useRef<InstancedMesh>(null!)
  const corbels = useRef<InstancedMesh>(null!)
  const windows = useRef<InstancedMesh>(null!)
  useLayoutEffect(() => {
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2
      o.position.set(Math.cos(a) * 2.85, TOWER.top + 0.75, Math.sin(a) * 2.85)
      o.rotation.set(0, 0, 0)
      o.scale.set(1, 1, 1)
      o.updateMatrix()
      posts.current.setMatrixAt(i, o.matrix)
    }
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2
      o.position.set(Math.cos(a) * 1.72, LANTERN_Y, Math.sin(a) * 1.72)
      o.rotation.set(0, -a, 0)
      o.updateMatrix()
      mullions.current.setMatrixAt(i, o.matrix)
    }
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2
      o.position.set(Math.cos(a) * 2.25, TOWER.top - 0.35, Math.sin(a) * 2.25)
      o.rotation.set(0, -a, 0)
      o.updateMatrix()
      corbels.current.setMatrixAt(i, o.matrix)
    }
    // The staircase's little windows spiral up the tower.
    for (let i = 0; i < 6; i++) {
      const y = 3.2 + i * 2.2
      const a = seed + i * 1.9
      const r = radiusAt(y) + 0.02
      o.position.set(Math.cos(a) * r, y, Math.sin(a) * r)
      o.rotation.set(0, -a + Math.PI / 2, 0)
      o.updateMatrix()
      windows.current.setMatrixAt(i, o.matrix)
    }
    for (const m of [posts, mullions, corbels, windows]) m.current.instanceMatrix.needsUpdate = true
  }, [seed])

  useFrame((state, dt) => {
    const l = lit.current
    const lead = leader.current
    lens.current.rotation.y = heading.current
    // The lamp breathes a little; the leader's is the brightest thing on the sea.
    const flicker = 0.94 + 0.06 * Math.sin(state.clock.elapsedTime * 13 + seed * 7)
    lampMat.current.emissiveIntensity = l * (lead ? 22 : 7) * flicker
    ringMat.current.emissiveIntensity = l * (lead ? 1.8 : 0.7)
    windowMat.current.emissiveIntensity = 0.25 + l * 1.4
    glow.current.scale.setScalar(l * (lead ? 14 : 6) * flicker + 0.001)
    ;(glow.current.material as SpriteMaterial).opacity = l
    const want = lead ? 1 : 0.16
    const u = kit.beamMat.uniforms.uIntensity
    u.value += (l * want - u.value) * Math.min(1, dt * 4)
    beams.current.forEach((b, i) => (b.visible = u.value > 0.01 && (i === 0 || lead)))
  })

  return (
    <group>
      {/* Plinth, tower (white, red band, white), door. */}
      <mesh material={kit.stone} position={[0, 0.7, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[3.5, 3.8, 1.4, 40]} />
      </mesh>
      <mesh geometry={useMemo(() => lathe(TOWER.base, 11), [])} material={kit.white} castShadow receiveShadow />
      <mesh geometry={useMemo(() => lathe(11, 13.6, 4), [])} material={kit.red} castShadow />
      <mesh geometry={useMemo(() => lathe(13.6, TOWER.top, 6), [])} material={kit.white} castShadow />
      <mesh material={kit.black} position={[0, 2.35, radiusAt(2.3) - 0.05]}>
        <boxGeometry args={[1.1, 1.9, 0.2]} />
      </mesh>
      <instancedMesh ref={windows} args={[new BoxGeometry(0.34, 0.62, 0.12), undefined, 6]}>
        <meshStandardMaterial ref={windowMat} color="#0c0806" emissive="#ffb36b" emissiveIntensity={0.4} />
      </instancedMesh>

      {/* The gallery: corbels, deck, railing. */}
      <instancedMesh ref={corbels} args={[new BoxGeometry(0.22, 0.6, 0.7), kit.metal, 20]} />
      <mesh material={kit.metal} position={[0, TOWER.top + 0.12, 0]} castShadow>
        <cylinderGeometry args={[3.05, 2.4, 0.26, 40]} />
      </mesh>
      <instancedMesh ref={posts} args={[new CylinderGeometry(0.03, 0.03, 1.1, 5), kit.black, 28]} />
      <mesh material={kit.black} position={[0, TOWER.top + 1.3, 0]} rotation-x={Math.PI / 2}>
        <torusGeometry args={[2.85, 0.045, 6, 64]} />
      </mesh>

      {/* The lantern room: its low wall, the glazing and its mullions, the roof, the vent and the rod. */}
      <mesh material={kit.metal} position={[0, TOWER.top + 0.7, 0]}>
        <cylinderGeometry args={[1.8, 1.8, 0.9, 32]} />
      </mesh>
      <mesh material={kit.glass} position={[0, LANTERN_Y, 0]} renderOrder={2}>
        <cylinderGeometry args={[1.72, 1.72, 2.5, 32, 1, true]} />
      </mesh>
      <instancedMesh ref={mullions} args={[new BoxGeometry(0.06, 2.5, 0.06), kit.black, 10]} />
      <mesh material={kit.metal} position={[0, LANTERN_Y + 1.25 + 0.8, 0]} castShadow>
        <coneGeometry args={[2.05, 1.6, 32]} />
      </mesh>
      <mesh material={kit.black} position={[0, LANTERN_Y + 3.0, 0]}>
        <sphereGeometry args={[0.28, 16, 12]} />
      </mesh>
      <mesh material={kit.black} position={[0, LANTERN_Y + 3.8, 0]}>
        <cylinderGeometry args={[0.025, 0.025, 1.4, 5]} />
      </mesh>

      {/* The Fresnel lens, the lamp inside it, its two bullseyes, and the beams they throw. */}
      <group ref={lens} position={[0, LANTERN_Y, 0]}>
        <mesh geometry={kit.rings}>
          <meshStandardMaterial ref={ringMat} color="#c9d8dc" emissive="#ffc37a" emissiveIntensity={0.5} roughness={0.08} metalness={0.2} transparent opacity={0.75} />
        </mesh>
        <mesh>
          <sphereGeometry args={[0.2, 16, 12]} />
          <meshStandardMaterial ref={lampMat} color="#000" emissive="#fff1d6" emissiveIntensity={5} toneMapped={false} />
        </mesh>
        {[-1, 1].map((s) => (
          <mesh key={s} geometry={kit.bullseye} position={[s * 0.66, 0, 0]} rotation-y={Math.PI / 2}>
            <meshStandardMaterial color="#d6e4e8" emissive="#ffd29a" emissiveIntensity={1.2} roughness={0.05} transparent opacity={0.8} />
          </mesh>
        ))}
        {[0, 1].map((i) => (
          <mesh
            key={i}
            ref={(m) => void (beams.current[i] = m!)}
            geometry={kit.beamGeo}
            material={kit.beamMat}
            // Out of each bullseye, along ±x; the geometry's along-axis is y.
            rotation-z={i === 0 ? -Math.PI / 2 : Math.PI / 2}
            scale={[9, 80, 9]}
            frustumCulled={false}
            renderOrder={3}
          />
        ))}
      </group>
      <sprite ref={glow} position={[0, LANTERN_Y, 0]} renderOrder={4}>
        <spriteMaterial map={kit.glowTex} blending={AdditiveBlending} depthWrite={false} transparent fog={false} />
      </sprite>

      {/* The keeper's cottage at its foot, its windows lit. */}
      <group position={[5.6, 0, 2.2]} rotation-y={0.35 + seed}>
        <mesh material={kit.white} position={[0, 1.5, 0]} castShadow receiveShadow>
          <boxGeometry args={[5, 3, 3.6]} />
        </mesh>
        <mesh material={kit.roofTiles} position={[0, 3.55, 0]} rotation-z={Math.PI / 4} castShadow>
          <boxGeometry args={[2.9, 2.9, 3.9]} />
        </mesh>
        <mesh material={kit.stone} position={[1.6, 4.2, 0.8]}>
          <boxGeometry args={[0.6, 1.6, 0.6]} />
        </mesh>
        {[-1.3, 1.3].map((x) => (
          <mesh key={x} position={[x, 1.6, 1.81]}>
            <planeGeometry args={[0.8, 1]} />
            <meshStandardMaterial color="#0c0806" emissive="#ffb36b" emissiveIntensity={1.1} />
          </mesh>
        ))}
      </group>
    </group>
  )
}

/** The four texture sets the lighthouses share (Poly Haven, CC0). */
export function useLighthouseMaps() {
  const tex = (slug: string) => ({ map: `/textures/${slug}/diff.webp`, normalMap: `/textures/${slug}/nor.webp`, roughnessMap: `/textures/${slug}/rough.webp` })
  const plaster = useTexture(tex('white_rough_plaster'))
  const stone = useTexture(tex('plastered_stone_wall'))
  const metal = useTexture(tex('rusty_painted_metal'))
  const roof = useTexture(tex('red_slate_roof_tiles_01'))
  return useMemo(() => ({ plaster, stone, metal, roof }), [plaster, stone, metal, roof])
}


import { Text } from '@react-three/drei'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { useMemo, useRef, type ReactNode } from 'react'
import { Box3, CanvasTexture, DoubleSide, Group, Mesh, Object3D, Vector3 } from 'three'
import type { Project } from '../../content/projects'
import { panFor, sfx } from '../../film/audio'
import { FONT_MARKER, FONT_MONO } from '../shared'
import { OPENING, doorAnchor } from './layout'

/** How far the shutter is raised in each state (fraction of the opening). */
export const LIFT = { closed: 0, peek: 0.14, open: 0.93 }

interface Props {
  project: Project
  /** The rollershutter_door mesh from the Poly Haven model, cloned per door. */
  shutter: Object3D
  /** Target lift, 0..1; the shutter eases towards it. */
  lift: number
  onHover(on: boolean): void
  onOpen(): void
  /** The installation that lives behind this door. */
  children?: ReactNode
}

const ROOM_DEPTH = 2.6
const tmpV = new Vector3()

/** Soft pool of light: bright at the door's edge, fading out into the alley and to the sides. */
const spill = (() => {
  const c = document.createElement('canvas')
  c.width = 64
  c.height = 64
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(32, 0, 0, 32, 0, 64)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.35, 'rgba(255,255,255,0.45)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 64, 64)
  return new CanvasTexture(c)
})()

/**
 * One project door: a roller shutter in the wall opening, the tag sprayed on
 * it, and a small room behind it that holds the project's installation.
 * Local frame: x along the wall, +z out into the alley, y up from the ground.
 */
export function Shutter({ project, shutter, lift, onHover, onOpen, children }: Props) {
  const a = doorAnchor(project.id)
  const { w, h } = project.featured ? OPENING.large : OPENING.small
  const roll = useRef<Group>(null!)
  const glow = useRef<Mesh>(null!)
  const cur = useRef(0)
  const lastLift = useRef(0)
  const camera = useThree((st) => st.camera)

  // The clone keeps its node transform (it carries the mesh's dequantization);
  // a wrapper re-centres it: x centred, bottom at y=0, front face at z=0.
  const body = useMemo(() => {
    const o = shutter.clone()
    o.traverse((m) => ((m as Mesh).isMesh ? ((m.castShadow = true), (m.receiveShadow = true)) : null))
    o.updateMatrixWorld(true)
    const box = new Box3().setFromObject(o)
    const size = box.getSize(new Vector3())
    const wrap = new Group()
    wrap.add(o)
    o.position.x -= (box.min.x + box.max.x) / 2
    o.position.y -= box.min.y
    o.position.z -= box.max.z
    wrap.userData.size = size
    return wrap
  }, [shutter])

  useFrame((_, delta) => {
    // Steel rattles whenever the shutter is sent up or down.
    if (Math.abs(lift - lastLift.current) > 0.05) {
      roll.current.getWorldPosition(tmpV)
      const loud = Math.abs(lift - lastLift.current) > 0.4 ? 1 : 0.45
      sfx(lift > lastLift.current ? 'shutter' : 'shutterDown', panFor(tmpV, camera), loud)
      lastLift.current = lift
    }
    // Heavy steel: slow to start, a little faster to fall.
    const k = 1 - Math.exp(-delta * (lift > cur.current ? 2.2 : 3.2))
    cur.current += (lift - cur.current) * k
    const s = 1 - cur.current
    roll.current.scale.y = Math.max(0.04, s)
    roll.current.position.y = h * (1 - Math.max(0.04, s))
    // The light under the door grows with the gap.
    ;(glow.current.material as { opacity: number }).opacity = Math.min(1, cur.current * 5) * 0.35
  })

  const over = (on: boolean) => (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    document.body.style.cursor = on ? 'pointer' : ''
    onHover(on)
  }

  return (
    <group position={a.pos} rotation-y={(a.yaw * Math.PI) / 180}>
      {/* The shutter itself: model is 1.08 × 2.4 m, stretched to the opening. */}
      <group
        ref={roll}
        onPointerOver={over(true)}
        onPointerOut={over(false)}
        onClick={(e) => {
          e.stopPropagation()
          onOpen()
        }}
      >
        <group position={[0, 0, 0.02]} scale={[w / body.userData.size.x, h / body.userData.size.y, 1]}>
          <primitive object={body} />
        </group>
        <Text
          font={FONT_MARKER}
          fontSize={project.tag.length > 6 ? 0.3 : 0.42}
          position={[0, 1.2, 0.035]}
          rotation-z={0.05}
          anchorX="center"
          anchorY="middle"
          maxWidth={w * 0.95}
        >
          {project.tag}
          <meshStandardMaterial color={project.light} roughness={0.8} emissive={project.light} emissiveIntensity={0.04} />
        </Text>
      </group>

      {/* Light spilling out of the room through the gap under the shutter. */}
      <mesh ref={glow} position={[0, 0.006, 0.9]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[w * 1.8, 1.8]} />
        <meshBasicMaterial color={project.light} alphaMap={spill} transparent opacity={0} depthWrite={false} toneMapped={false} />
      </mesh>

      {/* The room behind the opening (open front, seen through the wall's hole). */}
      {/* Five double-sided walls, so it also blocks the view through neighbouring windows. */}
      <group position={[0, 0, -ROOM_DEPTH / 2]}>
        {(
          [
            [[0, h / 2, -ROOM_DEPTH / 2], [0, 0, 0], [w, h]],
            [[-w / 2, h / 2, 0], [0, Math.PI / 2, 0], [ROOM_DEPTH, h]],
            [[w / 2, h / 2, 0], [0, -Math.PI / 2, 0], [ROOM_DEPTH, h]],
            [[0, h, 0], [Math.PI / 2, 0, 0], [w, ROOM_DEPTH]],
            [[0, 0.001, 0], [-Math.PI / 2, 0, 0], [w, ROOM_DEPTH]],
          ] as const
        ).map(([p, r, s], i) => (
          <mesh key={i} position={p as never} rotation={r as never} receiveShadow>
            <planeGeometry args={s as never} />
            <meshStandardMaterial color="#1d1e22" roughness={0.9} side={DoubleSide} />
          </mesh>
        ))}
        <group position={[0, 0, -ROOM_DEPTH / 2 + 0.02]}>{children}</group>
      </group>

      {/* The stat, in neon, over the lintel: legible even with the shutter down. */}
      <Text
        font={FONT_MONO}
        fontSize={0.075}
        letterSpacing={0.18}
        position={[0, h + 0.12, 0.02]}
        anchorX="center"
        maxWidth={2.8}
      >
        {project.title.toUpperCase()}
        <meshStandardMaterial color="#000" emissive={project.light} emissiveIntensity={1.6} toneMapped={false} />
      </Text>
    </group>
  )
}

export { ROOM_DEPTH }

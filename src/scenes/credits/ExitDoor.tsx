import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { Group, MathUtils, MeshStandardMaterial, PointLight } from 'three'

// The exit (ROTEIRO §0.1): a double door under the green SAÍDA sign, by the
// phone. The house lights are on behind it; a line of that light leaks under
// the leaves. Opened, it leads out of the film to Act III. Local frame: on the
// wall, +z into the room, x along the wall.

const DOOR = { w: 1.3, h: 2.15 }

const LEATHER = '#3f1813'
const BRASS = '#b8904f'

export function ExitDoor({ open, lit, onOpen, onHover }: { open: { current: number }; lit: { current: number }; onOpen(): void; onHover(on: boolean): void }) {
  const left = useRef<Group>(null!)
  const right = useRef<Group>(null!)
  const glow = useRef<MeshStandardMaterial>(null!)
  const gap = useRef<MeshStandardMaterial>(null!)
  const spill = useRef<PointLight>(null!)
  const half = DOOR.w / 2
  // Both portholes share one material, so the foyer's light comes up in both.
  const windows = useMemo(() => new MeshStandardMaterial({ color: '#2a1a0e', emissive: '#ffb36b', emissiveIntensity: 0.12, toneMapped: false }), [])

  useFrame(() => {
    // Leaves swing into the room (the wall is behind them).
    const a = MathUtils.smootherstep(open.current, 0, 1) * 1.75
    left.current.rotation.y = -a
    right.current.rotation.y = a
    const l = lit.current
    gap.current.emissiveIntensity = 0.6 + l * 1.6
    windows.emissiveIntensity = 0.12 + l * 0.35
    // Closed, only a thread of it shows between the leaves; open, the doorway is all light.
    glow.current.emissiveIntensity = 0.15 + open.current * 24
    spill.current.intensity = l * 0.6 + open.current * 14
  })

  const leaf = (side: -1 | 1) => (
    // Hinged on its outer edge: the group sits on the hinge, the leaf extends towards the middle.
    <group ref={side < 0 ? left : right} position={[side * half, 0, 0.02]}>
      <mesh position={[-side * (half / 2), DOOR.h / 2, 0.03]} castShadow>
        <boxGeometry args={[half - 0.01, DOOR.h - 0.02, 0.05]} />
        <meshStandardMaterial color={LEATHER} roughness={0.75} />
      </mesh>
      {/* Porthole, lit from the foyer behind. */}
      <mesh position={[-side * (half / 2), DOOR.h * 0.72, 0.06]} material={windows}>
        <circleGeometry args={[0.1, 20]} />
      </mesh>
      <mesh position={[-side * (half / 2), DOOR.h * 0.72, 0.058]}>
        <ringGeometry args={[0.1, 0.125, 24]} />
        <meshStandardMaterial color={BRASS} metalness={0.8} roughness={0.35} />
      </mesh>
      {/* Push bar. */}
      <mesh position={[-side * (half / 2), DOOR.h * 0.46, 0.09]} rotation-z={Math.PI / 2}>
        <cylinderGeometry args={[0.018, 0.018, half * 0.72, 10]} />
        <meshStandardMaterial color={BRASS} metalness={0.8} roughness={0.3} />
      </mesh>
    </group>
  )

  return (
    <group
      onClick={(e) => {
        e.stopPropagation()
        onOpen()
      }}
      onPointerOver={(e) => (e.stopPropagation(), onHover(true))}
      onPointerOut={() => onHover(false)}
    >
      {/* The frame. */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (half + 0.05), DOOR.h / 2, 0.03]}>
          <boxGeometry args={[0.1, DOOR.h + 0.1, 0.08]} />
          <meshStandardMaterial color="#1a0d0a" roughness={0.8} />
        </mesh>
      ))}
      <mesh position={[0, DOOR.h + 0.05, 0.03]}>
        <boxGeometry args={[DOOR.w + 0.2, 0.1, 0.08]} />
        <meshStandardMaterial color="#1a0d0a" roughness={0.8} />
      </mesh>
      {/* The foyer beyond: bright, with its lights up. */}
      <mesh position={[0, DOOR.h / 2, 0.005]}>
        <planeGeometry args={[DOOR.w, DOOR.h]} />
        <meshStandardMaterial ref={glow} color="#000" emissive="#ffd9a8" emissiveIntensity={2} toneMapped={false} />
      </mesh>
      {/* The line of light under the door. */}
      <mesh position={[0, 0.012, 0.1]}>
        <boxGeometry args={[DOOR.w * 0.94, 0.012, 0.06]} />
        <meshStandardMaterial ref={gap} color="#000" emissive="#ffc98a" emissiveIntensity={1.5} toneMapped={false} />
      </mesh>
      {leaf(-1)}
      {leaf(1)}
      {/* Invisible, generous hit box so the whole doorway is clickable. */}
      <mesh position={[0, DOOR.h / 2, 0.15]} visible={false}>
        <boxGeometry args={[DOOR.w + 0.2, DOOR.h + 0.1, 0.3]} />
      </mesh>
      <pointLight ref={spill} color="#ffc98a" intensity={0} distance={7} decay={2} position={[0, 1.1, 0.6]} />
    </group>
  )
}

import { Text } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useRef, useState } from 'react'
import type { MeshStandardMaterial, PointLight } from 'three'
import { sitAtComputer } from '../../gl1/ui'
import { FONT_MONO } from '../shared'

// The projectionist's computer (ROTEIRO §0.4.5): a beige CRT on the film cans,
// its phosphor the only light in that corner. Click it and GL-OS is yours.

export function Computer({ position, rotation = 0 }: { position: [number, number, number]; rotation?: number }) {
  const screen = useRef<MeshStandardMaterial>(null!)
  const glow = useRef<PointLight>(null!)
  const [hover, setHover] = useState(false)
  useFrame(({ clock }) => {
    // A cursor blinking on a screen nobody's looking at, and the phosphor's slow breath.
    const t = clock.elapsedTime
    const k = 0.42 + 0.06 * Math.sin(t * 1.7) + (hover ? 0.35 : 0)
    screen.current.emissiveIntensity = k
    glow.current.intensity = 0.6 * k
  })
  return (
    <group
      position={position}
      rotation-y={rotation}
      onClick={(e) => {
        e.stopPropagation()
        sitAtComputer()
      }}
      onPointerOver={(e) => {
        e.stopPropagation()
        setHover(true)
        document.body.style.cursor = 'pointer'
      }}
      onPointerOut={() => {
        setHover(false)
        document.body.style.cursor = ''
      }}
    >
      {/* the tube's case */}
      <mesh position={[0, 0.2, -0.04]} castShadow>
        <boxGeometry args={[0.46, 0.4, 0.42]} />
        <meshStandardMaterial color="#c9bea6" roughness={0.75} />
      </mesh>
      {/* its back, narrower */}
      <mesh position={[0, 0.2, -0.3]} castShadow>
        <boxGeometry args={[0.3, 0.28, 0.16]} />
        <meshStandardMaterial color="#b3a88f" roughness={0.8} />
      </mesh>
      {/* the glass */}
      <mesh position={[0, 0.215, 0.172]}>
        <planeGeometry args={[0.34, 0.26]} />
        <meshStandardMaterial ref={screen} color="#050806" emissive="#2a6a48" emissiveIntensity={0.45} roughness={0.2} />
      </mesh>
      <Text font={FONT_MONO} fontSize={0.022} color="#b8f5cf" anchorX="left" anchorY="top" position={[-0.155, 0.33, 0.175]} maxWidth={0.31}>
        {'GL-1 BIOS v1.0\nGL-OS 0.1 · kernel ok\n\nvisitante@cabine:~$ _'}
      </Text>
      {/* the keyboard */}
      <mesh position={[0, 0.015, 0.28]} rotation-x={0.08} castShadow>
        <boxGeometry args={[0.42, 0.03, 0.15]} />
        <meshStandardMaterial color="#d6ccb4" roughness={0.8} />
      </mesh>
      <pointLight ref={glow} position={[0, 0.22, 0.35]} color="#6fe0a0" distance={1.6} decay={2} />
    </group>
  )
}

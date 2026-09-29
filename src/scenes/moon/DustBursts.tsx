import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { AdditiveBlending, BufferAttribute, BufferGeometry, Points, Vector3 } from 'three'

const N = 240

/**
 * Regolith kicked up where a rock lands: grains fly out in a low dome and fall
 * back slowly under 1.62 m/s², with no air to hold them. `burst` is called by
 * the scene; everything else is a tiny CPU particle system in one draw call.
 */
export function useDustBursts() {
  const points = useRef<Points>(null!)
  const state = useMemo(
    () => ({ p: Array.from({ length: N }, () => new Vector3(0, -9, 0)), v: Array.from({ length: N }, () => new Vector3()), life: new Float32Array(N), next: 0 }),
    [],
  )
  const geometry = useMemo(() => {
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array(N * 3), 3))
    g.setAttribute('color', new BufferAttribute(new Float32Array(N * 3), 3))
    return g
  }, [])

  const burst = (at: Vector3, strength: number) => {
    const k = Math.round(30 + strength * 30)
    for (let i = 0; i < k; i++) {
      const j = state.next++ % N
      const a = Math.random() * Math.PI * 2
      const s = (0.4 + Math.random()) * strength
      state.p[j].copy(at).setY(0.03)
      state.v[j].set(Math.cos(a) * s, (0.3 + Math.random() * 0.9) * strength, Math.sin(a) * s)
      state.life[j] = 2.5 + Math.random() * 1.5
    }
  }

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05)
    const P = geometry.getAttribute('position') as BufferAttribute
    const C = geometry.getAttribute('color') as BufferAttribute
    for (let i = 0; i < N; i++) {
      if (state.life[i] > 0) {
        state.life[i] -= dt
        state.v[i].y -= 1.62 * dt
        state.p[i].addScaledVector(state.v[i], dt)
        if (state.p[i].y < 0.01) {
          state.p[i].y = 0.01
          state.v[i].set(0, 0, 0)
        }
      }
      const a = Math.max(0, Math.min(1, state.life[i] / 1.2)) * 0.5
      P.setXYZ(i, state.p[i].x, state.p[i].y, state.p[i].z)
      C.setXYZ(i, a, a * 0.97, a * 0.93)
    }
    P.needsUpdate = true
    C.needsUpdate = true
  })

  const node = (
    <points ref={points} geometry={geometry} frustumCulled={false}>
      <pointsMaterial size={0.035} vertexColors transparent blending={AdditiveBlending} depthWrite={false} sizeAttenuation />
    </points>
  )
  return { node, burst }
}

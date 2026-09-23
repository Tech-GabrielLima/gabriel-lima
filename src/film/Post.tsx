import { useFrame } from '@react-three/fiber'
import { Bloom, EffectComposer } from '@react-three/postprocessing'
import { useMemo } from 'react'
import { Vector3 } from 'three'
import { chapterAt, chapterById, type ChapterId } from './chapters'
import { useCurtain } from './curtain'
import { FilmEffect } from './FilmEffect'
import { xrayEffect } from '../xray/XrayEffect'
import { useFilm } from './store'
import { useWarm } from './warm'
import { useQ } from './quality'

/** Cuts that burn through the film instead of flashing (ROTEIRO: moon → credits). */
const BURN_CUT = chapterById('credits').start
const BURN = 1.5

/** The burn grows over the last seconds before its cut, then the new reel starts clean. */
function burnAt(time: number) {
  if (time > BURN_CUT || time < BURN_CUT - BURN) return 0
  return (time - (BURN_CUT - BURN)) / BURN
}

/** Per-chapter grade (ROTEIRO §1): shadow tint, highlight tint, contrast. */
const GRADE: Record<ChapterId, [number[], number[], number]> = {
  countdown: [[0.4, 0.3, 0.2], [1.03, 1.0, 0.94], 1.05],
  booth: [[0.45, 0.3, 0.15], [1.04, 1.0, 0.92], 1.06],
  studio: [[0.15, 0.3, 0.7], [1.0, 1.0, 1.02], 1.04],
  alley: [[0.1, 0.45, 0.6], [1.05, 0.99, 0.92], 1.08],
  crossing: [[0.1, 0.25, 0.65], [0.98, 1.0, 1.04], 1.04],
  moon: [[0.2, 0.2, 0.3], [1.0, 1.0, 1.0], 1.14],
  credits: [[0.5, 0.15, 0.12], [1.04, 0.98, 0.94], 1.05],
}
const tmpShadow = new Vector3()
const tmpHigh = new Vector3()

/** The film pass in use, for the X-ray to read its live uniforms. */
export const filmPass: { current: FilmEffect | null } = { current: null }

export function Post() {
  const film = useMemo(() => (filmPass.current = new FilmEffect()), [])
  const reduced = useMemo(() => matchMedia('(prefers-reduced-motion: reduce)').matches, [])

  useFrame((state) => {
    film.uniforms.get('uTime')!.value = state.clock.elapsedTime
    const time = useFilm.getState().time
    // The curtain covers cuts (ui/Curtain.tsx). The flash only bridges a scrub in explore mode, while the
    // curtain is still coming down over an empty stage, and never shows once it's closed.
    const f = film.uniforms.get('uFlash')!
    const closed = useCurtain.getState().phase === 'closed'
    const want = useWarm.getState().warming && useFilm.getState().started && !closed ? 1 : 0
    f.value = want > f.value ? want : f.value + (want - f.value) * 0.35
    film.uniforms.get('uBurn')!.value = burnAt(time)
    film.uniforms.get('uWeave')!.value = reduced ? 0 : 0.5
    film.uniforms.get('uDirt')!.value = reduced ? 0 : 1
    // Ease towards the current chapter's grade, so cuts don't pop.
    const [sh, hi, co] = GRADE[chapterAt(time).id]
    ;(film.uniforms.get('uShadow')!.value as Vector3).lerp(tmpShadow.fromArray(sh), 0.05)
    ;(film.uniforms.get('uHigh')!.value as Vector3).lerp(tmpHigh.fromArray(hi), 0.05)
    const c = film.uniforms.get('uContrast')!
    c.value += (co - c.value) * 0.05
  })

  const lowBloom = useQ(false, true)
  return (
    <EffectComposer multisampling={0}>
      <Bloom mipmapBlur levels={lowBloom ? 4 : 8} intensity={0.8} luminanceThreshold={0.85} luminanceSmoothing={0.2} />
      <primitive object={film} />
      {/* Under the film, the site's own stack (xray/): the X-ray, and the projection fault that reveals it. */}
      <primitive object={xrayEffect} />
    </EffectComposer>
  )
}

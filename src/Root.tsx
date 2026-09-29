import { Suspense, lazy, useCallback, useEffect, useState } from 'react'
import { Lobby } from './lobby/Lobby'
import { SKIP_LOBBY, usePreload, type Act } from './lobby/preload'
import { wakeLive } from './live/live'
import { CinemaOverlay } from './cinema/Overlay'
import { startCinema } from './cinema/progress'
import { watchTab } from './cinema/tab'
import { usePartIIKeys } from './lobby/keys'
import { PrintSheet } from './lobby/partII'
import { useWorld } from './gl1/world'
import { startRecording } from './finale/record'
import { useFinale } from './finale/state'

// The night at the cinema (ROTEIRO §0.1). Act I, the lobby, is plain DOM and
// paints at once; Act II, the film, arrives as a separate chunk and mounts
// underneath while the visitor reads, so a door opens onto a warm film;
// Act III, the lights up, is 2D again and shows the projects running live.
// The visitor can walk between them in any order, all night.

const Film = lazy(() => import('./App'))
const Exit = lazy(() => import('./exit/Exit'))
const TerminalPage = lazy(() => import('./gl1/TerminalPage'))
const DrostePage = lazy(() => import('./exit/Droste'))
const Cabin0Room = lazy(() => import('./finale/Cabin0Room'))
/** ?droste=N: a level of the site opened inside itself (Act III's navigator). */
const DROSTE = new URLSearchParams(location.search).has('droste')
/** ?terminal=cabine|caixa|maquinas opens a GL-1 terminal on its own. */
const TERMINAL = new URLSearchParams(location.search).has('terminal')

/** How long a 2D act stays on screen after its door opens, while its light washes out. */
const DOOR_OUT_MS = 1800

export function Root() {
  // The live server may be asleep (free plan): start waking it now, while the visitor is still in the lobby.
  useEffect(wakeLive, [])
  // Part II's spine (ROTEIRO §0.4.3): the visitor's ticket and the log of lost frames, in every act.
  useEffect(() => {
    startCinema()
    watchTab()
    // The visit's black box, replayed in Cabin 0 (kept in this browser only).
    startRecording()
  }, [])
  usePartIIKeys()
  // GL-OS writes to the world (ROTEIRO §0.4.5): /cinema/luz, and what rm -rf / does to the house.
  const lights = useWorld((s) => s.lights)
  const collapse = useWorld((s) => s.collapse)
  useEffect(() => void document.body.classList.toggle('lights-off', !lights), [lights])
  useEffect(() => {
    if (!collapse) return
    document.body.classList.add('collapse')
    const t = setTimeout(() => document.body.classList.remove('collapse'), 3200)
    return () => clearTimeout(t)
  }, [collapse])
  const cabin0 = useFinale((s) => s.open)
  const act = usePreload((s) => s.act)
  // The film is fetched once either 2D act asks for it (after its opening has played).
  const [wantFilm, setWantFilm] = useState(SKIP_LOBBY)
  const want = useCallback(() => setWantFilm(true), [])
  // The 2D act on screen. Walking into the film, it lingers for the door's light; between 2D acts it swaps at once.
  const [shown, setShown] = useState<Act>(act)
  useEffect(() => {
    if (act !== 'film') return setShown(act)
    const t = setTimeout(() => setShown('film'), DOOR_OUT_MS)
    return () => clearTimeout(t)
  }, [act])

  if (DROSTE)
    return (
      <Suspense fallback={null}>
        <DrostePage />
      </Suspense>
    )
  if (TERMINAL)
    return (
      <Suspense fallback={null}>
        <TerminalPage />
        <CinemaOverlay />
      </Suspense>
    )
  return (
    <>
      {wantFilm && (
        <Suspense fallback={null}>
          <Film />
        </Suspense>
      )}
      {shown === 'lobby' && <Lobby onWantFilm={want} />}
      {shown === 'exit' && (
        <Suspense fallback={null}>
          <Exit onWantFilm={want} />
        </Suspense>
      )}
      {cabin0 && (
        <Suspense fallback={null}>
          <Cabin0Room />
        </Suspense>
      )}
      <CinemaOverlay />
      <PrintSheet />
    </>
  )
}

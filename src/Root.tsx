import { Suspense, lazy, useCallback, useEffect, useState } from 'react'
import { Lobby } from './lobby/Lobby'
import { SKIP_LOBBY, usePreload, type Act } from './lobby/preload'
import { wakeLive } from './live/live'

// The night at the cinema (ROTEIRO §0.1). Act I, the lobby, is plain DOM and
// paints at once; Act II, the film, arrives as a separate chunk and mounts
// underneath while the visitor reads, so a door opens onto a warm film;
// Act III, the lights up, is 2D again and shows the projects running live.
// The visitor can walk between them in any order, all night.

const Film = lazy(() => import('./App'))
const Exit = lazy(() => import('./exit/Exit'))

/** How long a 2D act stays on screen after its door opens, while its light washes out. */
const DOOR_OUT_MS = 1800

export function Root() {
  // The live server may be asleep (free plan): start waking it now, while the visitor is still in the lobby.
  useEffect(wakeLive, [])
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
    </>
  )
}

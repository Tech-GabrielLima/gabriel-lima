import { useProgress } from '@react-three/drei'
import { useEffect, useState } from 'react'
import { CHAPTERS, chapterAt, chapterById, type ChapterId } from '../film/chapters'
import { sfx } from '../film/audio'
import { useCurtain } from '../film/curtain'
import { useRoom } from '../film/room'
import { useFilm } from '../film/store'
import { useWarm } from '../film/warm'

// The house curtain (film/curtain.ts). In watch mode it comes down just before
// each cut, while the scene's own transition plays out, and stays down until
// the next scene has downloaded, compiled and drawn a few frames behind it.
// Scrubbing or jumping chapters brings it down too, faster. On it, a silent-film
// intertitle: which chapter is coming, and what the light does in it.

/** Seconds before a cut the curtain starts coming down (it's down just before the cut). */
const LEAD = 0.85
const CLOSE_MS = 700
const CLOSE_FAST_MS = 320
const OPEN_MS = 1000
/** Down at least this long in watch mode, so the card can be read; explore mode only waits for the scene. */
const MIN_DOWN_MS = 2200
const MIN_DOWN_FAST_MS = 450
/** After the scene reports ready: a few more frames for shadow maps and first-use buffers. */
const SETTLE_MS = 280

/** Cuts where the scene actually changes (the countdown and the booth share one). */
const CUTS = CHAPTERS.filter((c) => c.id !== 'countdown' && c.id !== 'booth').map((c) => c.start)
const nextCut = (t: number) => CUTS.find((c) => c > t)

const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches

type Card = { title: string; line: string; light: string }

const CARDS: Record<'en' | 'pt', Partial<Record<ChapterId, Card>>> = {
  en: {
    booth: { title: 'The Booth', line: 'Every night, an 8mm projector switches itself on.', light: 'The beam follows your cursor.' },
    studio: { title: 'The Studio · About me', line: '3 a.m., rain on the window.', light: 'The desk lamp follows your hand; whatever it lights wakes up.' },
    alley: { title: 'The Alley · Projects', line: 'Eight doors, eight projects. Three of them run live.', light: 'Your torch lifts the shutters. Click to walk in.' },
    crossing: { title: 'The Crossing · Journey', line: 'A pier out to sea: every lantern is a year.', light: 'Carry the flame past the lanterns to light them.' },
    moon: { title: 'Sea of Tranquility · Skills', line: 'On the Moon, the Sun is the only light.', light: 'You are the Sun: move the shadows, throw the rocks.' },
    credits: { title: 'Credits · Contact', line: 'Every role, the same name.', light: 'When the phone rings, answer it.' },
  },
  pt: {
    booth: { title: 'A Cabine', line: 'Toda noite, um projetor 8mm liga sozinho.', light: 'O feixe segue o seu cursor.' },
    studio: { title: 'O Estúdio · Sobre mim', line: '3 da manhã, chuva na janela.', light: 'A luminária segue a sua mão; o que ela ilumina acorda.' },
    alley: { title: 'O Beco · Projetos', line: 'Oito portas, oito projetos. Três deles rodam ao vivo.', light: 'Sua lanterna levanta as portas. Clique para entrar.' },
    crossing: { title: 'A Travessia · Trajetória', line: 'Um píer mar adentro: cada lampião é um ano.', light: 'Leve a chama até os lampiões para acendê-los.' },
    moon: { title: 'Mar da Tranquilidade · Habilidades', line: 'Na Lua, o Sol é a única luz.', light: 'Você é o Sol: mova as sombras, arremesse as rochas.' },
    credits: { title: 'Créditos · Contato', line: 'Todos os cargos, o mesmo nome.', light: 'Quando o telefone tocar, atenda.' },
  },
}

/** Cards for the rooms behind the alley's doors (film/room.ts), and for walking back out. */
const ROOM_CARDS: Record<'en' | 'pt', Record<string, Card & { n: string }>> = {
  en: {
    flight: { n: 'Room · 01', title: 'The Black Box · flight', line: 'An investigation hangar at night, and the black box a Python program left when it died.', light: 'Replay the crash, ask why, then prove the fix.' },
    hale: { n: 'Room · 02', title: 'The Cathedral · hale', line: 'A language’s compiler as stained glass: seven windows, one per stage of its pipeline.', light: 'Compile the program, then run it: one request at a time, or in waves.' },
    raft: { n: 'Room · 03', title: 'The Archipelago · raft-kv-store', line: 'Five lighthouses, five real nodes of a Raft cluster, running on the server now.', light: 'Drag to look around. Click a lighthouse to take that node down.' },
    match: { n: 'Room · 04', title: 'The Trading Floor · lowlatency-matching-engine', line: 'The order book of a real matching engine, running on the server now, as a city at night.', light: 'Every lit floor is a lot in the queue. Buy, sell, or click a tower to join it.' },
    ledger: { n: 'Room · 05', title: 'The Vault · event-sourced-ledger', line: 'A double-entry ledger in a bank vault: every cent accounted for, SYSTEM included.', light: 'Run the thousand-transfer test, replay a key, break a transfer halfway.' },
    nabla: { n: 'Room · 06', title: 'The Network · nabla + nano-llm', line: 'nabla’s own MLP, running in your browser: every activation on the way in, every gradient on the way back.', light: 'Draw a digit. Then tell it what it was, and watch it learn.' },
    cuda: { n: 'Room · 07', title: 'The Silicon · cuda-kernels-from-scratch', line: 'Inside a GPU die: C = A × B, computed five ways, each one fixing the last one’s bottleneck.', light: 'Pick a GEMM version and watch the chip work the way it does.' },
    obras: { n: 'Room · 08', title: 'Under Construction · next session', line: 'A building site at night that is also a film set: the next session, being shot.', light: 'Call “Action!” and the crane sets the next floor.' },
    back: { n: '03', title: 'Back to the alley', line: 'The door is still open behind you.', light: 'Your torch lifts the shutters.' },
  },
  pt: {
    flight: { n: 'Sala · 01', title: 'A Caixa-Preta · flight', line: 'Um hangar de investigação à noite, e a caixa-preta que um programa Python deixou ao morrer.', light: 'Reproduza o crash, pergunte por quê, depois prove a correção.' },
    hale: { n: 'Sala · 02', title: 'A Catedral · hale', line: 'O compilador de uma linguagem em vitrais: sete janelas, uma por estágio do pipeline.', light: 'Compile o programa e depois rode: uma requisição por vez, ou em ondas.' },
    raft: { n: 'Sala · 03', title: 'O Arquipélago · raft-kv-store', line: 'Cinco faróis, cinco nós reais de um cluster Raft, rodando agora no servidor.', light: 'Arraste para olhar em volta. Clique num farol para derrubar aquele nó.' },
    match: { n: 'Sala · 04', title: 'O Pregão · lowlatency-matching-engine', line: 'O livro de ofertas de um engine de matching real, rodando agora no servidor, como uma cidade à noite.', light: 'Cada andar aceso é um lote na fila. Compre, venda, ou clique num prédio para entrar nela.' },
    ledger: { n: 'Sala · 05', title: 'O Cofre · event-sourced-ledger', line: 'Um razão de partidas dobradas num cofre de banco: cada centavo contado, SYSTEM incluído.', light: 'Rode o teste das mil transferências, repita uma chave, quebre uma transferência no meio.' },
    nabla: { n: 'Sala · 06', title: 'A Rede · nabla + nano-llm', line: 'O MLP do próprio nabla, rodando no seu navegador: cada ativação na ida, cada gradiente na volta.', light: 'Desenhe um dígito. Depois diga qual era, e veja a rede aprender.' },
    cuda: { n: 'Sala · 07', title: 'O Silício · cuda-kernels-from-scratch', line: 'Dentro de um die de GPU: C = A × B, calculado de cinco jeitos, cada um atacando o gargalo do anterior.', light: 'Escolha uma versão do GEMM e veja o chip trabalhar do jeito dela.' },
    obras: { n: 'Sala · 08', title: 'Em Obras · próxima sessão', line: 'Um canteiro de obras à noite que também é set de filmagem: a próxima sessão, sendo rodada.', light: 'Chame “Ação!” e a grua assenta o próximo andar.' },
    back: { n: '03', title: 'De volta ao beco', line: 'A porta continua aberta atrás de você.', light: 'Sua lanterna levanta as portas.' },
  },
}
let lastRoom: string | null = useRoom.getState().room
/** What the curtain announces: a room (or the way back out of one), else the chapter. */
let roomCard: string | null = lastRoom

/** The curtain's state machine, run every animation frame (it only reads the film, the warm-up and the clock). */
function useCurtainDirector() {
  useEffect(() => {
    let raf = 0
    let since = performance.now()
    let fast = false
    let pendingCut: number | null = null
    let readyAt = 0
    const set = useCurtain.setState

    const tick = () => {
      raf = requestAnimationFrame(tick)
      const now = performance.now()
      const film = useFilm.getState()
      const warming = useWarm.getState().warming
      const { phase } = useCurtain.getState()
      if (!film.started) return

      const cut = nextCut(film.time)
      const approaching = film.mode === 'watch' && film.playing && cut !== undefined && cut - film.time < LEAD

      if (phase === 'open' || phase === 'opening') {
        // Watch mode: down ahead of the cut. Otherwise (a scrub, a jump): down as soon as a scene starts loading.
        if (approaching || warming) {
          // Walking into (or out of) a room reads like a cut: its card gets its reading time.
          const room = useRoom.getState().room
          roomCard = room !== lastRoom ? (room ?? 'back') : room
          fast = !approaching && room === lastRoom
          lastRoom = room
          pendingCut = approaching ? cut! : null
          readyAt = 0
          since = now
          set({ phase: 'closing', chapter: chapterAt(approaching ? cut! : film.time).id, hold: warming, ready: false })
          sfx('curtain', 0, 0.8)
        }
        if (phase === 'opening' && now - since > OPEN_MS) set({ phase: 'open', chapter: null })
        return
      }

      if (phase === 'closing') {
        // Past the cut with the curtain not yet down: wait for it.
        const pastCut = pendingCut === null || film.time >= pendingCut
        if (pastCut && !useCurtain.getState().hold) set({ hold: true })
        if (now - since > (fast ? CLOSE_FAST_MS : CLOSE_MS)) {
          since = now
          set({ phase: 'closed' })
        }
        return
      }

      // Closed. In watch mode, first let the film reach the cut (the scene swaps behind the curtain).
      // Never hold short of the cut itself: the scene only swaps once the clock crosses it.
      if (pendingCut !== null && film.time < pendingCut && !warming) {
        set({ hold: false })
        return
      }
      if (!useCurtain.getState().hold) set({ hold: true })
      // Still scrubbing behind a closed curtain: the card follows the chapter being set up.
      const here = chapterAt(film.time).id
      if (pendingCut === null && here !== useCurtain.getState().chapter) set({ chapter: here })
      // The scene behind must be the one announced, loaded and compiled; then a few frames, and the card its reading time.
      if (warming || here !== useCurtain.getState().chapter) {
        readyAt = 0
        if (useCurtain.getState().ready) set({ ready: false })
        return
      }
      readyAt ||= now
      const settled = now - readyAt > SETTLE_MS
      if (settled && !useCurtain.getState().ready) set({ ready: true })
      const read = now - since > (fast ? MIN_DOWN_FAST_MS : MIN_DOWN_MS)
      if (settled && (read || skip.current)) {
        skip.current = false
        since = now
        // The clock runs again as the curtain rises: the scene is already moving when it's revealed.
        set({ phase: 'opening', hold: false })
        sfx('curtain', 0, 0.55)
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])
}

/** Set by a click on the curtain: rise as soon as the scene is ready, without waiting for the card's reading time. */
const skip = { current: false }

export function Curtain() {
  useCurtainDirector()
  const phase = useCurtain((s) => s.phase)
  const chapter = useCurtain((s) => s.chapter)
  const lang = useFilm((s) => s.lang)
  const warming = useWarm((s) => s.warming)
  const ready = useCurtain((s) => s.ready)
  const { progress, active } = useProgress()
  // Keep the last card while the curtain rises, so its text doesn't vanish mid-air.
  const [shown, setShown] = useState<ChapterId | null>(null)
  useEffect(() => {
    if (chapter) setShown(chapter)
  }, [chapter])

  // The curtain hangs inside the picture, down to the player (taller than the letterbox bar on phones).
  const [floor, setFloor] = useState<number | null>(null)
  useEffect(() => {
    const player = document.querySelector('.player')
    if (!player) return
    const measure = () => setFloor(Math.max(0, innerHeight - player.getBoundingClientRect().top))
    const ro = new ResizeObserver(measure)
    ro.observe(player)
    addEventListener('resize', measure)
    measure()
    return () => {
      ro.disconnect()
      removeEventListener('resize', measure)
    }
  }, [])

  const rc = roomCard && phase !== 'open' ? ROOM_CARDS[lang][roomCard] : undefined
  const card = rc ?? (shown ? CARDS[lang][shown] : undefined)
  const ch = shown ? chapterById(shown) : null
  const down = phase === 'closing' || phase === 'closed'
  // The hem's light is the real wait: the download, then the compile, then ready.
  const loaded = active ? progress / 100 : 1
  // Before the swap, then loading, then compiling, then ready.
  const fill = ready ? 1 : warming ? 0.12 + loaded * 0.73 : 0.06
  const pt = lang === 'pt'
  const status = ready
    ? pt
      ? 'pronto · clique para abrir'
      : 'ready · click to open'
    : !warming
      ? pt
        ? 'trocando o rolo'
        : 'changing reels'
      : active && progress < 100
        ? `${pt ? 'carregando a cena' : 'loading the scene'} · ${Math.round(progress)}%`
        : pt
          ? 'preparando a luz'
          : 'setting the lights'

  return (
    <div
      className={`curtain ${phase}${REDUCED ? ' reduced' : ''}`}
      aria-hidden={!down}
      onClick={() => (skip.current = true)}
      style={{ ...(floor !== null && { bottom: `max(var(--bar), ${floor}px)` }), '--fill': fill, '--close-ms': `${phase === 'closing' && !warming ? CLOSE_MS : CLOSE_FAST_MS}ms`, '--open-ms': `${OPEN_MS}ms` } as React.CSSProperties}
    >
      <div className="curtain-drape">
        <div className="curtain-folds" />
        <div className="curtain-fringe" />
        {card && ch && (
          <div className="intertitle" aria-live="polite">
            <p className="it-n">{rc ? rc.n : ch.n}</p>
            <p className="it-title">{card.title}</p>
            <p className="it-line">{card.line}</p>
            <p className="it-light">
              <span aria-hidden>✦</span> {card.light}
            </p>
          </div>
        )}
        <div className="curtain-hem" />
        <p className="curtain-status">{status}</p>
      </div>
    </div>
  )
}

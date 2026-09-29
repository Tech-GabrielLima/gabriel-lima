import { useEffect, useRef, useState } from 'react'
import { FRAME_COUNT } from '../cinema/frames'
import { addFilmFrame, fetchCertificate, fetchCompletions, fetchFilm, fetchNotes, fetchStubs, leaveNote, useProgress, type Certificate, type FilmFrame } from '../cinema/progress'
import { WORDS_EN, WORDS_PT } from '../cinema/vocab'
import { CONTACT } from '../content/contact'
import { playSample } from '../film/sound'
import { useFilm } from '../film/store'
import { goLobby } from '../lobby/preload'
import { closeCabin0, setCommentary, useFinale } from './state'
import { recording, timePerAct, type Recording } from './record'
import { at, drawCollective, drawFrame, loadPictures } from './replay'
import './finale.css'

// Cabin 0 (ROTEIRO §0.4.8): the room behind the door the visitor saw first.
// The reader reads the ticket's 48 holes as bits, a stair goes up into the
// projection booth: the chair is empty, the projector is running, and what it
// projects is the visitor's own night. Then: the video of it, a frame in the
// collective film, the signed ticket, a note for the next one, the letter,
// and the last line of the projector's log.

const LETTER = {
  pt: [
    'Oi.',
    'Se você está lendo isto, encontrou os 48 fotogramas. Quer dizer que ficou: acendeu a luz onde ninguém mandava, abriu o terminal, leu o log, quebrou o projetor e consertou.',
    'Eu construí este cinema para alguém que olha de perto. Tudo aqui roda de verdade porque eu não sei fazer de outro jeito: quando a ferramenta não existe, eu escrevo a ferramenta; quando o computador não existe, eu desenho o processador.',
    'A pergunta do começo tinha resposta. Ninguém liga o projetor. Quem liga é quem entra. Esta noite, foi você.',
    'Se quiser conversar sobre um projeto, uma vaga, ou sobre por que a GL-1 dividia por zero na troca de rolo, me escreva com o código abaixo. Quem chegou até aqui eu respondo primeiro.',
    'Eu não apenas construo. Eu imagino.',
  ],
  en: [
    'Hi.',
    "If you're reading this, you found all 48 frames. It means you stayed: you lit the light where nobody told you to, opened the terminal, read the log, broke the projector and fixed it.",
    "I built this cinema for someone who looks closely. Everything here really runs because I don't know how to do it any other way: when the tool doesn't exist, I write the tool; when the computer doesn't exist, I design the processor.",
    "The question from the start had an answer. Nobody switches the projector on. Whoever walks in does. Tonight, it was you.",
    'If you want to talk about a project, a job, or why the GL-1 divided by zero at the reel change, write to me with the code below. Whoever made it this far, I answer first.',
    "I don't just build. I imagine.",
  ],
}

const fmt = (ms: number) => `${Math.floor(ms / 60000)} min ${String(Math.floor(ms / 1000) % 60).padStart(2, '0')} s`

/** The replay: the recording, fast-forwarded to ~45 s, on a canvas (and recordable to a video). */
function Replay({ rec, pt, onPick }: { rec: Recording; pt: boolean; onPick: (f: FilmFrame) => void }) {
  const cv = useRef<HTMLCanvasElement>(null)
  const [f, setF] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [video, setVideo] = useState<{ url: string; ext: string } | null>(null)
  const [recordingVideo, setRecordingVideo] = useState(false)
  const pos = useRef(0)
  useEffect(() => {
    let raf = 0
    let last = performance.now()
    const g = cv.current!.getContext('2d')!
    const tick = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      if (playing) {
        pos.current = Math.min(1, pos.current + dt / 45)
        if (pos.current >= 1) setPlaying(false)
      }
      const { s, note } = at(rec, pos.current)
      drawFrame(g, 960, 540, s, now / 1000, {
        title: note?.text,
        caption: `${pt ? 'sua sessão' : 'your session'} · ${fmt(s.t)} · ${s.act === 1 ? (pt ? 'a fachada' : 'the lobby') : s.act === 2 ? (pt ? 'o filme' : 'the film') : pt ? 'luzes acesas' : 'lights up'}`,
      })
      setF(pos.current)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [rec, pt, playing])

  // The film of the night as a video file: the canvas, recorded in the browser.
  const download = () => {
    const c = cv.current!
    const stream = c.captureStream(30)
    const mime = ['video/mp4;codecs=avc1', 'video/webm;codecs=vp9', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m)) ?? 'video/webm'
    const mr = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4_000_000 })
    const chunks: Blob[] = []
    mr.ondataavailable = (e) => chunks.push(e.data)
    mr.onstop = () => {
      setVideo({ url: URL.createObjectURL(new Blob(chunks, { type: mime.split(';')[0] })), ext: mime.includes('mp4') ? 'mp4' : 'webm' })
      setRecordingVideo(false)
    }
    pos.current = 0
    setPlaying(true)
    setRecordingVideo(true)
    mr.start(500)
    setTimeout(() => mr.stop(), 45_500)
  }

  const pick = () => {
    const { s } = at(rec, pos.current)
    onPick({ act: s.act, t: s.ft, x: s.x, y: s.y, c: Math.floor(Math.random() * 8) })
  }

  return (
    <div className="c0-replay">
      <canvas ref={cv} width={960} height={540} className="c0-canvas" />
      <input
        type="range"
        min={0}
        max={1000}
        value={Math.round(f * 1000)}
        onChange={(e) => {
          pos.current = Number(e.target.value) / 1000
          setPlaying(false)
        }}
        aria-label={pt ? 'posição no replay' : 'replay position'}
      />
      <div className="c0-row">
        <button onClick={() => ((pos.current = pos.current >= 1 ? 0 : pos.current), setPlaying((p) => !p))}>{playing ? '❚❚' : '▶'}</button>
        <button onClick={pick}>{pt ? '✦ Este instante é o meu fotograma' : '✦ This instant is my frame'}</button>
        <button disabled={recordingVideo} onClick={download}>
          {recordingVideo ? (pt ? 'gravando o vídeo… (45 s)' : 'recording the video… (45 s)') : pt ? '⬇ Baixar a sessão em vídeo' : '⬇ Download the session as video'}
        </button>
        {video && (
          <a className="c0-link" href={video.url} download={`sessao-noturna-${useProgress.getState().ticket?.n ?? 'voce'}.${video.ext}`}>
            {pt ? 'o arquivo está pronto' : 'the file is ready'}
          </a>
        )}
      </div>
    </div>
  )
}

/** The collective film: one frame per person who finished, projected. */
function Collective({ frames, pt }: { frames: { n: number; frame: FilmFrame }[]; pt: boolean }) {
  const cv = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (!frames.length) return
    let raf = 0
    const g = cv.current!.getContext('2d')!
    // A frame each 1/24 s once it's a long film; slower while it's short, so each face is seen.
    const per = frames.length >= 48 ? 1 / 24 : 0.6
    const tick = (now: number) => {
      const i = Math.floor(now / 1000 / per) % frames.length
      drawCollective(g, 640, 360, frames[i].frame, frames[i].n, now / 1000, pt)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [frames, pt])
  return (
    <div className="c0-collective">
      {frames.length ? <canvas ref={cv} width={640} height={360} className="c0-canvas" /> : <p className="c0-dim">{pt ? 'O filme coletivo ainda não tem nenhum fotograma.' : 'The collective film has no frames yet.'}</p>}
      <p className="c0-dim">
        {pt ? `um filme de ${frames.length} ${frames.length === 1 ? 'pessoa' : 'pessoas'} · ${(frames.length / 24).toFixed(2)} s a 24 fps` : `a film by ${frames.length} ${frames.length === 1 ? 'person' : 'people'} · ${(frames.length / 24).toFixed(2)} s at 24 fps`}
      </p>
    </div>
  )
}

export default function Cabin0Room() {
  const open = useFinale((s) => s.open)
  const preview = useFinale((s) => s.preview)
  const lang = useFilm((s) => s.lang)
  const pt = lang === 'pt'
  const ticket = useProgress((s) => s.ticket)
  const [stage, setStage] = useState(0)
  const [bits, setBits] = useState(0)
  const [rec] = useState(() => recording())
  const [cert, setCert] = useState<Certificate | null>(null)
  const [frames, setFrames] = useState<{ n: number; frame: FilmFrame }[]>([])
  const [mine, setMine] = useState<string | null>(null)
  const [avg, setAvg] = useState<number | null>(null)
  const [arrived, setArrived] = useState<number | null>(null)
  const [notes, setNotes] = useState<{ n: number; text: string }[]>([])
  const [words, setWords] = useState<string[]>([])
  const [left, setLeft] = useState<string | null>(null)

  // The reader reads the ticket: 48 holes, one bit at a time.
  useEffect(() => {
    if (!open) return
    void loadPictures()
    setStage(0)
    setBits(0)
    let i = 0
    const t = setInterval(() => {
      i++
      setBits(i)
      if (i % 6 === 0) void playSample('sfx-click', 0, 0.3, 1.6)
      if (i >= FRAME_COUNT) {
        clearInterval(t)
        void playSample('sfx-door', 0, 0.7)
        setTimeout(() => setStage(1), 900)
      }
    }, 55)
    return () => clearInterval(t)
  }, [open])

  useEffect(() => {
    if (!open) return
    if (preview) {
      setCert({ claim: 'preview', explorer: ticket?.n ?? 0, completion: 0, ms: 0, frames: 48, sig: 'preview', code: 'PREVIEW0', alg: 'HMAC-SHA256' })
      return
    }
    void fetchCertificate().then(setCert)
    void fetchFilm().then((r) => setFrames(r?.frames ?? []))
    void fetchCompletions().then((r) => setAvg(r?.avg_ms ?? null))
    void fetchStubs().then((r) => setArrived(r?.last[0]?.n ?? null))
    void fetchNotes().then((r) => setNotes(r?.notes ?? []))
  }, [open, preview, ticket?.n])

  if (!open) return null
  const per = timePerAct(rec)
  const total = per[1] + per[2] + per[3]
  const code = cert?.code ?? '········'
  const next = (arrived ?? ticket?.n ?? 0) + 1

  const pick = async (f: FilmFrame) => {
    if (preview) return setMine(pt ? 'guardado (prévia: não vai ao servidor)' : 'kept (preview: not sent)')
    const r = await addFilmFrame(f)
    setMine(r ? (pt ? `você é o fotograma ${r.frame} do filme coletivo` : `you're frame ${r.frame} of the collective film`) : pt ? 'o seu fotograma já está no filme' : 'your frame is already in the film')
    void fetchFilm().then((x) => setFrames(x?.frames ?? []))
  }
  const certFile = () => URL.createObjectURL(new Blob([JSON.stringify(cert, null, 2)], { type: 'application/json' }))

  return (
    <div className="c0" role="dialog" aria-modal="true" aria-label={pt ? 'Cabine 0' : 'Cabin 0'}>
      <button className="c0-close" onClick={closeCabin0} aria-label={pt ? 'Sair da cabine' : 'Leave the cabin'}>
        ×
      </button>
      {preview && <p className="c0-preview">{pt ? 'PRÉVIA · dados de teste, nada vai ao servidor' : 'PREVIEW · test data, nothing reaches the server'}</p>}

      <section className="c0-reader">
        <p className="c0-kicker">{pt ? 'Cabine 0 · a leitora' : 'Cabin 0 · the reader'}</p>
        <div className="c0-bits" aria-hidden>
          {Array.from({ length: FRAME_COUNT }, (_, i) => (
            <span key={i} className={i < bits ? 'on' : ''}>
              {i < bits ? '1' : '·'}
            </span>
          ))}
        </div>
        <p className="c0-status">{stage === 0 ? (pt ? 'lendo o cartão perfurado…' : 'reading the punched card…') : pt ? 'ACESSO LIBERADO' : 'ACCESS GRANTED'}</p>
      </section>

      {stage >= 1 && (
        <>
          <section>
            <p className="c0-kicker">{pt ? 'A cabine de projeção' : 'The projection booth'}</p>
            <h2>{pt ? 'A cadeira está vazia. O projetor está ligado.' : 'The chair is empty. The projector is running.'}</h2>
            <p className="c0-lead">{pt ? 'O filme que ele projeta é a sua noite.' : 'The film it projects is your night.'}</p>
            <Replay rec={rec} pt={pt} onPick={pick} />
            {mine && <p className="c0-dim">{mine}</p>}
            <p className="c0-dim">
              {pt
                ? `${fmt(total)} no total · fachada ${fmt(per[1])} · filme ${fmt(per[2])} · luzes acesas ${fmt(per[3])}${avg ? ` · quem terminou levou em média ${fmt(avg)}` : ''}. Gravado só neste navegador, como uma caixa-preta: cada coisa que você fez foi um evento.`
                : `${fmt(total)} in all · lobby ${fmt(per[1])} · film ${fmt(per[2])} · lights up ${fmt(per[3])}${avg ? ` · those who finished took ${fmt(avg)} on average` : ''}. Recorded in this browser only, like a black box: everything you did was an event.`}
            </p>
          </section>

          <section>
            <p className="c0-kicker">{pt ? 'O filme coletivo' : 'The collective film'}</p>
            <Collective frames={frames} pt={pt} />
          </section>

          <section>
            <p className="c0-kicker">{pt ? 'O ingresso assinado' : 'The signed ticket'}</p>
            <p className="c0-code">{code}</p>
            <p className="c0-dim">
              {cert && !preview
                ? pt
                  ? `explorer #${cert.explorer} · conclusão #${cert.completion} · ${fmt(cert.ms)} · 48/48 · assinado pelo servidor do cinema (${cert.alg})`
                  : `explorer #${cert.explorer} · completion #${cert.completion} · ${fmt(cert.ms)} · 48/48 · signed by the cinema's server (${cert.alg})`
                : pt
                  ? 'o servidor assina o ingresso de quem terminou'
                  : "the server signs the ticket of whoever finishes"}
            </p>
            {cert && (
              <a className="c0-link" href={certFile()} download={`ingresso-${cert.explorer}.json`}>
                ⬇ {pt ? 'Baixar o ingresso assinado' : 'Download the signed ticket'}
              </a>
            )}
            <p className="c0-dim">
              {pt ? 'Abra um pull request adicionando-o como explorers/N.json em ' : 'Open a pull request adding it as explorers/N.json at '}
              <a href="https://github.com/Tech-GabrielLima/hall-of-explorers">github.com/Tech-GabrielLima/hall-of-explorers</a>
              {pt ? ': a assinatura é verificada e o seu nome entra no hall.' : ': the signature is checked and your name goes into the hall.'}
            </p>
          </section>

          <section>
            <p className="c0-kicker">{pt ? 'A janela para o lobby' : 'The window onto the lobby'}</p>
            <p className="c0-lead">{arrived ? (pt ? `Alguém acabou de chegar: #${arrived}.` : `Someone just arrived: #${arrived}.`) : pt ? 'Pela janelinha, o lobby.' : 'Through the little window, the lobby.'}</p>
            <p className="c0-dim">{pt ? 'Deixe um bilhete para quem vem depois (só com as palavras da casa, até quatro):' : 'Leave a note for whoever comes next (only the house words, up to four):'}</p>
            <div className="c0-words">
              {(pt ? WORDS_PT : WORDS_EN).map((w) => (
                <button key={w} className={words.includes(w) ? 'on' : ''} disabled={!!left || (!words.includes(w) && words.length >= 4)} onClick={() => setWords((ws) => (ws.includes(w) ? ws.filter((x) => x !== w) : [...ws, w]))}>
                  {w}
                </button>
              ))}
            </div>
            <div className="c0-row">
              <button
                disabled={!words.length || !!left}
                onClick={async () => {
                  if (preview) return setLeft(words.join(' · '))
                  const r = await leaveNote(words)
                  setLeft(r?.note ?? null)
                }}
              >
                {left ? `✓ ${left}` : pt ? 'Deixar o bilhete' : 'Leave the note'}
              </button>
            </div>
            {notes.length > 0 && (
              <ul className="c0-notes">
                {notes.slice(0, 8).map((n) => (
                  <li key={n.n}>
                    <b>#{n.n}</b> {n.text}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="c0-letter">
            <p className="c0-kicker">{pt ? 'Uma carta' : 'A letter'}</p>
            {LETTER[pt ? 'pt' : 'en'].map((p, i) => (
              <p key={i}>{p}</p>
            ))}
            <p className="c0-sign">— Gabriel</p>
            <p className="c0-dim">
              <a href={`mailto:${CONTACT.email}?subject=${encodeURIComponent(`Cabine 0 · ${code}`)}`}>{CONTACT.email}</a> · {pt ? 'código' : 'code'} <b>{code}</b>
            </p>
          </section>

          <section className="c0-after">
            <p className="c0-kicker">{pt ? 'Depois do fim' : 'After the end'}</p>
            <p className="c0-dim">{pt ? 'A próxima sessão pode ser comentada: o diretor por cima do filme, e as 12 descobertas técnicas, cada uma no momento dela.' : 'The next showing can have commentary: the director over the film, and the 12 technical discoveries, each at its moment.'}</p>
            <div className="c0-row">
              <button
                onClick={() => {
                  setCommentary(true)
                  closeCabin0()
                  goLobby('door')
                }}
              >
                ▶ {pt ? 'Sessão Comentada' : 'Commentary Session'}
              </button>
            </div>
          </section>

          <section className="c0-log">
            <p>[{new Date().toLocaleString('sv-SE', { timeZone: 'America/Recife' }).slice(0, 19)}] {pt ? `sessão #${next} iniciada · operador: explorer #${ticket?.n ?? '?'}` : `session #${next} started · operator: explorer #${ticket?.n ?? '?'}`}</p>
          </section>
        </>
      )}
    </div>
  )
}

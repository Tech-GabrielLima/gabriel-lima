import { useFilm } from '../film/store'
import { usePreload } from '../lobby/preload'
import { setCommentary, useFinale } from './state'
import './commentary.css'

// The Commentary Session (ROTEIRO §0.4.8, after the end): the director over
// the film, like the commentary track on a DVD, and the 12 technical
// discoveries, each at the moment of the film it's about. It only exists
// after Cabin 0 (or with ?comentada), for people who already know the house.

interface Line {
  /** Film time (s) it starts at; it stays up for `dur` seconds. */
  t: number
  dur?: number
  /** A discovery (1..12), or the director talking. */
  d?: number
  en: string
  pt: string
}

const TRACK: Line[] = [
  { t: 1, en: 'Everything you’re watching is rendered live, in your browser. There is no video file. There never was.', pt: 'Tudo o que você está vendo é renderizado ao vivo, no seu navegador. Não existe arquivo de vídeo. Nunca existiu.' },
  { t: 10, d: 1, en: 'The projector obeys controle.py, running in Pyodide. Set FPS = 12 in the booth and the film really drops to 12 frames a second.', pt: 'O projetor obedece o controle.py, rodando no Pyodide. Ponha FPS = 12 na cabine e o filme cai mesmo para 12 quadros por segundo.' },
  { t: 20, d: 2, en: 'The booth’s computer is a GL-1: an 8-bit CPU I designed, emulated in Rust compiled to WebAssembly, booting GL-OS, written in its assembly.', pt: 'O computador da cabine é uma GL-1: uma CPU de 8 bits que eu projetei, emulada em Rust compilado para WebAssembly, bootando o GL-OS, escrito no assembly dela.' },
  { t: 33, d: 3, en: 'The rain on the glass is a fragment shader: every drop bends the picture behind it, every frame.', pt: 'A chuva no vidro é um fragment shader: cada gota entorta a imagem de trás, a cada quadro.' },
  { t: 46, d: 4, en: 'Hold R. The X-ray peels this frame in six layers, down to the GPU’s own clock (EXT_disjoint_timer_query, where your browser has it).', pt: 'Segure R. O Raio-X descasca este quadro em seis camadas, até o relógio da própria GPU (EXT_disjoint_timer_query, onde o seu navegador tem).' },
  { t: 62, d: 5, en: 'Every door in this alley is one of my repositories, actually running: flight in Pyodide, hale in WebAssembly, the Vault on a real Postgres (PGlite).', pt: 'Cada porta deste beco é um repositório meu, rodando de verdade: o flight no Pyodide, o hale em WebAssembly, o Cofre num Postgres de verdade (PGlite).' },
  { t: 80, d: 6, en: 'The matching engine’s room catches wash trades: an order that fills against your own resting order is you trading with yourself.', pt: 'A sala do matching engine pega wash trade: uma ordem que casa com a sua própria ordem parada é você negociando consigo mesmo.' },
  { t: 98, d: 7, en: 'The Silicon room ports my five CUDA GEMMs to WGSL and measures them on your GPU, each result checked against the CPU.', pt: 'A sala do Silício porta os meus cinco GEMMs de CUDA para WGSL e mede na sua GPU, cada resultado conferido contra a CPU.' },
  { t: 116, d: 8, en: 'The language model in the room writes about this cinema: a character-level GPT, trained on the house, running in your tab.', pt: 'O modelo de linguagem da sala escreve sobre este cinema: um GPT de caracteres, treinado na casa, rodando na sua aba.' },
  { t: 134, d: 9, en: 'The manhole is a shortcut. Whoever goes down gets to the machine room first.', pt: 'O bueiro é um atalho. Quem desce chega antes na sala de máquinas.' },
  { t: 156, d: 10, en: 'The fourth lighthouse blinks your ticket number, in binary. Nobody else sees the same one.', pt: 'O quarto farol pisca o número do seu ingresso, em binário. Ninguém mais vê o mesmo.' },
  { t: 176, d: 11, en: 'The lighthouses are Raft nodes. Open the room in three tabs and each tab becomes a node; kill the leader and watch the election.', pt: 'Os faróis são nós Raft. Abra a sala em três abas e cada aba vira um nó; derrube o líder e veja a eleição.' },
  { t: 205, d: 12, en: 'The Moon’s silence is a WAV file. Look at its spectrogram: the projectionist’s password is written in it.', pt: 'O silêncio da Lua é um arquivo WAV. Olhe o espectrograma: a senha do projecionista está escrita nele.' },
  { t: 236, en: 'The credits have a line that only shows running backwards. You found it. Of course you did.', pt: 'Os créditos têm uma linha que só aparece de trás para frente. Você achou. Claro que achou.' },
  { t: 248, dur: 10, en: 'Thank you for staying until the end. That was all it took: someone had to stay until the end.', pt: 'Obrigado por ficar até o fim. Era só isso: alguém precisava ficar até o fim.' },
]

export function Commentary() {
  const on = useFinale((s) => s.commentary)
  const act = usePreload((s) => s.act)
  const pt = useFilm((s) => s.lang) === 'pt'
  // Seconds are enough: re-render when the line changes, not every frame.
  const sec = useFilm((s) => Math.floor(s.time))
  if (!on || act !== 'film') return null
  const line = TRACK.find((l) => sec >= l.t && sec < l.t + (l.dur ?? 8))
  return (
    <div className="commentary" aria-live="polite">
      <p className="commentary-tag">
        {pt ? 'SESSÃO COMENTADA' : 'COMMENTARY SESSION'}
        <button onClick={() => setCommentary(false)} aria-label={pt ? 'desligar os comentários' : 'turn the commentary off'}>
          ×
        </button>
      </p>
      {line && (
        <p key={line.t} className="commentary-line">
          {line.d && <b>{pt ? `descoberta ${line.d}/12` : `discovery ${line.d}/12`}</b>}
          {pt ? line.pt : line.en}
        </p>
      )}
    </div>
  )
}

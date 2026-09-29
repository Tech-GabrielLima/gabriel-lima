import { FRAME_COUNT } from '../cinema/frames'
import { fetchCompletions, fetchOnline, findFrame, useProgress, writeTo } from '../cinema/progress'
import { WORDS, parseWords } from '../cinema/vocab'
import { useFilm } from '../film/store'
import { useWorld } from './world'

// The host: whatever GL-OS asks the world outside the machine (ROTEIRO §0.4.5).
// Device files are answered here ("r /path" to read, "w /path data" to write),
// and so are the commands whose answer lives outside: date, who, neofetch...

const pt = () => useFilm.getState().lang === 'pt'
const L = (en: string, ptText: string) => (pt() ? ptText : en)

/** Frames that are found inside GL-OS (the rest are found in the scenes). */
const GLOS_FRAMES = new Set(['terminal', 'arcade', 'log', 'vim', 'sudo', 'projector', 'kill', 'who', 'lights', 'rmrf', 'branch', 'rebuild', 'droste', 'gl1', 'psql', 'dig', 'boiler', 'chaos'])

export interface HostContext {
  /** Who this terminal logs in as (0 root, 1 visitante, 2 caixa). */
  user: number
}

const stamp = (d: Date) => d.toLocaleString('sv-SE', { timeZone: 'America/Recife' }).slice(0, 19)

function projectorLog() {
  const p = useProgress.getState()
  const n = p.ticket?.n ?? 0
  const t = Date.now()
  const at = (s: number) => `[${stamp(new Date(t - s * 1000))}]`
  const missing = FRAME_COUNT - p.found.length
  return [
    `${at(3600 * 5)} ${L('projector: lamp warmed up (3200 K)', 'projetor: lâmpada aquecida (3200 K)')}`,
    n > 2 ? `${at(900)} ${L(`session #${n - 1} ended · operator: explorer #${n - 2}`, `sessão #${n - 1} encerrada · operador: explorer #${n - 2}`)}` : null,
    `${at(60)} ${L(`session #${n || '?'} started · operator: —`, `sessão #${n || '?'} iniciada · operador: —`)}`,
    `${at(59)} ${L(`reel: 24 fps · ${missing} of ${FRAME_COUNT} frames missing`, `rolo: 24 fps · faltam ${missing} de ${FRAME_COUNT} fotogramas`)}`,
    `${at(58)} ${L('WARNING: cabin 0 locked · the reader wants 48 holes', 'AVISO: cabine 0 trancada · a leitora espera 48 furos')}`,
    `${at(2)} ${L('nobody switched the projector on. it is on.', 'ninguém ligou o projetor. ele está ligado.')}`,
    '',
  ]
    .filter((l) => l !== null)
    .join('\n')
}

const USHER = {
  en: ['Shh.', 'The film is that way.', 'I saw that.', "No flash photography. Or flash anything.", 'You again.'],
  pt: ['Psiu.', 'O filme é pra lá.', 'Eu vi isso.', 'Sem flash. Sem nada.', 'Você de novo.'],
}

async function gpu() {
  try {
    const nav = navigator as Navigator & { gpu?: { requestAdapter(): Promise<{ info?: { vendor?: string; architecture?: string; description?: string } } | null> } }
    const a = await nav.gpu?.requestAdapter()
    if (a?.info) return [a.info.vendor, a.info.architecture, a.info.description].filter(Boolean).join(' · ') || 'WebGPU'
  } catch {
    /* no WebGPU */
  }
  try {
    const gl = document.createElement('canvas').getContext('webgl')
    const ext = gl?.getExtension('WEBGL_debug_renderer_info')
    if (gl && ext) return String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL))
  } catch {
    /* no WebGL */
  }
  return L('unknown', 'desconhecida')
}

async function neofetch(user: number) {
  const s = useProgress.getState()
  const logo = ['   ██████  ██     ', '  ██       ██     ', '  ██  ███  ██     ', '  ██   ██  ██     ', '   █████   ██████ ']
  const info = [
    `\x1b[33m${['root', 'visitante', 'caixa'][user]}@${['maquinas', 'cabine', 'bilheteria'][user]}\x1b[0m`,
    `OS      GL-OS 0.1`,
    `CPU     GL-1 8-bit @ 8 MHz ${L('(emulated in WebAssembly)', '(emulada em WebAssembly)')}`,
    `RAM     56 KB · VRAM 4 KB · ROM 4 KB`,
    `Host    ${navigator.hardwareConcurrency ?? '?'} ${L('cores', 'núcleos')} · ${await gpu()}`,
    `${L('Ticket', 'Ingresso')}  #${s.ticket?.n ?? '—'} · ${s.found.length}/${FRAME_COUNT} ${L('frames', 'fotogramas')}`,
  ]
  return logo.map((l, i) => `\x1b[33m${l}\x1b[0m ${info[i] ?? ''}`).concat(info.slice(logo.length).map((l) => `${' '.repeat(19)}${l}`)).join('\n') + '\n\n'
}

/** Answers one message from the machine. */
export async function answer(msg: string, ctx: HostContext): Promise<string> {
  const [head, ...rest] = msg.split(' ')
  const arg = rest.join(' ')
  switch (head) {
    case 'frame':
      if (GLOS_FRAMES.has(arg)) findFrame(arg)
      return ''
    case 'usher':
      useWorld.setState({ usher: arg === 'back' || arg === 'alive' ? 'alive' : 'gone' })
      return ''
    case 'incident':
      useWorld.setState((w) => ({ sudoIncidents: w.sudoIncidents + 1 }))
      return ''
    case 'date':
      return new Date().toLocaleString(pt() ? 'pt-BR' : 'en-GB', { timeZone: 'America/Recife', dateStyle: 'full', timeStyle: 'long' }) + ` (${L('the cinema is in Recife', 'o cinema fica em Recife')})\n`
    case 'who': {
      const n = useProgress.getState().ticket?.n
      const on = (await fetchOnline())?.online ?? []
      const lines = on.map((x) => `explorer #${x}${x === n ? `  ${L('(you)', '(você)')}` : ''}`)
      return (lines.length ? lines.join('\n') : `explorer #${n ?? '?'}  ${L('(you)', '(você)')}`) + `\n\x1b[90m${L('write #N words… to pass a note (house vocabulary: write --words)', 'write #N palavras… para passar um bilhete (vocabulário da casa: write --palavras)')}\x1b[0m\n`
    }
    case 'last': {
      const c = await fetchCompletions()
      if (!c?.completions.length) return L('Nobody has finished yet. Nobody.\n', 'Ninguém terminou ainda. Ninguém.\n')
      return c.completions.map((r) => `completion #${r.completion}  explorer #${r.n}  ${Math.floor(r.ms / 60000)}:${String(Math.floor(r.ms / 1000) % 60).padStart(2, '0')}`).join('\n') + '\n'
    }
    case 'write': {
      if (!arg || /^--(words|palavras)$/.test(arg)) return WORDS.join(' · ') + '\n'
      const m = arg.match(/^#?(\d+)\s+(.+)$/)
      if (!m) return L('usage: write #N words… (see who)\n', 'uso: write #N palavras… (veja o who)\n')
      const words = parseWords(m[2])
      if (!words) return L('write: only the house vocabulary gets through (write --words)\n', 'write: só o vocabulário da casa passa (write --palavras)\n')
      const r = await writeTo(Number(m[1]), words)
      if (!r.ok) return r.status === 404 ? L(`write: #${m[1]} isn't in the house right now\n`, `write: #${m[1]} não está na sala agora\n`) : r.status === 429 ? L('write: one note every 10 seconds\n', 'write: um bilhete a cada 10 segundos\n') : L('write: the note got lost\n', 'write: o bilhete se perdeu\n')
      findFrame('who')
      return L(`note passed to #${m[1]}: ${r.sent}\n`, `bilhete passado para #${m[1]}: ${r.sent}\n`)
    }
    case 'neofetch':
      return neofetch(ctx.user)
    case 'r':
      return readDevice(arg)
    case 'w': {
      const i = arg.indexOf(' ')
      return writeDevice(i < 0 ? arg : arg.slice(0, i), i < 0 ? '' : arg.slice(i + 1).trim(), ctx)
    }
  }
  return ''
}

async function readDevice(path: string): Promise<string> {
  const s = useProgress.getState()
  switch (path) {
    case '/var/log/projetor.log':
      findFrame('log')
      return projectorLog()
    case '/dev/lanterninha': {
      if (useWorld.getState().usher === 'gone') return ''
      const lines = USHER[pt() ? 'pt' : 'en']
      return lines[Math.floor(Math.random() * lines.length)] + '\n'
    }
    case '/dev/gpu':
      return (await gpu()) + '\n'
    case '/cinema/luz':
      return useWorld.getState().lights ? 'on\n' : 'off\n'
    case '/srv/cinema/visitantes':
      return `${s.stats?.visitors ?? '?'}\n`
    case '/srv/cinema/exploradores':
      return `${s.stats?.explorers ?? '?'}\n`
    case '/srv/cinema/conclusoes':
      return `${s.stats?.completed ?? '?'}\n`
  }
  return ''
}

function writeDevice(path: string, data: string, ctx: HostContext): string {
  switch (path) {
    case '/cinema/luz':
      if (data === 'off' || data === 'on') {
        useWorld.setState({ lights: data === 'on' })
        if (data === 'off' && ctx.user === 0) findFrame('lights')
        return ''
      }
      return L('the lights understand "on" and "off".\n', 'as luzes entendem "on" e "off".\n')
    case '/cinema/fachada/cabine0':
      return L("Not even root opens that door. Only the 48.\n", 'Nem root abre essa porta. Só os 48.\n')
    case '/cinema/fachada/letreiro':
      useWorld.setState({ marquee: data.slice(0, 40) || null })
      return ''
  }
  return ''
}

import type { Lang } from '../film/store'
import catalog from '../../cinema/frames.json'

// The 48 lost frames (ROTEIRO §0.4.3): the two seconds (48 frames at 24 fps)
// cut out of the film. The list itself lives in cinema/frames.json, which the
// server's judge reads too, so the site and the server can't disagree on it.

/** A frame's id, as in frames.json (checked against FRAME_NAME in dev). */
export type FrameId = string

export interface Frame {
  n: number
  id: FrameId
  act: 1 | 2 | 3
  kind: string
  /** Seconds on the site before the server will accept it. */
  w: number
  /** Built: the others can't be found yet. */
  live: boolean
}

export const FRAMES = catalog.frames as Frame[]
export const FRAME_COUNT = FRAMES.length
export const frameById = (id: string) => FRAMES.find((f) => f.id === id)

/** Where each cut sits on the reel, as a fraction of the film: evenly spread, nudged so it doesn't look ruled. */
export const CUT_AT: number[] = FRAMES.map((f) => {
  const jitter = (Math.sin(f.n * 12.9898) * 43758.5453) % 1
  return (f.n - 0.5 + jitter * 0.35) / FRAME_COUNT
})

/** The name printed on a frame once it's back in the reel. Only found frames are ever shown. */
export const FRAME_NAME: Record<FrameId, Record<Lang, string>> = {
  door0: { en: 'Staff only', pt: 'Somente pessoal autorizado' },
  morse: { en: 'The bulb that talks', pt: 'A lâmpada que fala' },
  tab: { en: 'You missed a bit', pt: 'Você perdeu um pedaço' },
  print: { en: 'Printed credits', pt: 'Ficha técnica impressa' },
  stub1: { en: 'Ticket Nº 1', pt: 'Ingresso nº 1' },
  arcade: { en: 'Insert coin', pt: 'Insira uma ficha' },
  hall2: { en: 'Behind Hall 2', pt: 'Atrás da Sala 2' },
  dontclick: { en: 'You clicked', pt: 'Você clicou' },
  konami: { en: 'Seriously?', pt: 'Sério?' },
  psql: { en: 'Permission denied', pt: 'Permissão negada' },
  dig: { en: 'The domain speaks', pt: 'O domínio fala' },
  spider: { en: 'The spider', pt: 'A aranha' },
  terminal: { en: 'The projectionist’s computer', pt: 'O computador do projecionista' },
  log: { en: 'Operator: —', pt: 'Operador: —' },
  vim: { en: 'You left vim', pt: 'Você saiu do vim' },
  sudo: { en: 'Incident reported', pt: 'Incidente reportado' },
  projector: { en: 'The projector, fixed', pt: 'O projetor, consertado' },
  drops: { en: 'The drops', pt: 'As gotas' },
  rain: { en: 'Writing on the window', pt: 'Escrito na janela' },
  rat: { en: 'The rat', pt: 'O rato' },
  fault: { en: 'Inside the fault', pt: 'Dentro da falha' },
  manhole: { en: 'Down on your own', pt: 'Descendo sozinho' },
  flight: { en: 'The recorder crashed', pt: 'O gravador quebrou' },
  hale: { en: 'A program called projector', pt: 'Um programa chamado projetor' },
  raft: { en: 'Three tabs, one leader', pt: 'Três abas, um líder' },
  match: { en: 'Trading with yourself', pt: 'Negociando consigo mesmo' },
  ledger: { en: 'Σ = 0', pt: 'Σ = 0' },
  cuda: { en: 'Measured on your GPU', pt: 'Medido na sua GPU' },
  llm: { en: 'The model dreams of cinema', pt: 'O modelo sonha com cinema' },
  slate: { en: 'Blooper', pt: 'Erro de gravação' },
  chest: { en: 'The chest', pt: 'O baú' },
  beacon: { en: 'Your number, in binary', pt: 'O seu número, em binário' },
  flag: { en: '1969', pt: '1969' },
  spectrum: { en: 'The silence has a picture', pt: 'O silêncio tem uma imagem' },
  phone: { en: 'The message', pt: 'O recado' },
  duck: { en: 'The duck', pt: 'O pato' },
  rewind: { en: 'Usher ....... himself', pt: 'Lanterninha ....... ele mesmo' },
  kill: { en: 'Just a process?', pt: 'Só um processo?' },
  who: { en: 'Someone else is here', pt: 'Tem mais alguém aqui' },
  lights: { en: 'Lights off', pt: 'Luzes apagadas' },
  boiler: { en: 'The supervisor gave up', pt: 'O supervisor desistiu' },
  chaos: { en: 'Partition survived', pt: 'A partição não derrubou' },
  rmrf: { en: 'rm -rf /', pt: 'rm -rf /' },
  branch: { en: 'The projectionist branch', pt: 'O branch do projecionista' },
  rebuild: { en: 'You shipped my site', pt: 'Você fez deploy do meu site' },
  droste: { en: 'That’s enough', pt: 'Já chega' },
  gl1: { en: 'The first pixel', pt: 'O primeiro pixel' },
  first: { en: 'Completion Nº 1', pt: 'Conclusão nº 1' },
}

if (import.meta.env.DEV) for (const f of FRAMES) if (!FRAME_NAME[f.id]) console.warn(`frames.json: ${f.id} has no name`)

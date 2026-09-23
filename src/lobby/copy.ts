import type { Lang } from '../film/store'

// Act I's words (ROTEIRO §0.1). The film's own dictionary lives in i18n.ts.

export interface LobbyCopy {
  intro: string
  cinema: string
  tonight: string
  nowShowing: string
  role: string
  tagline: string
  signature: string
  scroll: string
  nav: { film: string; ticket: string; live: string; enter: string }
  reel: { kicker: string; title: string; body: string; chapters: string[] }
  program: { kicker: string; synopsis: string; billing: string[]; stats: [string, string][] }
  ticket: { kicker: string; title: string; admit: string; hall: string; row: string; seat: string; date: string; time: string; note: string }
  door: { hall: string; warming: string; ready: string; enter: string; hint: string; entering: string }
  fps: string
  projector: string
  audience: string
  sound: { on: string; off: string; hint: string }
  soundOn: string
  soundOff: string
}

const en: LobbyCopy = {
  intro: 'full stack engineer · from pixel to silicon',
  cinema: 'Cine GL presents',
  tonight: 'One night only',
  nowShowing: 'Now showing',
  role: 'Full Stack Engineer',
  tagline: 'From pixel to silicon',
  signature: 'I don’t just build. I imagine.',
  scroll: 'scroll to the door',
  nav: { film: 'The film', ticket: 'Ticket', live: 'Live', enter: 'Enter' },
  reel: {
    kicker: 'The trailer',
    title: 'An interactive short film in seven chapters.',
    body: 'Every night, in a forgotten cinema, an 8mm projector switches itself on. The film it plays is a career, told from the interface down to the silicon. Your cursor is the light: nothing exists until it touches.',
    chapters: ['Opening', 'About me', 'Projects', 'Journey', 'Skills', 'Contact'],
  },
  program: {
    kicker: 'The programme',
    synopsis: 'Four years building software end to end: the interface you touch, the API that answers, the database that never loses a cent. And when the tool doesn’t exist, he writes the tool.',
    billing: [
      'Cine GL presents',
      'Gabriel Lima',
      'in',
      'Night Session',
      'data · back-end · front-end · automation',
      'featuring flight · hale · raft · match · ledger · nabla · cuda',
      '8+ companies as a freelancer · ~3 years at Grupo Bel Cosméticos',
      'a 900-class system, one developer · fault-tolerant Elixir',
      'from pixel to silicon',
    ],
    stats: [
      ['4', 'years in the field'],
      ['8+', 'companies as a freelancer'],
      ['900+', 'classes, one developer'],
      ['99.98%', 'requests that succeed'],
    ],
  },
  ticket: {
    kicker: 'Box office',
    title: 'Your ticket is on the house.',
    admit: 'Admit one',
    hall: 'Hall',
    row: 'Row',
    seat: 'Seat',
    date: 'Date',
    time: 'Time',
    note: 'Sound on is recommended. The film runs by itself; take the light whenever you want.',
  },
  door: {
    hall: 'Hall 1 · session in progress',
    warming: 'the projector is warming up',
    ready: 'the session is about to begin',
    enter: 'Enter',
    hint: 'click the door',
    entering: 'Enjoy the film',
  },
  fps: 'fps',
  projector: '3D',
  audience: 'watching',
  sound: { on: 'Come in with sound', off: 'come in silent', hint: 'jazz in the foyer · you can change it at any time' },
  soundOn: 'Sound on',
  soundOff: 'Sound off',
}

const pt: LobbyCopy = {
  intro: 'full stack engineer · do pixel ao silício',
  cinema: 'Cine GL apresenta',
  tonight: 'Sessão única',
  nowShowing: 'Em cartaz',
  role: 'Full Stack Engineer',
  tagline: 'Do pixel ao silício',
  signature: 'Eu não apenas construo. Eu imagino.',
  scroll: 'role até a porta',
  nav: { film: 'O filme', ticket: 'Ingresso', live: 'Ao vivo', enter: 'Entrar' },
  reel: {
    kicker: 'O trailer',
    title: 'Um curta interativo em sete capítulos.',
    body: 'Toda noite, num cinema esquecido, um projetor 8mm liga sozinho. O filme que passa é uma carreira, contada da interface até o silício. O seu cursor é a luz: nada existe até ela tocar.',
    chapters: ['Abertura', 'Sobre mim', 'Projetos', 'Trajetória', 'Habilidades', 'Contato'],
  },
  program: {
    kicker: 'O programa',
    synopsis: 'Quatro anos construindo software de ponta a ponta: a interface que você toca, a API que responde, o banco que não perde um centavo. E quando a ferramenta não existe, ele escreve a ferramenta.',
    billing: [
      'Cine GL apresenta',
      'Gabriel Lima',
      'em',
      'Sessão Noturna',
      'dados · back-end · front-end · automações',
      'com flight · hale · raft · match · ledger · nabla · cuda',
      '8+ empresas como freelancer · ~3 anos no Grupo Bel Cosméticos',
      'um sistema de 900 classes, um desenvolvedor · Elixir tolerante a falhas',
      'do pixel ao silício',
    ],
    stats: [
      ['4', 'anos na área'],
      ['8+', 'empresas como freelancer'],
      ['900+', 'classes, um desenvolvedor'],
      ['99,98%', 'das requisições com sucesso'],
    ],
  },
  ticket: {
    kicker: 'Bilheteria',
    title: 'O seu ingresso é por conta da casa.',
    admit: 'Admite um',
    hall: 'Sala',
    row: 'Fila',
    seat: 'Poltrona',
    date: 'Data',
    time: 'Hora',
    note: 'Recomendo o som ligado. O filme roda sozinho; pegue a luz quando quiser.',
  },
  door: {
    hall: 'Sala 1 · sessão em andamento',
    warming: 'o projetor está aquecendo',
    ready: 'a sessão vai começar',
    enter: 'Entrar',
    hint: 'clique na porta',
    entering: 'Bom filme',
  },
  fps: 'fps',
  projector: '3D',
  audience: 'na plateia',
  sound: { on: 'Entrar com som', off: 'entrar em silêncio', hint: 'jazz no saguão · dá para mudar a qualquer momento' },
  soundOn: 'Ligar o som',
  soundOff: 'Desligar o som',
}

export const LOBBY: Record<Lang, LobbyCopy> = { en, pt }

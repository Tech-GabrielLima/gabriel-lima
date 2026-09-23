import type { ChapterId } from './film/chapters'
import { useFilm, type Lang } from './film/store'

interface Dict {
  film: string
  by: string
  tagline: string
  tonight: string
  presents: string
  chapters: Record<ChapterId, string>
  /** One line per chapter, painted on the slate walls until each scene is built. */
  slate: Record<ChapterId, string>
  ui: {
    play: string
    pause: string
    watch: string
    explore: string
    sound: string
    captions: string
    skip: string
    start: string
    startHint: string
    exploreHint: string
    inProduction: string
    chapters: string
    viewCode: string
    back: string
    howItWorks: string
    eggs: string
    watchAgain: string
    textVersion: string
    backToFilm: string
    more: string
    less: string
  }
  contact: {
    kicker: string
    title: string
    hook: string
    answer: string
    heading: string
    copy: string
    copied: string
    name: string
    message: string
    sendMail: string
    sendWhats: string
    close: string
    voicemail: string
    fin: string
    duck: string
  }
}

const en: Dict = {
  film: 'Night Session',
  by: 'a film by Gabriel Lima',
  tagline: 'From pixel to silicon',
  tonight: 'TONIGHT ONLY',
  presents: 'presents',
  chapters: {
    countdown: 'Countdown',
    booth: 'Opening',
    studio: 'About me',
    alley: 'Projects',
    crossing: 'Journey',
    moon: 'Skills',
    credits: 'Contact',
  },
  slate: {
    countdown: '8 · 7 · 6 · 5 · 4 · 3',
    booth: 'Full Stack Engineer · 4 years',
    studio: "I don't just build. I imagine.",
    alley: '900+ classes · 1 developer',
    crossing: '8+ companies · 1 pier',
    moon: 'Data · Automation · Interface · Backend · Distributed · Metal',
    credits: 'Directed by Gabriel Lima',
  },
  ui: {
    play: 'Play',
    pause: 'Pause',
    watch: 'Watch',
    explore: 'Explore',
    sound: 'Sound',
    captions: 'Captions',
    skip: 'Skip to credits',
    start: 'Turn on the projector',
    startHint: 'Best with sound on',
    exploreHint: 'Scroll or drag to move through the film',
    inProduction: 'Scene in production',
    chapters: 'Chapters',
    viewCode: 'View the code',
    back: 'Back to the alley',
    howItWorks: 'How it works',
    eggs: 'easter eggs',
    watchAgain: 'Watch again',
    textVersion: 'Text version',
    backToFilm: 'Back to the film',
    more: 'Read more',
    less: 'Less',
  },
  contact: {
    kicker: '06 · CONTACT',
    title: 'A call for you',
    hook: 'The film is calling. Pick up.',
    answer: 'Answer the phone',
    heading: 'Let’s make the next film together',
    copy: 'Copy',
    copied: 'Copied',
    name: 'Your name',
    message: 'What are you building?',
    sendMail: 'Send by e-mail',
    sendWhats: 'Send on WhatsApp',
    close: 'Hang up',
    voicemail: '“Hi, it’s Gabriel. If you’re hearing this, you watched until the end. That already says a lot about you. Call me back.”',
    fin: 'The End',
    duck: 'Quack.',
  },
}

const pt: Dict = {
  film: 'Sessão Noturna',
  by: 'um filme de Gabriel Lima',
  tagline: 'Do pixel ao silício',
  tonight: 'SÓ HOJE',
  presents: 'apresenta',
  chapters: {
    countdown: 'Contagem',
    booth: 'Abertura',
    studio: 'Sobre mim',
    alley: 'Projetos',
    crossing: 'Trajetória',
    moon: 'Habilidades',
    credits: 'Contato',
  },
  slate: {
    countdown: '8 · 7 · 6 · 5 · 4 · 3',
    booth: 'Full Stack Engineer · 4 anos',
    studio: 'Eu não apenas construo. Eu imagino.',
    alley: '900+ classes · 1 desenvolvedor',
    crossing: '8+ empresas · 1 píer',
    moon: 'Dados · Automação · Interface · Backend · Distribuídos · Metal',
    credits: 'Direção: Gabriel Lima',
  },
  ui: {
    play: 'Reproduzir',
    pause: 'Pausar',
    watch: 'Assistir',
    explore: 'Explorar',
    sound: 'Som',
    captions: 'Legendas',
    skip: 'Pular para os créditos',
    start: 'Ligue o projetor',
    startHint: 'Melhor com som',
    exploreHint: 'Role ou arraste para percorrer o filme',
    inProduction: 'Cena em produção',
    chapters: 'Capítulos',
    viewCode: 'Ver o código',
    back: 'Voltar ao beco',
    howItWorks: 'Como funciona',
    eggs: 'easter eggs',
    watchAgain: 'Assistir de novo',
    textVersion: 'Versão em texto',
    backToFilm: 'Voltar ao filme',
    more: 'Ler mais',
    less: 'Menos',
  },
  contact: {
    kicker: '06 · CONTATO',
    title: 'Uma ligação para você',
    hook: 'O filme está te ligando. Atenda.',
    answer: 'Atender o telefone',
    heading: 'Vamos fazer o próximo filme juntos',
    copy: 'Copiar',
    copied: 'Copiado',
    name: 'Seu nome',
    message: 'O que você está construindo?',
    sendMail: 'Enviar por e-mail',
    sendWhats: 'Enviar no WhatsApp',
    close: 'Desligar',
    voicemail: '“Oi, aqui é o Gabriel. Se você está ouvindo isso, assistiu até o fim. Isso já diz muito sobre você. Me liga de volta.”',
    fin: 'Fim',
    duck: 'Quack.',
  },
}

const dicts: Record<Lang, Dict> = { en, pt }

export const useT = () => dicts[useFilm((s) => s.lang)]

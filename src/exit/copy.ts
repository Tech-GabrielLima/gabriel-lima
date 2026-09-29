import type { Lang } from '../film/store'
import type { LobbyCopy } from '../lobby/copy'

// Act III's words (ROTEIRO §0.1): the same house after the session.

export interface ExitCopy {
  brand: string
  /** The opening, after the film / when arriving straight from the lobby. */
  intro: { seen: [string, string]; early: [string, string] }
  kicker: string
  marquee: { top: string; name: string; role: string; tag: string }
  scrawls: string[]
  scroll: string
  nav: { lobby: string; live: string; contact: string; hall: string }
  exhibits: { raft: [string, string, string]; match: [string, string, string]; hale: [string, string, string]; room: [string, string, string] }
  more: { kicker: string; title: string; code: string }
  ticket: { kicker: string; title: string; seen: string; early: string; stampSeen: string; stampEarly: string }
  credits: { kicker: string; title: string; body: string; copy: string; copied: string; fin: string }
  /** The door back into Hall 1, before and after the film has been seen. */
  door: { seen: LobbyCopy['door']; early: LobbyCopy['door'] }
  lobby: string
}

const en: ExitCopy = {
  brand: 'Sessão Noturna · Lights up',
  intro: { seen: ['The End.', 'thank you for watching · the projects are still running'], early: ['Live.', 'the projects, running, while the film waits'] },
  kicker: 'Cine GL · the session is over',
  marquee: { top: 'Now showing', name: 'Live', role: 'Three projects running right now', tag: 'The film is over. The projects aren’t.' },
  scrawls: ['quorum 3/5', 'p99 < 1 ms', 'N+1 ✕', 'THE END', 'see you next session'],
  scroll: 'scroll past the exhibits',
  nav: { lobby: '← Lobby', live: 'Live', contact: 'Contact', hall: 'Hall 1 ▸' },
  exhibits: {
    raft: ['Distributed systems', 'Five lighthouses, one leader.', 'raft-kv-store: Raft consensus from scratch in plain Java, with a linearizable key-value store on top. Here five of its nodes run on the server, on its own fault-injecting network.'],
    match: ['Low latency', 'An order book everyone shares.', 'lowlatency-matching-engine: price-time priority matching in Java. Its engine core runs on the server; your order and everyone else’s meet in the same book.'],
    hale: ['Compilers', 'A language that refuses slow code.', 'hale: a compiled language for consuming HTTP APIs. Its whole front-end, from the lexer to the N+1 analysis, is Rust compiled to WebAssembly and runs in your browser.'],
    room: ['The machine room', 'This site is a project too.', 'One Java 21 service with zero dependencies streams all of this over Server-Sent Events: the cluster, the book, the audience. The numbers below are its own, live.'],
  },
  more: { kicker: 'Also in the programme', title: 'More from the same director.', code: 'code' },
  ticket: {
    kicker: 'Your ticket',
    title: 'Keep it. It’s good for the next session.',
    seen: 'Torn at the door, stamped on the way out: you saw the film.',
    early: 'Still whole: the film is waiting for you in Hall 1.',
    stampSeen: 'Seen',
    stampEarly: 'Valid',
  },
  credits: { kicker: 'Credits', title: 'Let’s build the next one.', body: 'Open to jobs and freelance: full stack, from the pixel to the silicon.', copy: 'copy', copied: 'copied', fin: 'I don’t just build. I imagine.' },
  door: {
    seen: { hall: 'Hall 1 · next session', warming: 'the projector is warming up', ready: 'the next session is about to begin', enter: 'Watch again', hint: 'click the door', entering: 'Enjoy it again' },
    early: { hall: 'Hall 1 · session in progress', warming: 'the projector is warming up', ready: 'the film is waiting for you', enter: 'Watch the film', hint: 'click the door', entering: 'Enjoy the film' },
  },
  lobby: '↑ back to the lobby',
}

const pt: ExitCopy = {
  brand: 'Sessão Noturna · Luzes acesas',
  intro: { seen: ['Fim.', 'obrigado por assistir · os projetos continuam rodando'], early: ['Ao vivo.', 'os projetos, rodando, enquanto o filme espera'] },
  kicker: 'Cine GL · sessão encerrada',
  marquee: { top: 'Agora em cartaz', name: 'Ao vivo', role: 'Três projetos rodando agora', tag: 'O filme acabou. Os projetos, não.' },
  scrawls: ['quorum 3/5', 'p99 < 1 ms', 'N+1 ✕', 'FIM', 'até a próxima sessão'],
  scroll: 'role pelas vitrines',
  nav: { lobby: '← Saguão', live: 'Ao vivo', contact: 'Contato', hall: 'Sala 1 ▸' },
  exhibits: {
    raft: ['Sistemas distribuídos', 'Cinco faróis, um líder.', 'raft-kv-store: consenso Raft do zero em Java puro, com um key-value linearizável por cima. Aqui cinco nós dele rodam no servidor, na própria rede com injeção de falhas.'],
    match: ['Baixa latência', 'Um livro de ofertas que todo mundo divide.', 'lowlatency-matching-engine: casamento de ordens por prioridade preço-tempo em Java. O núcleo do engine roda no servidor; a sua ordem e a dos outros se encontram no mesmo livro.'],
    hale: ['Compiladores', 'Uma linguagem que recusa código lento.', 'hale: uma linguagem compilada para consumir APIs HTTP. O front-end inteiro, do lexer à análise de N+1, é Rust compilado para WebAssembly e roda no seu navegador.'],
    room: ['A sala de máquinas', 'Este site também é um projeto.', 'Um serviço Java 21 sem nenhuma dependência transmite tudo isso por Server-Sent Events: o cluster, o livro, a plateia. Os números abaixo são dele, ao vivo.'],
  },
  more: { kicker: 'Também no programa', title: 'Mais do mesmo diretor.', code: 'código' },
  ticket: {
    kicker: 'O seu ingresso',
    title: 'Guarde. Ele vale a próxima sessão.',
    seen: 'Picotado na entrada, carimbado na saída: você viu o filme.',
    early: 'Ainda inteiro: o filme está esperando por você na Sala 1.',
    stampSeen: 'Assistido',
    stampEarly: 'Válido',
  },
  credits: { kicker: 'Créditos', title: 'Vamos construir o próximo.', body: 'Disponível para vagas e freelas: full stack, do pixel ao silício.', copy: 'copiar', copied: 'copiado', fin: 'Eu não apenas construo. Eu imagino.' },
  door: {
    seen: { hall: 'Sala 1 · próxima sessão', warming: 'o projetor está aquecendo', ready: 'a próxima sessão vai começar', enter: 'Assistir de novo', hint: 'clique na porta', entering: 'Bom filme, de novo' },
    early: { hall: 'Sala 1 · sessão em andamento', warming: 'o projetor está aquecendo', ready: 'o filme está esperando por você', enter: 'Assistir ao filme', hint: 'clique na porta', entering: 'Bom filme' },
  },
  lobby: '↑ voltar ao saguão',
}

export const EXIT: Record<Lang, ExitCopy> = { en, pt }

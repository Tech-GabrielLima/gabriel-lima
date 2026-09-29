import type { Lang } from '../film/store'

// Scene 02 (the studio) and scene 04 (the pier). See ROTEIRO §2.

export const BIO: Record<Lang, string[]> = {
  en: [
    '22 years old.',
    '4 building software end to end:',
    'the interface you touch, the API that answers,',
    'the database that never loses a cent.',
    'And when the tool doesn’t exist,',
    'I write the tool.',
    'I don’t just build. I imagine.',
  ],
  pt: [
    '22 anos.',
    '4 construindo software de ponta a ponta:',
    'a interface que você toca, a API que responde,',
    'o banco que não perde um centavo.',
    'E quando a ferramenta não existe,',
    'eu escrevo a ferramenta.',
    'Eu não apenas construo. Eu imagino.',
  ],
}

export const ABOUT = {
  kicker: { en: '02 · ABOUT', pt: '02 · SOBRE' },
  title: 'Gabriel Lima',
  hook: { en: 'Full stack, from pixel to silicon.', pt: 'Full stack, do pixel ao silício.' },
  body: {
    en: 'Data, back-end, front-end and automation, for 4 years: 8+ companies as a freelancer, then ~3 years at Grupo Bel Cosméticos, where I built and alone maintain a 900-class Java system. In my own time I build the things underneath: a compiler, GPU kernels, a consensus algorithm.',
    pt: 'Dados, back-end, front-end e automações, há 4 anos: 8+ empresas como freelancer e depois ~3 anos no Grupo Bel Cosméticos, onde construí e mantenho sozinho um sistema Java de 900 classes. No tempo livre, construo o que fica por baixo: um compilador, kernels de GPU, um algoritmo de consenso.',
  },
}

/** The pier's lanterns, nearest first (ROTEIRO, Cena 04). */
export interface Milestone {
  year: string
  title: Record<Lang, string>
  line: Record<Lang, string>
  /** Small lanterns: the freelance years, many little boats. */
  small?: boolean
  /** The pier widens here: freelance → a steady house. */
  anchor?: boolean
  /** The last one stays dark until clicked: it opens the contact. */
  future?: boolean
}

export const MILESTONES: Milestone[] = [
  {
    year: '2022',
    small: true,
    title: { en: 'Freelancer', pt: 'Freelancer' },
    line: { en: 'Where it started: one client, then another.', pt: 'Onde tudo começou: um cliente, depois outro.' },
  },
  {
    year: '2022–23',
    small: true,
    title: { en: '8+ companies', pt: '8+ empresas' },
    line: {
      en: 'Data (Oracle, Postgres, MariaDB, MySQL, Redis, Mongo, Neo4j), Python automation, React · Angular · Ionic · Next, Java · Node · Elixir · Go. Where I grew up as an engineer.',
      pt: 'Dados (Oracle, Postgres, MariaDB, MySQL, Redis, Mongo, Neo4j), automações em Python, React · Angular · Ionic · Next, Java · Node · Elixir · Go. Onde eu amadureci como engenheiro.',
    },
  },
  {
    year: '2023',
    anchor: true,
    title: { en: 'Grupo Bel Cosméticos', pt: 'Grupo Bel Cosméticos' },
    line: { en: 'Full stack engineer (CLT). The pier gets wider from here.', pt: 'Engenheiro full stack (CLT). Daqui o píer fica mais largo.' },
  },
  {
    year: '2023–',
    title: { en: 'A 900-class monolith', pt: 'Um monólito de 900 classes' },
    line: { en: 'Created and maintained alone. ~5,000 hours of manual work saved.', pt: 'Criado e mantido sozinho. ~5.000 horas de trabalho manual economizadas.' },
  },
  {
    year: '2023–',
    title: { en: 'Elixir that doesn’t fall', pt: 'Elixir que não cai' },
    line: { en: 'Fault-tolerant services: 99.98% of requests succeed.', pt: 'Serviços tolerantes a falhas: 99,98% das requisições com sucesso.' },
  },
  {
    year: '2024–',
    title: { en: 'Reports & automation', pt: 'Relatórios e automações' },
    line: { en: 'The quiet work that gives people their afternoons back.', pt: 'O trabalho silencioso que devolve as tardes das pessoas.' },
  },
  {
    year: '2026',
    title: { en: 'Research in systems', pt: 'Pesquisa em sistemas' },
    line: { en: 'A compiler, Raft, CUDA, an LLM engine: the seven doors in the alley.', pt: 'Um compilador, Raft, CUDA, um motor de LLM: as sete portas do beco.' },
  },
  {
    year: '?',
    future: true,
    title: { en: 'Next chapter: you?', pt: 'Próximo capítulo: você?' },
    line: { en: 'Light this one and let’s talk.', pt: 'Acenda este e vamos conversar.' },
  },
]

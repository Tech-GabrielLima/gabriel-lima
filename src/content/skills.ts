import type { Lang } from '../film/store'

// Scene 05 (ROTEIRO §2, "Mar da Tranquilidade"): one moon rock per area; throw
// it and that constellation lights up over the Earth. All six together form
// the GL monogram.

export interface Constellation {
  id: string
  name: Record<Lang, string>
  stars: string[]
  /** Where the proof lives. */
  url: string
  color: string
}

const GH = 'https://github.com/Tech-GabrielLima'

export const CONSTELLATIONS: Constellation[] = [
  {
    id: 'data',
    name: { en: 'Data', pt: 'Dados' },
    stars: ['Oracle', 'PostgreSQL', 'MariaDB', 'MySQL', 'Redis', 'MongoDB', 'Neo4j'],
    url: `${GH}/event-sourced-ledger`,
    color: '#8fd4ff',
  },
  {
    id: 'automation',
    name: { en: 'Automation', pt: 'Automação' },
    stars: ['Python', 'Reports', 'Integrations', 'Data scripts'],
    url: GH,
    color: '#b8ffa0',
  },
  {
    id: 'interface',
    name: { en: 'Interface', pt: 'Interface' },
    stars: ['React', 'Next.js', 'Angular', 'Ionic', 'WebGL · Three.js', 'Android (soon)'],
    url: GH,
    color: '#ffd08a',
  },
  {
    id: 'backend',
    name: { en: 'Backend', pt: 'Backend' },
    stars: ['Java 21', 'Spring Boot · WebFlux', 'Node', 'Elixir', 'Go', 'Kafka'],
    url: `${GH}/lowlatency-matching-engine`,
    color: '#ffa0c8',
  },
  {
    id: 'distributed',
    name: { en: 'Distributed', pt: 'Distribuídos' },
    stars: ['Raft', 'Event sourcing', 'CQRS', 'Sagas', 'LMAX Disruptor', 'OTP supervision'],
    url: `${GH}/raft-kv-store`,
    color: '#c8b0ff',
  },
  {
    id: 'metal',
    name: { en: 'Metal', pt: 'Metal' },
    stars: ['Rust', 'CUDA · C++', 'Triton', 'Compilers', 'Autograd'],
    url: `${GH}/cuda-kernels-from-scratch`,
    color: '#fff0c0',
  },
]

export const STACK = {
  kicker: { en: '05 · SKILLS', pt: '05 · HABILIDADES' },
  hint: { en: 'Throw a rock: its constellation lights up.', pt: 'Arremesse uma pedra: a constelação dela acende.' },
  done: { en: 'Full stack is when the constellations become one drawing.', pt: 'Full stack é quando as constelações viram um desenho só.' },
  radio: { en: '“Houston, it’s Gabriel. The stack is confirmed. Over.”', pt: '“Houston, aqui é o Gabriel. Stack confirmada. Câmbio.”' },
}

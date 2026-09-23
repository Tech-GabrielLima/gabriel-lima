import type { Lang } from '../film/store'

// The alley's doors (ROTEIRO §2, Cena 03). Adding a project = adding an entry
// here plus a door anchor in scripts/blender/alley.py.

export type DoorId = 'flight' | 'hale' | 'raft' | 'match' | 'ledger' | 'nabla' | 'cuda' | 'obras'

export interface Project {
  id: DoorId
  /** Spray-painted on the shutter. */
  tag: string
  /** Neon number shown inside. */
  stat: Record<Lang, string>
  title: string
  role: Record<Lang, string>
  /** The one sentence anyone gets, no jargon. Shown first, big. */
  hook: Record<Lang, string>
  /** What it is, in plain words, for people outside tech. */
  plain: Record<Lang, string>
  /** How it works, for engineers. */
  blurb: Record<Lang, string>
  stack: string
  url?: string
  /** Colour of the light that leaks from under the shutter. */
  light: string
  featured?: boolean
}

const GH = 'https://github.com/Tech-GabrielLima'

export const PROJECTS: Project[] = [
  {
    id: 'flight',
    tag: 'FLIGHT',
    featured: true,
    title: 'flight',
    stat: { en: 'pip install pyflight', pt: 'pip install pyflight' },
    role: { en: 'Author · Rust + Python · published on PyPI', pt: 'Autor · Rust + Python · publicado no PyPI' },
    hook: {
      en: 'When a program crashes, it usually takes the reason with it. flight doesn’t let it.',
      pt: 'Quando um programa quebra, ele costuma levar o motivo junto. O flight não deixa.',
    },
    plain: {
      en: 'Like an airplane’s black box, but for software: it records the last moments before a crash, so anyone can see exactly what went wrong and prove the fix works. It’s published and installable by any Python developer.',
      pt: 'Como a caixa-preta de um avião, só que para software: grava os últimos instantes antes de uma falha, para qualquer pessoa ver exatamente o que deu errado e provar que a correção funciona. Está publicado e qualquer dev Python pode instalar.',
    },
    blurb: {
      en: 'A black box for Python. When a program dies, flight records its last moment as an object graph, explains why a value is what it is, and replays the crash to prove the fix.',
      pt: 'Uma caixa-preta para Python. Quando o programa morre, o flight grava o último momento como um grafo de objetos, explica por que um valor é o que é e reexecuta o crash para provar a correção.',
    },
    stack: 'Rust · Python · PyO3',
    url: `${GH}/flight`,
    light: '#ff8a3d',
  },
  {
    id: 'hale',
    tag: 'HALE',
    title: 'hale',
    stat: { en: 'lexer → IR → runtime', pt: 'lexer → IR → runtime' },
    role: { en: 'Language design & compiler, from scratch', pt: 'Design da linguagem e compilador, do zero' },
    hook: {
      en: 'I didn’t like how software talks to other software. So I wrote a new language.',
      pt: 'Eu não gostava de como os sistemas conversam entre si. Então escrevi uma linguagem nova.',
    },
    plain: {
      en: 'Apps are constantly asking other services for data. hale is a programming language, with its own compiler, where the mistakes that usually break those conversations are caught before the program even runs, and slow requests run in parallel on their own.',
      pt: 'Aplicativos vivem pedindo dados a outros serviços. O hale é uma linguagem de programação, com compilador próprio, em que os erros que costumam quebrar essas conversas são pegos antes do programa rodar, e as requisições lentas passam a correr em paralelo sozinhas.',
    },
    blurb: {
      en: 'A compiled language for consuming HTTP APIs. Error handling is checked at compile time and independent requests are parallelised by the optimiser, with no Promise.all in sight.',
      pt: 'Uma linguagem compilada para consumir APIs HTTP. O tratamento de erro é checado em tempo de compilação e requisições independentes são paralelizadas pelo otimizador, sem Promise.all.',
    },
    stack: 'Rust · SSA IR · async runtime',
    url: `${GH}/tired`,
    light: '#c77dff',
  },
  {
    id: 'raft',
    tag: 'RAFT',
    featured: true,
    title: 'raft-kv-store',
    stat: { en: '7 phases · 0 dependencies', pt: '7 fases · 0 dependências' },
    role: { en: 'Consensus from scratch + fault simulator', pt: 'Consenso do zero + simulador de falhas' },
    hook: {
      en: 'How do five computers agree on the truth when any of them can die at any moment?',
      pt: 'Como cinco computadores concordam sobre a verdade quando qualquer um pode morrer a qualquer momento?',
    },
    plain: {
      en: 'Banks, clouds and databases keep copies of your data on many machines. Raft is the algorithm that keeps those copies in agreement even when machines crash or the network fails. I built it from scratch, plus a simulator that breaks it on purpose. Try it: crash a lantern.',
      pt: 'Bancos, nuvens e bancos de dados guardam cópias dos seus dados em várias máquinas. O Raft é o algoritmo que mantém essas cópias de acordo mesmo quando máquinas caem ou a rede falha. Construí do zero, junto com um simulador que tenta quebrá-lo de propósito. Experimente: derrube um lampião.',
    },
    blurb: {
      en: 'Raft consensus with leader election, replication, snapshots and membership change, proven against a network that drops, delays and partitions, and checked for linearizability.',
      pt: 'Consenso Raft com eleição de líder, replicação, snapshots e mudança de membros, provado contra uma rede que perde, atrasa e particiona mensagens, e checado quanto à linearizabilidade.',
    },
    stack: 'Java 21 · zero runtime deps',
    url: `${GH}/raft-kv-store`,
    light: '#ffc46b',
  },
  {
    id: 'match',
    tag: 'MATCH',
    featured: true,
    title: 'lowlatency-matching-engine',
    stat: { en: '3.6M orders/s · p99 ≈ 60µs', pt: '3,6M ordens/s · p99 ≈ 60µs' },
    role: { en: 'Exchange core · single-writer design', pt: 'Núcleo de bolsa · arquitetura single-writer' },
    hook: {
      en: '3.6 million orders per second. On a single thread. Without a single lock.',
      pt: '3,6 milhões de ordens por segundo. Numa única thread. Sem nenhuma trava.',
    },
    plain: {
      en: 'This is the core of a stock exchange: it decides, in millionths of a second, who buys from whom and at what price. In this business speed isn’t a detail, it’s the whole product.',
      pt: 'É o coração de uma bolsa de valores: decide, em milionésimos de segundo, quem compra de quem e por qual preço. Nesse negócio, velocidade não é detalhe, é o produto inteiro.',
    },
    blurb: {
      en: 'The heart of an exchange: an in-memory order book with price-time priority, fed over WebSocket through an LMAX Disruptor ring, with no locks anywhere, and deterministic replay.',
      pt: 'O coração de uma bolsa: order book em memória com prioridade preço-tempo, alimentado por WebSocket através de um ring LMAX Disruptor, sem nenhum lock, e com replay determinístico.',
    },
    stack: 'Spring WebFlux · LMAX Disruptor · HdrHistogram',
    url: `${GH}/lowlatency-matching-engine`,
    light: '#3ef0e6',
  },
  {
    id: 'ledger',
    tag: 'LEDGER',
    title: 'event-sourced-ledger',
    stat: { en: '1000/1000 · money conserved', pt: '1000/1000 · dinheiro conservado' },
    role: { en: 'Payments core · event sourcing + CQRS', pt: 'Núcleo de pagamentos · event sourcing + CQRS' },
    hook: {
      en: '1,000 transfers at the same instant. Not one cent out of place.',
      pt: '1.000 transferências no mesmo instante. Nenhum centavo fora do lugar.',
    },
    plain: {
      en: 'The engine behind a digital wallet: it moves money between accounts so that nothing is ever charged twice or lost, even when thousands of things happen at once or a step fails halfway through.',
      pt: 'O motor por trás de uma carteira digital: move dinheiro entre contas sem nunca cobrar duas vezes nem perder nada, mesmo com milhares de coisas acontecendo ao mesmo tempo ou uma etapa falhando no meio do caminho.',
    },
    blurb: {
      en: 'A double-entry ledger that survives races and partial failure: idempotency keys, sagas with compensation and a transactional outbox. 1000 concurrent transfers, not a cent lost.',
      pt: 'Um razão de partidas dobradas que sobrevive a corridas e falhas parciais: chaves de idempotência, sagas com compensação e outbox transacional. 1000 transferências simultâneas, nenhum centavo perdido.',
    },
    stack: 'Spring Boot · PostgreSQL · Kafka',
    url: `${GH}/event-sourced-ledger`,
    light: '#7dffa8',
  },
  {
    id: 'nabla',
    tag: 'NABLA',
    title: 'nabla + nano-llm',
    stat: { en: '∇ ≈ 1e-7 vs PyTorch', pt: '∇ ≈ 1e-7 vs PyTorch' },
    role: { en: 'Deep-learning internals, from NumPy up', pt: 'Entranhas de deep learning, a partir do NumPy' },
    hook: {
      en: 'To really understand AI, I rebuilt the parts nobody looks at.',
      pt: 'Para entender IA de verdade, reconstruí as peças que ninguém olha.',
    },
    plain: {
      en: 'nabla is a tiny PyTorch, the tool behind most modern AI, written from zero, and it learns to read handwritten digits. nano-llm runs GPT-2, an ancestor of ChatGPT, with the same tricks real AI servers use to answer fast.',
      pt: 'O nabla é um PyTorch em miniatura (a ferramenta por trás da maior parte da IA moderna), escrito do zero, que aprende a ler dígitos escritos à mão. O nano-llm roda o GPT-2, um ancestral do ChatGPT, com os mesmos truques que servidores de IA de verdade usam para responder rápido.',
    },
    blurb: {
      en: 'A micro-PyTorch with reverse-mode autograd and CPU/GPU backends, plus a GPT-2 inference engine with KV-cache (3.9× faster), INT8 quantization and FlashAttention in Triton.',
      pt: 'Um micro-PyTorch com autograd reverso e backends CPU/GPU, mais um motor de inferência GPT-2 com KV-cache (3,9× mais rápido), quantização INT8 e FlashAttention em Triton.',
    },
    stack: 'Python · NumPy · Triton · CUDA',
    url: `${GH}/nabla-autograd`,
    light: '#ff4f9a',
  },
  {
    id: 'cuda',
    tag: 'CUDA',
    title: 'cuda-kernels-from-scratch',
    stat: { en: '5 GEMM versions · vs cuBLAS', pt: '5 versões de GEMM · vs cuBLAS' },
    role: { en: 'GPU kernels by hand', pt: 'Kernels de GPU à mão' },
    hook: {
      en: 'Why is a graphics card so fast? I wrote the answer by hand.',
      pt: 'Por que uma placa de vídeo é tão rápida? Escrevi a resposta à mão.',
    },
    plain: {
      en: 'GPUs power games and AI by doing thousands of calculations at once. These are those calculations written by hand, one version at a time, each faster than the last, measured against NVIDIA’s own library.',
      pt: 'GPUs movem jogos e IA fazendo milhares de cálculos ao mesmo tempo. Aqui estão esses cálculos escritos à mão, versão por versão, cada uma mais rápida que a anterior, medidas contra a biblioteca da própria NVIDIA.',
    },
    blurb: {
      en: 'GEMM from naive to Tensor Cores, plus reductions, softmax, layernorm and conv2d. Every version attacks one hardware bottleneck and is measured against the GPU’s theoretical peak.',
      pt: 'GEMM do ingênuo aos Tensor Cores, mais reduções, softmax, layernorm e conv2d. Cada versão ataca um gargalo do hardware e é medida contra o pico teórico da GPU.',
    },
    stack: 'CUDA C++ · WMMA · Nsight',
    url: `${GH}/cuda-kernels-from-scratch`,
    light: '#76ff3e',
  },
  {
    id: 'obras',
    tag: 'EM OBRAS',
    title: 'next session',
    stat: { en: 'coming soon', pt: 'em breve' },
    role: { en: 'Research repositories in progress', pt: 'Repositórios de pesquisa em andamento' },
    hook: {
      en: 'The next session is being filmed.',
      pt: 'A próxima sessão está sendo filmada.',
    },
    plain: {
      en: 'New research repositories are in progress: front-end, Node and Android. Each one becomes a new door in this alley.',
      pt: 'Novos repositórios de pesquisa estão em andamento: front-end, Node e Android. Cada um vira uma porta nova neste beco.',
    },
    blurb: {
      en: 'Next sessions: front-end, Node and Android research repositories. Every new one becomes a new door in this alley.',
      pt: 'Próximas sessões: repositórios de pesquisa de front-end, Node e Android. Cada novo vira uma porta nova neste beco.',
    },
    stack: 'front · node · android',
    url: GH,
    light: '#ffe14d',
  },
]

export const projectById = (id: DoorId) => PROJECTS.find((p) => p.id === id)!

/** The professional case shown on the tower at the end of the alley. */
export const MONOLITH = {
  classes: 900,
  hours: 5000,
  title: { en: 'Grupo Bel Cosméticos', pt: 'Grupo Bel Cosméticos' },
  line: {
    en: '900+ classes · 1 developer · ~5,000 hours saved',
    pt: '900+ classes · 1 desenvolvedor · ~5.000 horas economizadas',
  },
  caption: {
    en: 'A Java monolith I created and maintain alone. Every window is a class.',
    pt: 'Um monólito Java que eu criei e mantenho sozinho. Cada janela é uma classe.',
  },
  hook: {
    en: 'One developer. 900 classes. 5,000 hours handed back to the company.',
    pt: 'Um desenvolvedor. 900 classes. 5.000 horas devolvidas à empresa.',
  },
  plain: {
    en: 'At Grupo Bel Cosméticos I designed, built and single-handedly maintain a Java system of 900+ classes that automates work people used to do by hand. Every window of this building is one of those classes. Light one: the ones it depends on light up too.',
    pt: 'No Grupo Bel Cosméticos eu projetei, construí e mantenho sozinho um sistema Java de mais de 900 classes que automatiza trabalho que antes era feito à mão. Cada janela deste prédio é uma dessas classes. Ilumine uma: as que dependem dela acendem junto.',
  },
}

/** The Elixir case: a supervision tree of bulbs strung over the alley. */
export const SUPERVISED = {
  tag: 'LET IT CRASH',
  title: { en: 'Fault-tolerant Elixir services', pt: 'Serviços Elixir tolerantes a falhas' },
  line: { en: '99.98% of requests succeed', pt: '99,98% das requisições com sucesso' },
  hook: { en: 'Things will break. The system just doesn’t notice.', pt: 'Coisas vão quebrar. O sistema simplesmente não percebe.' },
  plain: {
    en: 'Services I built in Elixir at Grupo Bel around one idea, “let it crash”: when a piece fails, a supervisor restarts it instantly, so the whole never goes down. Go ahead: break a bulb.',
    pt: 'Serviços que construí em Elixir no Grupo Bel em torno de uma ideia, “deixe quebrar”: quando uma peça falha, um supervisor a reinicia na hora, e o todo nunca cai. Vá em frente: quebre uma lâmpada.',
  },
}

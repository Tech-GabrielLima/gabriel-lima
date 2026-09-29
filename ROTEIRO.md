# SESSÃO NOTURNA
### Um curta interativo em 3D — roteiro de direção do portfólio

> **Premissa:** toda noite, num cinema esquecido, um projetor 8mm liga sozinho.
> O filme que passa é a sua carreira. O visitante é o projecionista, e **o cursor é a luz**.

---

## Sobre o diretor (o protagonista do filme)

| | |0
|---|---|
| **Nome** | Gabriel Lima, 22 anos |
| **O que faz** | Engenheiro full stack: front e back fortes, e desce até o metal (compiladores, GPU, sistemas distribuídos) |
| **Experiência** | 4 anos na área: **8+ empresas como freelancer** e **~3 anos CLT como Full Stack no Grupo Bel Cosméticos** |
| **Áreas** | Dados · Backend · Frontend · Automações (e pesquisa em sistemas de baixo nível) |
| **Frase-assinatura** | *"Eu não apenas construo. Eu imagino."* · EN: *"I don't just build. I imagine."* |
| **Tagline do filme** | **Do pixel ao silício** · EN: **From pixel to silicon** |
| **GitHub** | [github.com/Tech-GabrielLima](https://github.com/Tech-GabrielLima) |
| **Contato** | `port.gabriel.lima@gmail.com` · WhatsApp **+55 81 99619-9997** · sem LinkedIn |
| **Disponível para** | Vagas **e** freelas |
| **Logo** | Monograma **GL "Laço"**, um traço contínuo ([design/logo/gl-a-laco.svg](design/logo/gl-a-laco.svg)) |
| **Idiomas do site** | Bilíngue: inglês por padrão, botão PT (os READMEs já são EN/PT) |
| **Público** | Recrutadores, clientes freelance e júri do Awwwards/comunidade |

### O arco do filme: descer as camadas

O roteiro funciona em **dois eixos ao mesmo tempo**. A regra de interação é *a luz*, e o arco narrativo é **a descida**: o filme começa na superfície (a interface, o que o usuário vê) e desce, cena a cena, até o silício. É o seu posicionamento contado como viagem, **full stack de verdade, do pixel ao transistor**.

| Cena | Camada da stack | Metáfora espacial |
|---|---|---|
| 01 Cabine / 02 Estúdio | **Interface e produto**: onde a ideia vira tela | acima do chão, luz de tela |
| 03 Beco | **Backend, dados e automações**: onde os sistemas vivem e trabalham | nível da rua, portas fechadas, prédios com mil janelas |
| ↓ o bueiro | *descer abaixo da superfície* | literalmente |
| 04 Travessia | **Sistemas distribuídos**: consenso, redes, nós distantes | o mar, faróis que conversam |
| 05 Lua | **O metal**: GPU, compiladores, física | o lugar mais distante e cru |
| 06 Créditos | volta à superfície: *"e eu faço tudo isso junto"* | o cinema |

---

## 0. A ideia central (leia isto antes de tudo)

Portfólios 3D premiados costumam ter **uma regra de interação que vale para tudo**. No Bruno Simon é "você é o carro". No Igloo Inc é "tudo é gelo e partículas que se transformam". A nossa é:

### **"Nada existe até a luz tocar."**

Em **todas** as cenas o cursor é uma fonte de luz diferente: o feixe do projetor, uma luminária, uma lanterna, um lampião, o próprio Sol. O visitante não *clica em links*, ele **ilumina coisas para descobri-las**. Isso resolve três coisas de uma vez:

1. **Coerência.** Sete ambientes muito diferentes parecem um único filme.
2. **Exploração.** Existe sempre algo escondido no escuro, então o visitante tem motivo para passear o cursor.
3. **Performance.** Cenas escuras permitem esconder o LOD, carregar pouca geometria e gastar o orçamento em *uma* luz bonita.

### Os dois modos de assistir

| Modo | Como funciona | Para quem |
|---|---|---|
| **▶ Assistir** (padrão) | O curta roda sozinho, ~3m30s, com câmera coreografada. A barra inferior é um **player de filme** com os capítulos marcados. | Recrutador com pressa |
| **◎ Explorar** | Scroll/arraste controla a timeline. A câmera solta dentro de cada cena permite órbita curta (±15°) e zoom nos objetos iluminados. | Quem quer brincar, e o júri do Awwwards |

O player é a UI do site inteiro: *timecode*, capítulos, som on/off, legenda (CC) e o botão **"pular para os créditos"** (= contato). Assim a navegação continua usável sem quebrar a ilusão de cinema.

### 0.1 A noite inteira: os três atos (v3)

O curta 3D deixou de ser o site inteiro e virou **a sessão**. Em volta dele existe a noite no cinema: chegar pela rua, comprar o ingresso, passar pela porta, assistir, e sair com as luzes acesas.

| Ato | Formato | No cinema | Função real |
|---|---|---|---|
| **I. A Fachada** | 2D com elementos 3D | letreiro, cartaz, bilheteria, a porta | pinta na hora, SEO, o recrutador entende tudo aqui, **e o 3D baixa e compila por baixo** |
| **II. O Filme** | 3D (as cenas 00–07) | a sessão | a experiência, com os projetos **rodando de verdade** dentro das cenas |
| **III. Luzes Acesas** | 2D | saída, ficha técnica | catálogo com demos ao vivo, "sala de máquinas" (métricas do backend), contato |

**O fio condutor:** o monograma GL é um traço contínuo. Na abertura ele se desenha no ritmo do carregamento, o nome é datilografado embaixo, e a mesma linha segue pela página até **desenhar o contorno da porta**. A luz âmbar que vaza por baixo da porta é a barra de progresso do 3D; a porta só abre quando o filme está pronto, e o clique nela é o gesto que liga o áudio.

### 0.2 O Raio-X: do pixel ao silício, literalmente

A tagline deixa de ser metáfora. Segurando **R** (ou o botão ◉ Raio-X do player), o quadro **descasca** pela pilha do próprio site, ao vivo, em seis camadas: **Pixel** (uma lente amplia os pixels reais e lê a cor exata sob o cursor) → **Geometria** (a cena em wireframe, com triângulos e chamadas de desenho do quadro) → **Shader** (o wireframe vira caracteres, que se decodificam no código real do shader da película, com os valores ao vivo e a luz que você segura) → **Rede** (os pacotes SSE do servidor caem como colunas de luz, cada um com o seu texto real) → **Servidor** (o Java do cluster Raft, as linhas acendem quando o líder muda) → **Silício** (uma fotografia de chip com pulsos no ritmo do tempo real da GPU, medido com `EXT_disjoint_timer_query`).

**A transição é a cena:** cada camada nova queima a anterior a partir de onde está a luz do visitante (a mesma regra do site: nada existe até a luz tocar), com a borda quente do *film burn*. Tudo num único shader (`src/xray/XrayEffect.ts`), 60 fps no desktop e no celular.

**Ninguém perde:** uma vez por visitante, a película sofre uma **falha de projeção** no começo do Beco: por ~1,7 s ela rasga em faixas que mostram o wireframe e o código por baixo, e depois o player sugere *"segure R para ver o resto"*.

**Projetos ao vivo (Ato II):** WASM/Pyodide/WebGPU para o que roda sozinho (hale, flight, nabla, LLM); um backend Elixir/Phoenix (Channels + Presence) só para o que é compartilhado entre visitantes: o livro de ofertas do matching engine no beco, os faróis como nós Raft reais, a plateia ao vivo nas poltronas. Projetos de front aparecem nas telas como vídeo e, no clique, a câmera entra na tela e troca o vídeo por um iframe real.

---

### 0.3 As salas atrás das portas

Algumas portas do beco têm uma **sala** atrás: um cenário amplo, com câmera livre (arrastar, roda/pinça, dois cliques para voar até algo), onde o projeto vira espetáculo. Na legenda da porta aberta aparece **Entrar na sala ▸**; a cortina desce, a sala monta atrás dela e o filme fica em pausa. **Esc** (ou ← Voltar ao beco) devolve à mesma porta aberta. Link direto: `?room=<id>`.

Os modelos vêm só de fontes livres (Poly Haven CC0), de geometria feita no código ou dos scripts do Blender. **Nada do Sketchfab.**

- **Sala 01 · flight: A Caixa-Preta.** Um hangar de investigação à noite. A caixa-preta laranja fica na mesa, e o anel de eventos (PY_START / LINE / RAISE, em tempo lógico) fica em pé atrás dela. Tudo segue o exemplo do README:
  - "Reproduzir o crash" roda o anel até o ZeroDivisionError e levanta os frames (crash primeiro) e o grafo de objetos, em que `numbers` e `data` são a mesma lista vazia (↔);
  - "Perguntar por quê" acende a cadeia do `why --var numbers`, linha por linha;
  - "Provar a correção" reexecuta até `⇒ FIX VERIFIED`.
- **Sala 02 · hale: A Catedral.** Uma nave gótica feita no código:
  - os 7 vitrais da ala esquerda são o pipeline do README (lexer → parser → AST → tipos → IR → otimizador → executor em ondas). "Compilar" acende um por um, com o que cada estágio faz do programa `Dashboard` do README numa placa embaixo;
  - a rosácea é o grafo de dependências;
  - "Rodar em série / em ondas" manda as requisições como luz até a rosácea, com o benchmark real (6 fetches: 620,1 ms → 104,7 ms, 5,92×), 10× mais lento para se ver;
  - "Tirar o tratamento de erro" para a compilação no vitral dos tipos, em vermelho, com o erro verbatim do repositório.
- **Sala 03 · raft-kv-store: O Arquipélago** (a primeira). Cinco faróis (feitos no código) em ilhas de pedra do Poly Haven, num mar noturno. Cada farol é um nó do cluster Raft **ao vivo** (o servidor no Render, com a simulação local quando está offline):
  - o líder varre o mar com o feixe e os seguidores apontam para ele;
  - os batimentos cruzam a água em arcos e cada commit replicado solta um anel;
  - um nó derrubado (clique no farol) some na neblina, com a contagem até voltar;
  - a eleição toca um sino e escreve **mandato N** na tela;
  - "✉ Mandar uma mensagem ao líder" faz uma proposta real e mostra o índice confirmado.
  - Há quatro planos de diretor (teclas 1–4). No retrato, a câmera recua e abre a lente.
- **Sala 04 · lowlatency-matching-engine: O Pregão.** O livro de ofertas do engine **ao vivo** como uma cidade à noite, tudo feito no código (só o asfalto e o céu vêm do Poly Haven):
  - a avenida molhada é o spread; as compras ficam à esquerda (âmbar) e as vendas à direita (ciano), um prédio por nível de preço, com os melhores preços na frente;
  - cada andar aceso é um lote na fila;
  - cada negócio é um raio atravessando a avenida e consome o prédio **por baixo** (prioridade preço-tempo: os lotes mais antigos saem primeiro), enquanto o resto do prédio desce;
  - no céu gira o **ring buffer do Disruptor**: um slot acende a cada ordem e um único cursor (1 thread, 0 locks) vai atrás.
  - O visitante negocia de verdade: "Comprar 5 a mercado" / "Vender 5", ou um clique num prédio põe uma ordem limitada naquele preço. Os andares brancos são a ordem dele subindo a fila ("5 · 3 à frente") até ser executada.
  - Offline, um livro simulado localmente (`rooms/match/sim.ts`) faz o mesmo show.
- **Sala 05 · event-sourced-ledger: O Cofre.** Um cofre com porta blindada redonda e paredes de cofres de aluguel. As 8 contas são pilhas de moedas; o saldo do SYSTEM desce num poço no centro, e "Σ = 0" fica sempre aceso em cima. A simulação segue a saga do repositório, com os nomes reais dos eventos, escritos na parede do event store:
  - "1000 transferências simultâneas" é o teste de concorrência: termina em `1000/1000 transfers completed, money conserved exactly (total=1000000)`;
  - "Repetir a mesma chave" mostra a Idempotency-Key: o replay não move nada;
  - "Falhar no meio" mostra a compensação da saga;
  - clicar numa conta e depois noutra faz uma transferência.
- **Sala 06 · nabla + nano-llm: A Rede.** O MLP do nabla para dígitos 8×8 (64→128→64→10) roda no navegador, com pesos treinados para a sala no mesmo dataset (98,9% em 360 dígitos de teste; o README cita 98,6%), guardados em `public/data/nabla-mlp.json`.
  - O visitante desenha no quadro: o forward acende camada por camada até a resposta.
  - "Ensinar: era um…" manda o gradiente de volta em rosa e dá um passo real de SGD.
  - As placas trazem os números do nabla e do nano-llm.
- **Sala 07 · cuda-kernels-from-scratch: O Silício.** Dentro de um die de GPU: 80 SMs, HBM, L2, e C = A × B sobre o chip.
  - As 5 versões do GEMM do repositório mudam o jeito do chip trabalhar: leituras espalhadas (v1), feixes coalescidos (v2), tiles em shared (v3), micro-tiles em registradores (v4), Tensor Cores (v5).
  - O repositório **não publica medições**; a sala mostra as faixas típicas que o próprio README cita e diz isso.
- **Sala 08 · próxima sessão: Em Obras.** Um canteiro de obras que é também set de filmagem: grua de torre em treliça, andaimes, refletores de cinema, câmera no trilho e claquete.
  - Cada "Ação!" é um take: a grua pega uma laje e assenta o próximo andar.
  - Os três grupos de andares são os repositórios em pesquisa (front-end, node, android).

---

## 0.4 Parte II: "Quem liga o projetor?" (v4)

A premissa sempre teve uma pergunta sem resposta: *o projetor liga sozinho*. A Parte II transforma essa pergunta no mistério da noite inteira, e junta tudo que é descoberta, tecnologia e humor numa história só.

- **O mistério:** quem liga o projetor toda noite?
- **A revelação do meio:** o cinema é um computador. O prédio roda num sistema operacional, o **GL-OS**, que roda **de verdade dentro do navegador**. Tudo no cinema é um arquivo (o letreiro, as portas, a luz, o projetor) e o lanterninha é um processo.
- **A resposta final:** ninguém liga o projetor, todo mundo liga. O operador de cada sessão é o visitante anterior.

### 0.4.1 Os três atos, cada um uma camada

| Ato | Camada | Frase | Terminal | Usuário |
|---|---|---|---|---|
| **I · A Fachada** | a superfície, o que é público | *o que você vê* | o caixa da bilheteria | `caixa` (shell restrito) |
| **II · O Filme** | a história e os projetos | *o que eu fiz* | o computador da cabine (C01) | `visitante` |
| **III · Luzes Acesas** | os bastidores | *como é feito* | o console da Sala de Máquinas | `root` |

O sistema é um só, e o acesso sobe a cada ato: a escalada de privilégio é a progressão. **O final volta ao Ato I**, na porta que estava ali desde o primeiro segundo. A **Sessão Comentada** (depois do fim) é um modo que passa pelos três atos, não um quarto ato.

### 0.4.2 As regras

1. Todo segredo ensina algo real.
2. Todo sistema serve a pelo menos duas coisas.
3. Humor em 5%, sempre pela voz do **lanterninha**.
4. O recrutador entende tudo em 30 segundos (a bilheteria é a **Sessão Expressa**).
5. Nunca invasivo: o site comenta o que você fez no site, nunca quem você é. Identificador anônimo, nenhum IP guardado, nenhum fingerprinting, só dados agregados.
6. Real acima de simulado, e o que for simulado vem avisado.
7. **Tudo é um arquivo.**

### 0.4.3 A espinha (atravessa os três atos)

- **48 fotogramas perdidos:** os 2 segundos cortados do filme (48 quadros a 24 fps). Cada falta aparece como um piscar preto com marca de emenda quando o filme passa por ela, e como uma falha minúscula na timeline do player. A lista está em [cinema/frames.json](cinema/frames.json), a fonte única que o site e o servidor leem.
- **O ingresso é um cartão perfurado.** Cada descoberta abre um furo; com os 48 ele codifica em bits a sua run e é a chave da Cabine 0.
- **O progresso é um log de eventos, não um estado.** O servidor ([cinema/](cinema/), Cloudflare Worker + Durable Object com SQLite, em Rust) reexecuta o log e decide o que vale: fotograma conhecido, já construído, em ordem, com tempo assistido suficiente. É o princípio do `event-sourced-ledger`: o anti-cheat, o replay final, o speedrun e o `Σ = 0` do Cofre são o mesmo mecanismo.
- **Ingresso Falsificado:** quem forja o progresso (editar o `localStorage`, inventar eventos) recebe **"No."**, o progresso volta ao que o servidor aceitou, e o ingresso ganha o carimbo **FALSIFICADO**, que vira um troféu (um fotograma "que não existe").
- **O lanterninha:** o funcionário da lanterna. Concentra todo o humor, que é preditivo com números reais (*"87% das pessoas clicam aqui."*).
- **O coletivo:** números sempre reais (visitantes, exploradores, conclusões, recorde, última conclusão) e rastros de quem veio antes em todos os atos.

### 0.4.4 Ato I · A Fachada: *"o que você vê"*

**Ambientes:** a rua com letreiro e o céu real de Recife (fase da Lua calculada, a ISS quando passa); a bilheteria (Sessão Expressa + terminal do caixa); o saguão com o fliperama, o órgão de cinema e a gaveta de canhotos; a porta da Sala 1; a Sala 2 "EM BREVE"; a porta **CABINE 0 · SOMENTE PESSOAL AUTORIZADO** com a leitora `0/48`.

**Tecnologia real:** PGlite (Postgres em WASM, roles e GRANTs de verdade) no caixa; um emulador escrito pelo Gabriel (CHIP-8 ou Game Boy, Rust → WASM) com um jogo dele, Gamepad API e recorde global; o órgão em Web Audio com Web MIDI; `curl` no domínio devolve o portfólio em ANSI (middleware por User-Agent) e um `TXT` secreto no DNS; offline, o service worker apaga o lobby e abre a sala do gerador; título e favicon da aba mudam quando você sai; Ctrl+P imprime o currículo. Nada dos runtimes entra na primeira carga.

**Fotogramas (11):** 1 tentar abrir a Cabine 0 (de graça) · 2 a lâmpada do letreiro em Morse · 3 sair da aba e voltar · 4 Ctrl+P · 5 o canhoto #1 · 6 pontuar no fliperama · 7 ouvir o Filme Coletivo atrás da Sala 2 · 8 NÃO CLIQUE / SÉRIO. NÃO CLIQUE. · 9 Konami · 10 `SELECT * FROM segredos` → `permission denied` (a senha só existe no Ato II) · 11 o `dig TXT` (um comando que só funciona no Ato III).

### 0.4.5 Ato II · O Filme: *"o que eu fiz"*

**Ambientes:** as cenas 00–07, as 8 salas, **o computador do projecionista** (C01) e a **Oficina do Projetor**. O `projetor.log` registra `sessão iniciada · operador: —`.

**GL-OS:** kernel num Worker com tabela de processos real (cada programa é um Web Worker), syscalls síncronas via `SharedArrayBuffer` + `Atomics`, pipes entre linguagens (`cat x.csv | python m.py | duckdb`), um sistema de arquivos único (OPFS, copy-on-write) montado em todos os runtimes. O mundo 3D é um sistema de arquivos: `/cinema/beco/portas/<id>`, `/cinema/luz`, `/cinema/projetor/controle.py`, `/proc/self/eventlog`, `/dev/gpu`, `/dev/lanterninha`, `/srv/cinema/*` (o backend global como arquivos, estilo Plan 9). O **GL Navigator** é um navegador dentro do navegador: o próprio site com um DevTools próprio, sites da allowlist por um motor de renderização próprio (pesquisa) e a recursão do site dentro do site.

**Comandos (usuário `visitante`):** uutils coreutils (Rust → WASI); `python`/`pip install pyflight`/`pdb` (Pyodide, com o flight real compilado para Emscripten); `go run` (Yaegi); `java -jar` (CheerpJ ou TeaVM); `cc` (clang em WASM); `cargo build` (compila de verdade pela API do Godbolt, e avisa que é remoto); `node` (WebContainers, a confirmar licença); `hale`; `vim` (vim.wasm); `curl`/`ping`/`traceroute`/`dig` com rede real (DoH); `neofetch` com o hardware real; `sudo` ("este incidente será reportado", e é: o contador aparece no Ato III); `exit` → *"Você não terminou."*; `shutdown` → *"Não."*

**A Oficina do Projetor:** o filme é controlado por `controle.py` rodando no Pyodide (mudar `FPS = 12` muda o filme de verdade). O projetor trava com um bug real, e o visitante conserta com o relatório do flight, `flight why`, `pdb` e vim.

**As salas com runtime real:** flight real no Pyodide; o hale real; Raft em que **cada aba é um nó** (BroadcastChannel + Web Locks), os outros visitantes também (WebRTC), o servidor como âncora, e um model checker de TLA+ (pesquisa); o engine do match também na aba (TeaVM), para comparar µs locais contra ms de rede; o Cofre sobre PGlite; o nano-llm em WebGPU; o GEMM v1–v5 em WGSL medido na GPU do visitante, e o CUDA compilado para PTX/SASS pelo Godbolt; "Ação!/Corta!" por voz em Em Obras.

**O navegador como parte do filme:** as lanternas dos outros visitantes varrendo o beco (WebRTC); Compute Pressure esquenta o projetor; dois monitores viram panorama; o lanterninha em Picture-in-Picture (opt-in); o RTT medido gasta a película; o grão acompanha o total global de exibições.

**Fotogramas (26):** 12 aranha · 13 ligar o computador · 14 `projetor.log` · 15 sair do vim · 16 `sudo` · 17 consertar o projetor · 18 gotas · 19 a chuva escreve · 20 rato · 21 R durante a falha de projeção · 22 o bueiro antes da câmera · 23–30 um por sala (flight crasha o gravador; hale compila `projetor`; raft com 3 abas derrubando o líder; wash trade no match; `UPDATE` barrado pelo `Σ = 0`; v5 medido na sua GPU; o LLM escreve sobre o cinema; a claquete no meio do take) · 31 baú · 32 o farol que pisca o seu número em binário · 33 bandeira · 34 o espectrograma do silêncio da Lua (a senha do fotograma 10) · 35 telefone · 36 pato · 37 rebobinar os créditos.

### 0.4.6 Ato III · Luzes Acesas: *"como é feito"*

**Ambientes:** a **Sala de Máquinas** (cada rack é um runtime vivo: Python, Go, Java, Elixir, Rust, C, Linux, Postgres, DuckDB, Redis; LEDs e telas com a atividade real dos Workers; os racks só carregam quando acesos), com o tracing real do último clique (navegador → Vercel → Worker → Durable Object → Render) e o Chaos Panel (latência, perda e partição injetadas de verdade); o **console root**; a **Caldeira** (árvore de supervisão real em Elixir no Popcorn: *"foi assim que eu fiz serviços com 99,98% de sucesso"*); a **Sala de Montagem** (o código do portfólio clonado com isomorphic-git e recompilado dentro do site com esbuild-wasm; o patch pode virar um PR); **O Transistor** (a GL-1, uma CPU de 8 bits projetada do zero e simulada porta por porta no WebGPU, com `glasm`); o mural de canhotos e a placa de estatísticas.

**Comandos root:** `linux` (v86), `docker run alpine` (container2wasm, pesquisa), `redis-cli` (um mini-Redis próprio, Rust → WASM, RESP), `duckdb` nos dados públicos do site (Parquet diário), `ps`/`kill`/`who`/`wall`/`last`/`uptime`/`top` com dados reais, `rm -rf /` que roda de verdade e volta em 3 s (copy-on-write).

**Fotogramas (11):** 38 `kill` no lanterninha (volta com outro PID) · 39 `who` + `write` · 40 `echo off > /cinema/luz` · 41 o supervisor da Caldeira desiste · 42 partição no Chaos Panel sem o cluster cair · 43 `rm -rf /` · 44 o branch `projecionista` · 45 recompilar o site · 46 o site dentro do site até a profundidade 3 · 47 um programa na GL-1 · 48 o COMPLETION #1.

**Humor:** `sudo` como root → *"Você já é root. Por que sudo?"*; `echo open > /cinema/fachada/cabine0` → *"Nem root abre essa porta. Só os 48."*

### 0.4.7 As dependências entre os atos

```
ATO I  ── senha do Postgres ───────► resolvida no ATO II (espectrograma da Lua)
ATO I  ── comando do dig TXT ──────► só funciona no ATO III (console root)
ATO II ── projetor.log aponta ─────► os bastidores do ATO III
ATO II ── bueiro (atalho secreto) ─► a Sala de Máquinas do ATO III
ATO III ─ root não abre a porta ───► volta ao ATO I (Cabine 0)
```

### 0.4.8 O final: a Cabine 0

Com 48/48 o filme passa com os 2 segundos restaurados: uma silhueta na janela da cabine. O cartão perfurado entra na leitora do lobby, é lido bit por bit, e a porta abre.

1. **O filme era sobre você:** a sua sessão inteira em 8mm, reexecutada do log de eventos, com a sinopse escrita pelo nano-llm na sua GPU e o lanterninha narrando as estatísticas.
2. O replay baixado como MP4 real (WebCodecs).
3. Você vira um fotograma do **Filme Coletivo** (uma pose de câmera + um instante, ~30 bytes, renderizado por cada navegador: sem moderação).
4. O ingresso assinado (Ed25519 + passkey) e um PR no `hall-of-explorers` que uma GitHub Action verifica e faz o merge.
5. A janela para o lobby: quem está chegando agora, e uma mensagem de vocabulário fechado para essa pessoa.
6. A carta do Gabriel e o código de conclusão (*"mande este código e eu respondo primeiro"*).

No `projetor.log`: `sessão #N+1 iniciada · operador: explorer #M`.

**Depois do fim:** a Sessão Comentada (os comentários do diretor e 12 descobertas técnicas), a Sessão Relâmpago (speedrun validado no servidor, com o bueiro como atalho) e o branch `projecionista` com um único commit datado de 2036.

**Os extras (`48 + ?`):** offline, controle ou MIDI, lua cheia, Sessão da Meia-noite, dois monitores, Ingresso Falsificado, voltar em outro dia, Sessão Lotada (10 online), e os marcos coletivos (24 conclusões mudam o letreiro; 240 estreiam a Sala 2; 1.440 tornam a Sessão da Meia-noite permanente).

### 0.4.9 Viabilidade

| Nível | O que é |
|---|---|
| Fim de semana | PGlite, Pyodide, coreutils, vim, git, DuckDB, rede no terminal, Raft entre abas, WebCodecs, `curl` ANSI, céu de Recife |
| Semanas | o kernel com pipes, "tudo é arquivo", a Oficina do Projetor, CUDA em WGSL, a Sala de Montagem, v86, Raft por WebRTC, o anti-cheat, o Filme Coletivo |
| Pesquisa | LLM em WebGPU, a GL-1, o motor do navegador, TLA+, Docker, Popcorn/Elixir |
| A confirmar | licenças do WebContainers e do CheerpJ, maturidade do Popcorn, limites da API do Godbolt, limites do plano grátis da Cloudflare |

---

## 1. Linguagem visual (o "look" do filme)

- **Paleta:** preto-azulado profundo `#07080C`, âmbar de tungstênio `#FFB36B` (a luz do cursor) e um acento por cena (ciano neon, verde-mar, branco lunar). Uma única cor quente contra o frio da noite, o tempo todo.
- **Película:** pós-processamento fixo em todas as cenas: grão de filme animado, vinheta, leve *gate weave* (o quadro treme 0,5px, como num projetor real), aberração cromática só nas bordas e *halation* (brilho avermelhado em volta das luzes fortes, típico da película).
- **Formato:** letterbox 2.39:1 no desktop. As barras pretas "abrem" para 16:9 no modo Explorar, e essa transição já diz ao usuário que agora ele controla.
- **Tipografia:** uma serifada de cartela de cinema para títulos (ex.: *Fraunces* ou *Instrument Serif*) e uma mono para timecodes e créditos (ex.: *JetBrains Mono* / *IBM Plex Mono*).
- **Transições:** nunca um *fade* genérico. Cada passagem é física: atravessar a tela, a janela, o bueiro, o reflexo da lua (detalhes em cada cena).
- **A cortina (v3):** nenhuma troca de cena mostra espera. No fim de cada cena, enquanto a passagem física ainda acontece, **uma cortina de veludo desce** (em 2D, animada no compositor, então continua lisa mesmo com a GPU travada compilando). Atrás dela a cena seguinte baixa, compila e desenha os primeiros quadros; ela **só sobe quando está tudo pronto**. Nela, uma cartela de cinema mudo apresenta o capítulo que vem e o que a luz faz nele, e a luz que vaza por baixo é o progresso real. Pular capítulos no player usa a mesma cortina, mais rápida.

### 1.1 O logo (criar)

Como você não tem logo, ele nasce **do próprio filme**: um monograma **GL** desenhado com **um único traço contínuo**, como um tubo de neon dobrado (é assim que ele aparece no beco). A mesma linha tem que funcionar como:
- **neon** no beco (tubo 3D com a curva do SVG),
- **gotas** formando o desenho na janela (Cena 02),
- **bandeira** na Lua (Cena 05),
- **favicon** e **marca d'água** no canto do player, como o logo de uma distribuidora de cinema no início do filme.

✅ **Escolhido: A · Laço**: o L sobe e se dobra por cima, formando a barriga do G. As 3 opções estão em [design/logo/preview.html](design/logo/preview.html).

---

## 2. As cenas

Legenda de cada cena: ⏱ duração no modo Assistir · 🎯 conteúdo do portfólio · 💡 luz · 🎥 câmera · 🖱 cursor · 🔊 som · 🥚 easter egg · ➜ transição

---

### CENA 00: CONTAGEM (o loader)
⏱ 5–8s (o tempo real de carregamento) · 🎯 nenhum, só expectativa

A tela é um *film leader* 8mm clássico: círculo com o ponteiro girando e os números **8… 7… 6…**, desenhado em shader com arranhões e poeira. **O progresso do carregamento É a contagem.** Se carregar rápido, a contagem acelera; se travar, o número "pula" como filme mal enrolado.

No "2", a contagem para e aparece o texto: *"Ligue o projetor"*, com um interruptor de baquelite. **Esse clique é obrigatório**: libera o áudio (os navegadores exigem um gesto do usuário) e é o primeiro ato de "você é o projecionista".

🔊 Clique seco do interruptor → o motor do projetor ganha velocidade → *clack-clack-clack* ritmado.
➜ Flash branco superexposto, como a ponta queimada do rolo.

---

### CENA 01: A CABINE
⏱ 20s · 🎯 nome + título: **"Gabriel Lima, Full Stack Engineer. Do pixel ao silício."**

O que o feixe revela na parede, em ordem (letras de lambe-lambe, como pôster de cinema):
1. `GABRIEL LIMA` (grande, centro)
2. `FULL STACK ENGINEER · 4 ANOS` (menor, embaixo)
3. `"Eu não apenas construo. Eu imagino."` (pichado à mão, canto)
4. Um pôster velho: **"SESSÃO NOTURNA: um filme de Gabriel Lima"**

**Ambientação:** cabine de projeção minúscula, paredes de concreto velho, pôsteres descascados. No centro, o herói: **o projetor 8mm**. Pela janelinha da cabine se vê a sala de cinema vazia lá embaixo.

💡 **Luz:** a única luz forte é o feixe do projetor, volumétrico e cheio de **poeira em suspensão** (partículas na GPU, que só brilham dentro do cone). Uma lâmpada nua pendurada pisca fraca ao fundo. HDRI quase apagado, só para reflexos no metal.

🖱 **Cursor = direção do feixe.** O projetor está num tripé e **gira acompanhando o mouse** com inércia (spring). Onde o feixe bate na parede, revela o que está pintado nela: seu nome em letras de lambe-lambe, um "EST. 20XX", rabiscos. Fora do feixe a parede é preta. A poeira reage à velocidade do mouse (movimento rápido gera um redemoinho).

🎥 **Câmera:** abre num close macro do rolo girando (profundidade de campo rasa), faz *dolly-out* lento até enquadrar o projetor e termina atrás dele, olhando na direção do feixe.

🔊 Motor do projetor (loop), zumbido elétrico e um ruído de sala vazia bem baixo.

🥚 Ilumine o canto superior direito por 3s e aparece uma aranha na teia (easter egg nº 1 da contagem de 7, veja a seção 5).

➜ **Transição:** a câmera "entra" no feixe e voa ao longo da luz, atravessa a janelinha e desce até a tela do cinema. A tela mostra a Cena 02 (render target). A câmera **atravessa a tela** e o tecido da tela se rasga em partículas de luz.

**Assets:**
- [filmstrip_projector_8mm](https://polyhaven.com/a/filmstrip_projector_8mm): o herói (32k polys, ~3 MB). As bobinas precisam girar: se já forem nós separados no glTF, animamos direto; se não, separamos por script com gltf-transform.
- [caged_hanging_light](https://polyhaven.com/a/caged_hanging_light), [pull_chain_light_socket](https://polyhaven.com/a/pull_chain_light_socket)
- [cardboard_box_01](https://polyhaven.com/a/cardboard_box_01), [metal_stool_01](https://polyhaven.com/a/metal_stool_01): cabine bagunçada
- Texturas: [concrete_wall_004](https://polyhaven.com/a/concrete_wall_004), [concrete_floor_worn_001](https://polyhaven.com/a/concrete_floor_worn_001)
- HDRI: [studio_small_09](https://polyhaven.com/a/studio_small_09) com intensidade 0.05, só reflexo

---

### CENA 02: O ESTÚDIO (Sobre mim)
⏱ 30s · 🎯 quem você é, o que faz, uma foto/avatar, 3 frases

**Ambientação:** seu estúdio de madrugada, 3h da manhã. Mesa de metal, laptop aberto, blocos de nota, grampeador, caneca, relógio de parede. **Chove** na janela grande; lá fora, a cidade à noite desfocada. É íntimo, o "bastidor" de quem faz o filme.

💡 **Luz:** a luminária articulada é a key light, quente. A tela do laptop dá um preenchimento azulado frio no rosto invisível de quem estaria ali. A cidade lá fora (HDRI) entra pela janela como rim light azul, e as gotas escorrendo projetam **sombras de chuva animadas** sobre a mesa (textura de *caustics* de água no *light cookie*).

🖱 **Cursor = a luminária te segue.** A [desk_lamp_arm_01](https://polyhaven.com/a/desk_lamp_arm_01) **já vem com rig** no Poly Haven. Com IK, a cabeça da luminária persegue o cursor como a luminária da Pixar. O que ela ilumina "acorda":
- **Bloco de notas:** a luz revela sua bio escrita à mão, com animação de caneta escrevendo (SDF text + reveal). Rascunho da bio:
  > *22 anos. 4 construindo software de ponta a ponta: a interface que você toca, a API que responde, o banco que não perde um centavo. E quando a ferramenta não existe, eu escrevo a ferramenta: compilador, kernel de GPU, algoritmo de consenso. Eu não apenas construo. Eu imagino.*
- **Laptop:** mostra um terminal **real**, digitando sozinho: `pip install pyflight` → um crash → `flight inspect` explicando o bug. É o seu projeto rodando dentro do filme.
- **Relógio:** mostra a **hora real do visitante**, com os ponteiros sincronizados.
- **Polaroid presa no monitor:** sua foto, que ganha cor quando iluminada (dessaturada fora da luz).

🎥 **Câmera:** plano médio fixo, levemente *handheld* (ruído suave na posição). No modo Explorar, clicar num objeto faz *push-in* nele.

🔊 Chuva no vidro (estéreo, panorama segue a câmera), trovão distante raro, *lo-fi* baixinho saindo do laptop, clique da luminária ao mover.

🥚 Desligue a luminária (clique nela): na escuridão, as gotas da janela formam o seu logo por 2s.

➜ **Transição:** um relâmpago estoura tudo em branco e a câmera se aproxima da janela. Uma gota escorre em close, e **dentro da gota refratada** aparece o beco. A câmera atravessa a gota.

**Assets:**
- [metal_office_desk](https://polyhaven.com/a/metal_office_desk) (1,6 MB), [desk_lamp_arm_01](https://polyhaven.com/a/desk_lamp_arm_01) (rigged), [classic_laptop](https://polyhaven.com/a/classic_laptop) (2,2 MB)
- [office_notepads](https://polyhaven.com/a/office_notepads), [vintage_stapler](https://polyhaven.com/a/vintage_stapler), [stationery_supplies](https://polyhaven.com/a/stationery_supplies), [wall_clock](https://polyhaven.com/a/wall_clock)
- [modern_arm_chair_01](https://polyhaven.com/a/modern_arm_chair_01), [potted_plant_02](https://polyhaven.com/a/potted_plant_02)
- HDRI (vista da janela): [unfinished_office_night](https://polyhaven.com/a/unfinished_office_night) ou [rooftop_night](https://polyhaven.com/a/rooftop_night)

---

### CENA 03: O BECO (Projetos) ★ a cena-vitrine
⏱ 90s (a mais longa) · 🎯 2 casos profissionais + os 7 projetos do GitHub + a porta "em obras"

**Ambientação:** um beco urbano molhado, estilo *neo-noir*. Fachadas de tijolo, escadas de incêndio, portas de aço de enrolar, poste de luz, hidrante, câmeras de segurança, placas de neon zumbindo. **O asfalto molhado reflete tudo** (esse é o plano que vai para o print do Awwwards).

**Cada porta de enrolar é um projeto.** Estão todas fechadas e pichadas com o nome do projeto.

💡 **Luz:** noite de ciano e magenta dos neons + âmbar do poste. Chão com *screen-space reflections* ou reflexo planar em asfalto com *roughness map* de poças. Neblina volumétrica baixa. HDRI noturno urbano só para os reflexos.

🖱 **Cursor = lanterna na mão.** Um cone de luz âmbar estreito. Ao iluminar uma porta:
1. A porta **sobe um palmo** com ruído metálico e deixa vazar a luz colorida do projeto lá dentro.
2. **Clique:** a porta sobe inteira e a câmera entra. Lá dentro, o projeto é exibido como **projeção na parede** (vídeo do case em textura de vídeo), mais 3 linhas de texto (papel, stack, resultado) e um link.
3. Sair: arraste para trás ou `Esc`. A porta desce.

#### As portas: cada projeto tem sua própria metáfora de luz

Atrás de cada porta não fica um "card de projeto", e sim **uma pequena instalação** que explica o projeto sem texto, usando a mesma regra da luz. O texto (papel, números, link) vem depois, projetado na parede.

| # | Porta (pichação) | Projeto | O que tem lá dentro | Número que brilha em neon |
|---|---|---|---|---|
| 1 | `FLIGHT` ★ | [flight](https://github.com/Tech-GabrielLima/flight): caixa-preta para Python (Rust + Python, no PyPI) | Uma **caixa-preta laranja** de avião. Ilumine-a e ela "rebobina": um rolo de filme mostra o último momento do programa antes do crash, quadro a quadro. **Crash replay = filme rebobinando**, a metáfora perfeita para este curta | `pip install pyflight` |
| 2 | `HALE` | [hale](https://github.com/Tech-GabrielLima/tired): linguagem compilada para APIs HTTP, em Rust | Um **prisma**: o feixe da lanterna entra como texto de código e sai decomposto em faixas (lexer → parser → type-check → IR → otimizador). Duas faixas se separam e correm em paralelo, mostrando a paralelização automática | `lexer → IR → runtime` |
| 3 | `RAFT` ★ | [raft-kv-store](https://github.com/Tech-GabrielLima/raft-kv-store): consenso Raft do zero | **5 lampiões** numa mesa, piscando em sincronia (heartbeat). Um brilha mais forte: é o líder. **Clique num lampião para "matar" o nó**: os outros piscam desordenados e elegem um novo líder ao vivo. Uma demo interativa real do algoritmo | `7 fases · 0 dependências` |
| 4 | `MATCH` ★ | [lowlatency-matching-engine](https://github.com/Tech-GabrielLima/lowlatency-matching-engine): motor de ordens estilo bolsa | Duas paredes de **barras de luz** (compra em âmbar, venda em ciano) avançando uma contra a outra. Onde se tocam, faísca (um trade). Um contador de letreiro de bolsa corre | `3.6M ordens/s · p99 ≈ 60µs` |
| 5 | `LEDGER` | [event-sourced-ledger](https://github.com/Tech-GabrielLima/event-sourced-ledger): razão financeiro com event sourcing | Um **cofre** com uma balança de dois pratos. 1000 moedas de luz voam entre contas ao mesmo tempo, e a balança nunca sai do zero | `1000/1000 · dinheiro conservado` |
| 6 | `NABLA` | [nabla-autograd](https://github.com/Tech-GabrielLima/nabla-autograd) + [nano-llm-inference](https://github.com/Tech-GabrielLima/nano-llm-inference) | Uma **rede neural de filamentos de neon**. A luz corre para frente (forward) e volta para trás mais fraca (backprop, o gradiente). No fim, a rede "fala" uma frase gerada pelo GPT-2 | `∇ ≈ 1e-7 vs PyTorch · KV-cache 3.9×` |
| 7 | `CUDA` | [cuda-kernels-from-scratch](https://github.com/Tech-GabrielLima/cuda-kernels-from-scratch) | Uma parede com **milhares de LEDs** (as threads). Eles se acendem em blocos, como tiles de GEMM, e a cada versão (naive → tiling → Tensor Cores) acendem mais rápido | `5 versões · vs cuBLAS` |
| 8 | `BEL · 900` ★ | **Caso profissional:** monólito Java de 900+ classes no Grupo Bel Cosméticos, criado e mantido sozinho | Esta não é uma porta, é **o prédio do fundo do beco inteiro**. A fachada tem **900+ janelas**, e cada janela é uma classe. A lanterna acende as janelas por onde passa, e as que dependem umas das outras acendem juntas (o grafo de dependências visto como um prédio à noite). *Nenhum código é mostrado, só a escala* | `900+ classes · 1 dev · ~5.000 h economizadas` |
| 9 | `LET IT CRASH` | **Caso profissional:** serviços em Elixir tolerantes a falhas | Uma **árvore de supervisores** feita de lâmpadas penduradas. O cursor pode quebrar qualquer lâmpada (ela estoura em faíscas) e **o supervisor acende uma nova no mesmo instante**. Quanto mais você quebra, mais rápido ela volta. O contador nunca cai | `99,98% das requisições com sucesso` |
| 10 | `EM OBRAS` 🚧 | Os repositórios de pesquisa que vêm aí (front, Node, Android) | Porta **meio aberta**, com fita zebrada e luz de solda piscando lá dentro. Ao iluminar: *"Próximas sessões: front · node · android"*. Cada novo repositório vira uma porta nova sem mexer no resto | `em breve` |

**No modo Assistir**, a câmera para em 4 pontos com ★: **o prédio BEL·900** (a experiência profissional, onde o recrutador precisa olhar), flight, raft e match. As outras aparecem de passagem, com a pichação legível. **No modo Explorar**, todas abrem.

**Cada projeto fala em três camadas** (em [src/content/projects.ts](src/content/projects.ts)): uma **frase de impacto** que qualquer pessoa entende, uma **explicação simples** para quem não é da área e, recolhido em "Como funciona", o **detalhe técnico** com a stack. Link direto por projeto: `?door=raft`.

**Conteúdo dos projetos vem de dados, não de código:** um `projects.json` com título, repo, número-destaque e texto EN/PT, gerado a partir da API do GitHub + edição manual. Novo repo = nova entrada = nova porta.

As **câmeras de segurança ([security_camera_01](https://polyhaven.com/a/security_camera_01), rigged!) giram seguindo o cursor**. Esse detalhe custa zero e o júri adora.

🎥 **Câmera:** travelling lateral lento ao longo do beco, guiado pelo scroll/timeline. Cada porta é uma "parada" com *snap*. Altura de olho humano, lente 35mm.

🔊 Zumbido de neon (cada placa com sua frequência, posicional), goteira, cachorro latindo longe, trânsito abafado. Ao abrir uma porta, a trilha do projeto entra filtrada (*low-pass* abrindo).

🥚 Aponte a lanterna para o bueiro por 2s: um **rato** ([street_rat](https://polyhaven.com/a/street_rat)) sai correndo e foge da luz, reagindo ao cursor. Siga-o e ele revela a próxima transição.

➜ **Transição:** o rato entra no bueiro. A tampa ([water_manhole_cover](https://polyhaven.com/a/water_manhole_cover)) gira e abre, a câmera **mergulha pelo bueiro**, cai em água escura com bolhas subindo e emerge na superfície do mar à noite.

**Assets** (coleção *Hidden Alley* do Poly Haven, feita para compor um beco):
- [modular_urban_apartments_facade](https://polyhaven.com/a/modular_urban_apartments_facade) ⚠ 16,5 MB / 118k polys: **decimar e bakear** (ver seção 4)
- [modular_fire_escape](https://polyhaven.com/a/modular_fire_escape), [rollershutter_door](https://polyhaven.com/a/rollershutter_door) (só 1,1k polys, perfeita para instanciar), [rollershutter_window_01](https://polyhaven.com/a/rollershutter_window_01)
- [street_lamp_01](https://polyhaven.com/a/street_lamp_01), [fire_hydrant](https://polyhaven.com/a/fire_hydrant), [metal_trash_can](https://polyhaven.com/a/metal_trash_can), [exterior_aircon_unit](https://polyhaven.com/a/exterior_aircon_unit), [utility_box_01](https://polyhaven.com/a/utility_box_01), [modular_electricity_poles](https://polyhaven.com/a/modular_electricity_poles)
- [security_camera_01](https://polyhaven.com/a/security_camera_01) / [02](https://polyhaven.com/a/security_camera_02) (rigged), [street_rat](https://polyhaven.com/a/street_rat), [water_manhole_cover](https://polyhaven.com/a/water_manhole_cover), [spray_paint_bottles_02](https://polyhaven.com/a/spray_paint_bottles_02), [boombox](https://polyhaven.com/a/boombox)
- Texturas: [asphalt_02](https://polyhaven.com/a/asphalt_02) + máscara de poças pintada à mão
- HDRI: [shanghai_bund](https://polyhaven.com/a/shanghai_bund) ou [cobblestone_street_night](https://polyhaven.com/a/cobblestone_street_night)
- **Feito à mão:** placas de neon (tubo = `TubeGeometry` num SVG do seu logo + material emissivo + bloom)

---

### CENA 04: A TRAVESSIA (Trajetória / experiência)
⏱ 48s · 🎯 linha do tempo: empregos, estudos, marcos

**Ambientação:** mar aberto à noite, lua enorme nascendo no horizonte. Um **píer de madeira** longo sai da névoa. Ao longo dele, lampiões apagados. No fim do píer, um pequeno barco. Mar calmo, com ondas longas.

**O píer é a sua linha do tempo.** Cada lampião é um ano ou marco. São 4 anos de carreira, então 4–6 lampiões:

| Lampião | Ano (aprox.) | Marco |
|---|---|---|
| 1 | ~2022 | **Freelancer**: começo da carreira |
| 2 | 2022–2023 | **8+ empresas atendidas**: dados (Oracle, Postgres, MariaDB, MySQL, Redis, Mongo, Neo4j), automações em Python, front (React, Angular, Ionic, Next) e back (Java, Node, Elixir, Go). *"Onde eu amadureci como engenheiro."* |
| 3 | ~2023 | **Grupo Bel Cosméticos**: entra como Full Stack (CLT) |
| 4 | 2023– | **Um monólito Java de 900+ classes**, criado e mantido **sozinho**: **~5.000 horas-homem economizadas** |
| 5 | 2023– | **Sistemas Elixir tolerantes a falhas**: 99,98% de sucesso nas requisições |
| 6 | 2024– | Relatórios, automações e integrações |
| 7 | 2026 | **Pesquisa em sistemas**: compilador, Raft, CUDA, LLM (os 7 repositórios) |
| 8 (apagado, no fim do píer) | — | **"Próximo capítulo: você?"**. Só acende se o visitante clicar: vai direto para o contato |

Os lampiões 1–2 ficam **agrupados e menores**, como vários barquinhos (as 8 empresas), e o 3 é um lampião grande de onde o píer fica mais largo e firme: a mudança de freela para uma casa fixa, contada pela arquitetura.

**Rima com a camada de sistemas distribuídos:** no horizonte, **3 faróis distantes** piscam trocando sinais entre si, com atraso de rede visível (um sinal viaja como um pulso de luz pela névoa). É o Raft da porta 3 visto de longe, como paisagem.

💡 **Luz:** a lua (HDRI) desenha uma **trilha de reflexo prateada** no mar, que é a composição do plano: a trilha aponta para a lua, para onde vamos depois. Os lampiões acendem em âmbar conforme você avança.

🖱 **Cursor = lampião na mão**, uma luz pontual quente que balança com inércia (pêndulo). Ao passar perto de um lampião apagado, **a chama "pula" para ele** e ele acende. Aí aparece, entalhado nas tábuas do píer, o marco daquele ano (empresa, cargo, uma frase). O mar reage ao cursor: pequenas ondulações onde a luz toca a água.

🎥 **Câmera:** *dolly-in* por cima do píer em direção à lua, e o scroll anda pelo píer. Horizonte sempre no terço inferior, lua no terço superior.

🔊 Ondas batendo nas estacas, madeira rangendo, sino de boia distante, gaivota rara. A trilha musical entra aqui pela primeira vez (piano + drone).

🥚 A bússola na mesinha do píer ([seadogs_compass](https://polyhaven.com/a/seadogs_compass)) aponta sempre para o cursor, exceto quando você o leva ao canto inferior esquerdo: aí ela gira louca e aponta para um baú enterrado na areia com um currículo em PDF dentro.

➜ **Transição:** a câmera sobe acompanhando a trilha de reflexo e **voa pelo reflexo da lua**. A lua cresce até ocupar a tela e a textura dela vira o chão da próxima cena. Corte seco no silêncio.

**Assets:**
- [modular_wooden_pier](https://polyhaven.com/a/modular_wooden_pier) (7,8 MB: usar 2 módulos e instanciar)
- [wooden_lantern_01](https://polyhaven.com/a/wooden_lantern_01) (instanciado, 8k polys cada), [lifebuoy](https://polyhaven.com/a/lifebuoy), [ocean_buoy](https://polyhaven.com/a/ocean_buoy), [wooden_barrels_01](https://polyhaven.com/a/wooden_barrels_01), [seadogs_compass](https://polyhaven.com/a/seadogs_compass), [treasure_chest](https://polyhaven.com/a/treasure_chest) (⚠ 103k polys: decimar)
- Barco: [ship_pinnace](https://polyhaven.com/a/ship_pinnace) (⚠ 21 MB / 184k polys, só como silhueta distante, decimado para ~8k)
- Rochas: [coast_rocks_02](https://polyhaven.com/a/coast_rocks_02), [coast_rocks_05](https://polyhaven.com/a/coast_rocks_05)
- HDRI: [qwantani_moonrise_puresky](https://polyhaven.com/a/qwantani_moonrise_puresky) (céu limpo com lua nascendo, 1,3 MB em 1k)
- **Feito à mão:** oceano com shader Gerstner (ou o `Water` do three.js adaptado) + espuma nas estacas

---

### CENA 05: MAR DA TRANQUILIDADE (Habilidades / stack)
⏱ 36s · 🎯 skills, ferramentas, tecnologias

**Ambientação:** a superfície da Lua. Silêncio absoluto. A **Terra no céu**, azul, girando devagar. Rochas lunares espalhadas, um instrumento de sonda abandonado com uma antena de rádio. Pegadas no chão.

💡 **Luz:** o **Sol é a única luz**, dura e sem atmosfera, com sombras recortadas e quase nada de *fill*. É a cena mais contrastada do filme, o oposto da chuva do beco. Um brilho azul fraco da Terra funciona como rim light.

🖱 **Cursor = o Sol.** Mover o mouse **move o Sol** pelo céu e as sombras das rochas giram em tempo real (sombras longas e dramáticas). Clicar e arrastar uma rocha **a levanta em gravidade lunar** (física Rapier, g = 1,62 m/s²): ela flutua, gira e cai devagar levantando poeira.

**Cada rocha tem uma skill gravada.** Arremesse uma rocha contra outra e elas se juntam numa **constelação** acima da Terra. As skills aparecem como estrelas ligadas por linhas, e esse é o seu mapa de competências. São constelações por área:

| Constelação | Estrelas (skills) |
|---|---|
| ✦ **Dados** | Oracle · PostgreSQL · MariaDB · MySQL · Redis · MongoDB · Neo4j |
| ✦ **Automação** | Python · relatórios · integrações · scripts de dados |
| ✦ **Interface** | React · Next.js · Angular · Ionic · WebGL/Three.js (este site é a prova) · Android (em breve) |
| ✦ **Backend** | Java 21 · Spring Boot / WebFlux · Node · Elixir · Go · Kafka |
| ✦ **Distribuídos** | Raft · Event sourcing · CQRS · Sagas · LMAX Disruptor · tolerância a falhas (OTP) |
| ✦ **Metal** | Rust · CUDA / C++ · Triton · Compiladores · Autograd |

São **6 constelações** que, quando todas se acendem, se ligam num único desenho: o **monograma GL**. Full stack de verdade é quando as constelações formam uma coisa só.

A estrela mais brilhante de cada constelação liga ao repositório que prova aquela skill.

🎥 **Câmera:** grande-angular baixa (lente 24mm), perto do chão, horizonte curvo. Leve flutuação, como se a câmera também estivesse em baixa gravidade.

🔊 **Silêncio.** Só a sua respiração dentro de um capacete, abafada. O rádio da sonda ([vintage_radio_transceiver](https://polyhaven.com/a/vintage_radio_transceiver)) chia, e ao passar o cursor por ele sintoniza fragmentos de áudio (pode ser sua voz: "Houston, aqui é o Gabriel…").

🥚 Digite `1969` no teclado: uma bandeira com o seu logo é fincada.

➜ **Transição:** a câmera se vira para a Terra e dá zoom até **o planeta virar a lente do projetor da Cena 01**. O filme "queima" (efeito *film burn*: buraco laranja que se abre derretendo o quadro) e voltamos à sala de cinema.

**Assets:**
- [moon_rock_01](https://polyhaven.com/a/moon_rock_01) … [moon_rock_07](https://polyhaven.com/a/moon_rock_07) (coleção *Moon* inteira, ~1,7 MB cada: usar LOD e instanciar)
- [vintage_spacecraft_instrument](https://polyhaven.com/a/vintage_spacecraft_instrument), [vintage_radio_transceiver](https://polyhaven.com/a/vintage_radio_transceiver)
- HDRI: [moon_lab](https://polyhaven.com/a/moon_lab) (só para reflexos no metal; o céu é preto + estrelas procedurais)
- Terra: texturas **NASA Blue Marble / Black Marble** (domínio público: [visibleearth.nasa.gov](https://visibleearth.nasa.gov)) com shader de atmosfera (fresnel)
- Chão: texturas lunares de [ambientCG](https://ambientcg.com) + *displacement*

---

### CENA 06: CRÉDITOS (Contato)
⏱ 25s · 🎯 contato, redes, disponibilidade

**Ambientação:** de volta ao **cinema**, agora visto da plateia. Poltronas vermelhas de veludo, todas vazias menos uma: a do visitante. Na tela, **os créditos sobem**, no formato clássico:

```
SESSÃO NOTURNA
um filme de Gabriel Lima

DIREÇÃO ................ Gabriel Lima
ROTEIRO ................ Gabriel Lima
DADOS .................. Gabriel Lima
AUTOMAÇÕES ............. Gabriel Lima
FRONT-END .............. Gabriel Lima
BACK-END ............... Gabriel Lima
COMPILADOR ............. Gabriel Lima
KERNELS DE GPU ......... Gabriel Lima
CONSENSO DISTRIBUÍDO ... Gabriel Lima
FOTOGRAFIA ............. Poly Haven · NASA
TRILHA ................. [compositor]
ELENCO ................. flight · hale · raft · match · ledger · nabla · cuda
PARTICIPAÇÃO ESPECIAL .. Grupo Bel Cosméticos · 8+ empresas
AGRADECIMENTOS ......... você, por assistir até aqui
```

A piada de repetir o nome em todas as funções **é o argumento full stack**: ele fez tudo, de verdade, e os créditos provam isso sem precisar dizer. Os créditos sobem no ritmo da música e cada função é um link para o projeto que a comprova.

💡 **Luz:** a única luz é a que vem da tela, refletida nas poltronas. As **luzes de corredor** (fitas no chão) acendem aos poucos, como no fim de uma sessão.

🖱 **Cursor = de volta ao feixe do projetor**, que agora está atrás de você. Na parede do fundo toca um **telefone antigo** ([vintage_telephone_wall_clock](https://polyhaven.com/a/vintage_telephone_wall_clock)). Clique nele e o telefone é "atendido": abre-se o **contato** (e-mail com botão de copiar, **WhatsApp** com link `wa.me`, GitHub e um formulário curto, com o status *"Disponível para vagas e freelas"*). É a *call to action* mais memorável possível: **o filme literalmente te liga.**

🎥 **Câmera:** plano fixo da plateia, com um *push-in* lentíssimo durante os créditos.

🔊 Trilha principal em volume cheio (o clímax musical fica nos créditos), e o telefone tocando com *reverb* de sala grande.

➜ Tela preta. *Fim.*

**Assets:**
- [vintage_telephone_wall_clock](https://polyhaven.com/a/vintage_telephone_wall_clock), [projector_screen](https://polyhaven.com/a/projector_screen)
- **Poltronas de cinema:** o Poly Haven não tem. Modelar uma em Blender (low-poly, ~2k tris) e **instanciar 200×**, ou buscar CC0 no [Poly Pizza](https://poly.pizza) / CC-BY no [Sketchfab](https://sketchfab.com) (conferir licença)
- Tecido: textura de veludo do [ambientCG](https://ambientcg.com)

---

### CENA 07: PÓS-CRÉDITOS 🦆
⏱ 5s (só para quem espera)

Quem fica 10s na tela preta depois do "Fim" vê as luzes voltarem. Na poltrona ao lado agora está um **patinho de borracha** ([rubber_duck_toy](https://polyhaven.com/a/rubber_duck_toy), 0,7 MB) com um balde de pipoca. Clique: *"quack"* e um confete de pipoca. Mostra o contador de easter eggs encontrados (x/7) e oferece **"Assistir de novo"**.

---

## 3. O cursor: a regra de ouro, cena por cena

| Cena | O cursor é… | Comportamento | Visual do ponteiro 2D |
|---|---|---|---|
| 00 | Dedo | Clica no interruptor | Círculo pequeno |
| 01 | Feixe do projetor | Gira o projetor com mola, revela a parede | Anel com poeira girando |
| 02 | Alvo da luminária | Luminária IK persegue, acorda objetos | Ponto quente com halo |
| 03 | Lanterna | Cone estreito, portas sobem, câmeras seguem | Cone em perspectiva no chão |
| 04 | Lampião | Pêndulo com inércia, acende lampiões | Chama tremulando |
| 05 | O Sol | Move sombras; arrastar = levantar rochas | Disco branco estourado |
| 06 | Feixe (de novo) | Fecha o ciclo, atende o telefone | Anel (rima com a Cena 01) |

**Regras técnicas do cursor:**
- Posição suavizada com *lerp* (0,12) e rotação com *spring* (react-spring/`maath`). Nada segue o mouse de forma rígida.
- A velocidade do cursor é um *uniform* global: poeira, chuva, neon e mar reagem a ela.
- **Mobile:** o cursor vira o **giroscópio** (inclinar o celular move a luz) + toque para interagir. Sem giroscópio, a luz faz um "passeio" automático e o toque a reposiciona.
- Teclado: `Tab` percorre os objetos iluminável (a luz pula até eles), e `Enter` interage. Isso é acessibilidade e também pontua no Awwwards.

---

## 4. Stack técnica e pipeline

### Stack
| Função | Ferramenta | Por quê |
|---|---|---|
| Render | **Three.js** + **React Three Fiber** + **drei** | Ecossistema maior, facilidade para cenas separadas |
| Coreografia de câmera | **Keyframes em código** (`CameraRig`) | Cada cena declara seus planos (posição, alvo, lente) em TypeScript: versionável e revisável. *(O Theatre.js foi descartado: ainda não suporta R3F 9 / React 19.)* |
| Scroll | Controle próprio (`useExploreInput`) | Roda do mouse, arraste no toque e setas scrubbam a timeline com amortecimento. Dispensa o Lenis |
| Pós | **postprocessing** (pmndrs) | Bloom, grão, vinheta, CA, DoF e LUT de cor por cena |
| Física | **@react-three/rapier** | Rochas lunares e confete de pipoca |
| Áudio | **Howler.js** ou Web Audio puro com `PositionalAudio` | Sons posicionais (neon, rádio, telefone) |
| UI do player | React + CSS, fora do canvas | Acessível, indexável |
| Qualidade adaptativa | **detect-gpu** + `PerformanceMonitor` do drei | Tiers alto/médio/baixo |
| Build | Vite | — |

### Pipeline de assets (crítico: os modelos do Poly Haven são pesados para web)
1. **Baixar em 1k** (glTF) do Poly Haven, e não em 2k/4k.
2. **Blender headless** (`blender -b -P scripts/blender/<cena>.py`), 100% por script e reproduzível. Cada cena tem um script Python que:
   - importa os glTF do Poly Haven (baixados por `scripts/assets.mjs` via API),
   - monta a cena (posições, instâncias, escala),
   - **decima** o que for fundo (fachada 118k → ~15k, barco 184k → ~8k, falésia 865k → silhueta),
   - cria um segundo UV (*lightmap UV*, com Smart UV Project) e **bakeia a iluminação no Cycles** (CPU, 16 núcleos, com denoise OIDN) numa textura por grupo de objetos,
   - exporta o `.glb` final para `public/scenes/<cena>.glb`.
   
   Assim, mudar a posição de um poste é editar uma linha e rodar `npm run bake:beco`.
3. **Luz em tempo real:** só **a luz do cursor** (1 luz dinâmica com sombra por cena), somada ao lightmap bakeado. Neons, poste e lampiões são **bakeados** (a luz deles já está "pintada" nas paredes), com material emissivo + bloom por cima. É o que faz uma GPU integrada parecer render de filme.
4. **Máquina de referência:** esta mesma, com **Intel UHD integrada**. Se roda a 60fps aqui, roda na maioria dos notebooks. (O bake usa a CPU, porque o Cycles não usa GPU Intel UHD, mas é trabalho offline e não importa para o visitante.)
5. **Fallback:** `gltf-transform simplify` (meshoptimizer) para ajustes rápidos sem abrir o Blender.
6. **gltf-transform:** `meshopt` (geometria) + **KTX2/Basis** (texturas) + dedupe. Redução típica de 70–90%.
7. **HDRIs:** 1k em `.hdr`, ou gerar *prefiltered env maps* (PMREM) e salvar como KTX2.

### Orçamento de performance (meta: 60fps num notebook médio)
| Item | Meta |
|---|---|
| Carga inicial (Cenas 00 + 01) | **< 5 MB** |
| Cada cena seguinte | < 8 MB, **pré-carregada em segundo plano** enquanto a anterior roda |
| Draw calls por cena | < 150 (instanciar tudo que se repete) |
| Triângulos visíveis | < 500k |
| Luzes com sombra em tempo real | 1 |
| Texturas | 1k padrão, 2k só no herói de cada cena |

Só **uma cena existe na GPU por vez** (a anterior sai da memória com `dispose`). As transições usam um *render target* para misturar o último quadro da cena A com o primeiro da B.

---

## 5. Camadas de descoberta (o que faz as pessoas compartilharem)

> **v4:** os 7 eggs abaixo continuam, agora como 7 dos **48 fotogramas perdidos** (§0.4). O contador `🥚 0/7` deu lugar ao ingresso perfurado e às falhas na timeline.

**7 easter eggs**, um por cena. Um contador discreto `🥚 0/7` fica no player. Quem acha todos desbloqueia o **"Corte do Diretor"**: a timeline de keyframes aparece e o visitante vê os bastidores (wireframes, lightmaps, a câmera voando com os caminhos visíveis). Isso vira conteúdo de Twitter/LinkedIn e mostra domínio técnico.

1. Aranha na cabine (C01)
2. Logo nas gotas (C02)
3. O rato (C03)
4. Baú do currículo (C04)
5. Bandeira `1969` (C05)
6. Segure o telefone sem atender por 10s: toca uma mensagem de voz sua (C06)
7. O pato (C07)

---

## 6. Som: metade da experiência

- Todo som é **diegético** (vem de algo na cena), exceto a trilha.
- A trilha é **uma única música** com *stems* (camadas) que entram e saem por cena: drone na cabine, lo-fi no estúdio, synth no beco, piano no mar, silêncio na lua e tudo junto nos créditos. Um compositor freelancer ou uma trilha licenciada (Artlist/Musicbed) resolve.
- Fontes CC0: [freesound.org](https://freesound.org) (filtrar CC0), [Pixabay Audio](https://pixabay.com/sound-effects/), [Sonniss GDC bundles](https://sonniss.com/gameaudiogdc) (gratuitos e royalty-free).
- O botão de som fica **sempre visível**, e a preferência é lembrada.

---

## 7. Outras fontes de assets (além do Poly Haven)

| Fonte | O que buscar | Licença |
|---|---|---|
| [Poly Haven](https://polyhaven.com) | Base de tudo: modelos, HDRIs, texturas | CC0 |
| [ambientCG](https://ambientcg.com) | Veludo, solo lunar, tecidos | CC0 |
| [Poly Pizza](https://poly.pizza) | Poltronas de cinema, props low-poly | CC0 / CC-BY |
| [Sketchfab](https://sketchfab.com) | Itens específicos (placas neon, cinema) | Checar cada um (CC-BY exige crédito, que vai nos créditos da C06) |
| [Fab.com](https://fab.com) (Megascans) | Rochas e superfícies fotoescaneadas | Grátis com restrições, ler os termos |
| [NASA Visible Earth](https://visibleearth.nasa.gov) | Terra e Lua | Domínio público |
| [Mixamo](https://mixamo.com) | Se quiser um personagem (projecionista em silhueta) | Grátis |

---

## 8. Mobile, acessibilidade e o "modo fácil"

- **Mobile:** mesma narrativa, câmeras reenquadradas em vertical (o `CameraRig` já abre a lente automaticamente em telas estreitas; planos críticos ganham keyframes próprios para retrato), tier de qualidade baixo por padrão, sem sombras dinâmicas, chuva e poeira com 1/4 das partículas.
- `prefers-reduced-motion`: desliga *gate weave*, *handheld* e tremores, e troca as transições voadoras por cortes secos.
- **Versão em texto:** um link discreto "ver portfólio em texto" no player, com HTML semântico dos mesmos conteúdos. Bom para SEO, recrutadores e leitores de tela.
- Legendas (CC) para qualquer fala ou voz.
- **Bilíngue:** inglês por padrão (ou pelo idioma do navegador), botão `EN / PT` no player. Todo texto sai de `locales/en.json` e `locales/pt.json`, inclusive pichações, entalhes do píer e créditos, que são texturas geradas em tempo de execução com a fonte certa.

---

## 9. Plano de produção

Cada fase termina com **uma versão rodando** que você abre no navegador e aprova (ou pede ajustes) antes da próxima. Construímos **uma cena completa e polida antes da próxima**: um beco perfeito vale mais que sete cenas medianas.

| Fase | Entrega | Você aprova |
|---|---|---|
| **1. Esqueleto** ✅ | Vite + React Three Fiber, player de filme, troca de cenas com preload/dispose, i18n EN/PT, pós-processamento "película", script de assets do Poly Haven | O player e o "look" de película numa cena vazia |
| **2. Cena 03: Beco** ★ ✅ | A vitrine: beco molhado, lanterna, 8 portas com o `projects.json`, as 3 instalações ★ (flight, raft, match) | O visual final do site inteiro sai daqui |
| **3. Cenas 00 + 01** ✅ | Contagem e cabine do projetor | A primeira impressão |
| **4. Cena 06: Créditos** ✅ | Cinema, telefone e contato funcionando. **MVP no ar** (00 → 01 → 03 → 06) no Vercel | Deploy |
| **5. Cenas 02 e 04** ✅ | Estúdio (sobre) e píer (trajetória) | Textos da bio e linha do tempo |
| **6. Cena 05: Lua** ✅ | Física, Sol-cursor e constelações de skills | — |
| **7. Instalações restantes** ✅ | Portas 2, 5, 6 e 7 (hale, ledger, nabla, cuda), "em obras" e a árvore LET IT CRASH | — |
| **8. Polimento** 🟡 (falta: foto, trilha real) | Som, easter eggs, mobile, `prefers-reduced-motion`, versão em texto, OG image, vídeo de 30s para divulgar | Submissão ao Awwwards |
| **9. Ato I: A Fachada** ✅ | Lobby 2D: abertura com o GL se desenhando + nome datilografado, letreiro, fita de película 3D com frames do filme, programa, ingresso, a porta que abre para o 3D (pré-carga real por baixo) | A primeira impressão v3 |
| **10. Backend ao vivo** 🟡 (pronto; deploy no Render, plano gratuito) | `live/`: Java 21 sem dependências rodando **o código real** do raftkv e do matching engine (compilado dos repositórios, commits fixados), SSE para todos, plateia ao vivo nas poltronas, ingresso numerado, rate limit; o servidor dorme sem visitas e o site o acorda na chegada | Conta no Render (grátis, sem cartão) |
| **11. Projetos ao vivo I** ✅ | Lampiões do beco = cluster Raft real (clique derruba o nó para todos); livro de ofertas real com COMPRAR/VENDER; o prisma do hale abre o compilador real em WASM. Sem servidor, tudo cai para simulação local e avisa | As 3 demos que só existem aqui |
| **12. Projetos ao vivo II** | flight via Pyodide, nabla, LLM em WebGPU na lua, telas com iframe dos projetos de front | — |
| **13. Ato III: Luzes Acesas** ✅ | Porta de SAÍDA ao lado do telefone (depois de atender, a câmera mostra a porta) → página 2D com as demos ao vivo, sala de máquinas, outros projetos e contato; também em "Ao vivo" no lobby e `?exit` | Submissão v3 |
| **14. Parte II · A espinha** ✅ (falta o deploy) | `cinema/`: Worker + Durable Object (SQLite) em Rust com o visitante numerado, o log de eventos validado e as estatísticas reais; `frames.json` com os 48; o ingresso perfurado; as falhas na timeline e o piscar da película; Ingresso Falsificado; os 7 eggs viram fotogramas | Conta na Cloudflare (grátis, sem cartão) |
| **15. Parte II · Ato I** 🟡 (faltam o fliperama e o `curl` do domínio) | A Cabine 0 `x/48`, o caixa com PGlite, o fliperama, o domínio (`curl`/`dig`), os fotogramas 1–11 | — |
| **16. Parte II · Ato II** 🟡 (GL-1 + GL-OS, terminal da cabine, psql/glasm/hale/rede/espectro/vi prontos; faltam python e a Oficina, git, duckdb, os segredos das salas e das cenas) | O kernel do GL-OS, o VFS "tudo é arquivo", os runtimes, a Oficina do Projetor, as salas com runtime real, os fotogramas 12–37 | — |
| **17. Parte II · Ato III** 🟡 (console root e Caldeira prontos; faltam Chaos Panel, Sala de Montagem, Transistor, site dentro do site, mural) | A Sala de Máquinas, a Caldeira, a Sala de Montagem, O Transistor, os fotogramas 38–48 | — |
| **18. Parte II · A Cabine 0** | O replay, o MP4, o Filme Coletivo, a passkey, o PR no `hall-of-explorers`, a carta | A carta (só você escreve) |
| **19. Parte II · Depois do fim** | A Sessão Comentada, o speedrun, os de nível pesquisa | — |

**O que só você pode fornecer** (enquanto isso uso placeholders):
- Trilha sonora (licenciada ou de um compositor). Até lá, uso sons CC0.
- Sua foto para a polaroid (Cena 02).
- Opcional: sua voz para o rádio lunar e a mensagem na secretária eletrônica.

---

## 9.1 Perguntas em aberto

✅ Todas respondidas (trajetória, stack, logo, contato, permissão para citar o Grupo Bel).

Parte II (§0.4):
- **Cloudflare:** o estado compartilhado mora num Worker + Durable Object no plano grátis (sem cartão); o Render continua só com as demos Java. Precisa da sua conta para o deploy.
- **O Transistor:** a GL-1 (CPU projetada do zero) ou um 6502 real simulado por transistor?
- **A carta da Cabine 0:** só você escreve.

Restantes, sem pressa:
- **Domínio:** vai ter domínio próprio (ex.: `gabriellima.dev`) ou fica no Vercel?
- **Trilha sonora** e **foto** para a polaroid (Cena 02).

---

## 10. Checklist antes de submeter ao Awwwards

Os jurados dão nota em **Design, Usabilidade, Criatividade e Conteúdo**. Para cada um:

- [ ] **Design:** o print do beco molhado sozinho já impressiona? A paleta se mantém em todas as cenas?
- [ ] **Usabilidade:** alguém acha seus projetos e seu contato em **menos de 15s** usando o player? Funciona no celular? Existe a versão em texto?
- [ ] **Criatividade:** a regra "o cursor é a luz" está clara sem tutorial? As transições são memoráveis?
- [ ] **Conteúdo:** os projetos têm papel, resultado e link? Os créditos dão crédito aos assets CC-BY?
- [ ] Carga inicial < 5 MB, 60fps no desktop e 30+ no celular médio
- [ ] Som opcional, mas bom o bastante para as pessoas deixarem ligado
- [ ] Meta tags, OG image (o plano do beco) e um vídeo de 30s do site para divulgar

---

### Referências para estudar durante a produção
- **Bruno Simon** (bruno-simon.com): bake de luz, física, humor e easter eggs
- **Igloo Inc** (igloo.inc): transições entre mundos, partículas e o som como parte do design
- **Lusion** (lusion.co): pós-processamento e interação com cursor
- **Active Theory** (activetheory.net): narrativa em cenas
- Curso **Three.js Journey** (Bruno Simon): o capítulo de *baking* no Blender é essencial para este projeto

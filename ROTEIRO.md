# SESSÃO NOTURNA
### Um curta interativo em 3D — roteiro de direção do portfólio

> **Premissa:** toda noite, num cinema esquecido, um projetor 8mm liga sozinho.
> O filme que passa é a sua carreira. O visitante é o projecionista, e **o cursor é a luz**.

---

## Sobre o diretor (o protagonista do filme)

| | |
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

**O que só você pode fornecer** (enquanto isso uso placeholders):
- Trilha sonora (licenciada ou de um compositor). Até lá, uso sons CC0.
- Sua foto para a polaroid (Cena 02).
- Opcional: sua voz para o rádio lunar e a mensagem na secretária eletrônica.

---

## 9.1 Perguntas em aberto

✅ Todas respondidas (trajetória, stack, logo, contato, permissão para citar o Grupo Bel).

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

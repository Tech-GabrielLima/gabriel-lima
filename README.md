# Sessão Noturna · Night Session

Portfólio de Gabriel Lima como uma noite no cinema, em três atos: o **saguão** em 2D (Ato I), o **curta interativo em 3D** (Ato II) e as **luzes acesas** em 2D com os projetos rodando ao vivo (Ato III). O roteiro completo (cenas, luz, cursor, som, plano de produção) está em [ROTEIRO.md](ROTEIRO.md).

## Rodar

```bash
npm install
npm run assets      # baixa e otimiza os assets do Poly Haven (scripts/assets.json)
npm run dev         # http://localhost:5173
```

Os projetos ao vivo (cluster Raft, matching engine) vêm do servidor em [live/](live/README.md): Java 21, sem dependências, compilando o código real dos repositórios. Em dev o site procura por ele em `http://localhost:8787`; em produção, em `VITE_LIVE_URL`. Sem servidor, cada instalação cai para uma simulação local e avisa. O compilador do hale roda no navegador em WebAssembly (`scripts/hale-wasm.sh` recompila a partir do repositório `tired`).

Parâmetros de URL para desenvolvimento:

| Parâmetro | Efeito |
|---|---|
| `?exit` | abre direto no Ato III (luzes acesas) |
| `?start` | pula o saguão e começa o filme |
| `?t=12.5` | começa o filme nesse segundo |
| `?mode=explore` | começa no modo Explorar |
| `?lang=pt` / `?lang=en` | força o idioma |
| `?door=raft` | abre um projeto direto |
| `?text` | abre a versão em texto |
| `?clean` | esconde a interface (capturas, OG image) |
| `?live=off` / `?live=<url>` | força as simulações locais / aponta para outro servidor ao vivo |

Atalhos: `Espaço` reproduz/pausa · `←` `→` ±5s · `E` alterna Assistir/Explorar.

## Estrutura

```
src/lobby/      Ato I (o saguão) e as peças 2D que o Ato III reaproveita: letreiro, lanterna, fio, ingresso, porta
src/exit/       Ato III (luzes acesas): as vitrines com os projetos ao vivo
src/live/       o fio ao vivo (SSE), os painéis dos projetos e o compilador do hale em WASM
src/film/       o "projetor": capítulos, relógio, estado, cursor, câmera, película, som
src/scenes/     uma pasta por cena, carregada sob demanda (SceneHost monta uma por vez)
src/ui/         player, letterbox, contato
live/           o servidor ao vivo (Java 21, Render; ver render.yaml)
scripts/        assets.mjs (Poly Haven → public/), shot.mjs (screenshots), blender/ (scripts headless)
```

A ordem e a duração das cenas ficam em `src/film/chapters.ts`. Para trocar o placeholder de um capítulo pela cena real, aponte o loader em `src/scenes/SceneHost.tsx`.

## Ferramentas

- **Blender headless**: `npm run blender -- scripts/blender/<script>.py -- <args>` (usa `~/.local/opt/blender/blender`, ou defina `BLENDER`).
- **Teste rápido**: com `npm run preview` rodando, `npm run smoke` visita todos os capítulos (desktop e celular) e reporta erros e fps.
- **Texturas**: `npm run textures` converte JPG/PNG de `public/textures` para WebP.
- **Screenshots**: com `npm run preview` rodando, `npm run shot -- out.png "t=12&start" --mouse=900,400 --fps`.

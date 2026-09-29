# cinema · a memória do cinema

A espinha da Parte II (ROTEIRO §0.4.3). É um Cloudflare Worker em Rust na frente de **um** Durable Object com SQLite, e ele faz três coisas:

- **Numera cada visitante** com um ingresso assinado (HMAC-SHA256). O ingresso tem um id aleatório e um número sequencial, e nada mais: nem nome, nem e-mail, nem IP.
- **Guarda e julga o log de eventos** dos 48 fotogramas perdidos. O progresso não é um número: é o que o log reexecuta para. O juiz é [src/judge.rs](src/judge.rs), puro e testado no host. Ele recusa:
  - fotograma inventado (`unknown`, forjado);
  - fotograma que ainda não existe (`unbuilt`, forjado);
  - fotograma encontrado antes do tempo mínimo no site (`too_soon`).

  Reenviar o mesmo evento não muda nada (idempotente).
- **Conta a noite:** visitantes, exploradores, conclusões, o recorde e a última conclusão.

A lista dos 48 é [frames.json](frames.json), a mesma que o site importa.

## API

Todos os POSTs são `text/plain` com corpo JSON. Assim não há preflight de CORS, e o beacon de saída também chega.

| Rota | Corpo | Resposta |
|---|---|---|
| `POST /v1/visit` | `{ ticket? }` | `{ ticket, returning, progress, stats }`: honra um ingresso válido ou emite o próximo número |
| `POST /v1/sync` | `{ ticket, events: [{seq, id, at}], visible }` | `{ accepted, rejected, progress, stats }`: batimento (credita o tempo com a página visível, no máximo 20 s por batimento) e julgamento do lote |
| `GET /v1/stats` | — | `{ visitors, explorers, completed, fastest_ms, last_completion, frames, built }` |
| `GET /v1/health` | — | `ok` |

## Rodar localmente

Precisa de Rust com o target `wasm32-unknown-unknown` e do `worker-build` (`cargo install worker-build`).

```sh
cd cinema
npm install
npm test                 # o juiz e o ingresso (cargo test)
npm run dev              # workerd local em http://localhost:8788
```

Antes do primeiro `dev`, crie a chave local (fica fora do git): `echo TICKET_KEY=dev > .dev.vars`. O site em dev (`npm run dev` na raiz) já aponta para `http://localhost:8788`.

## Deploy (plano grátis, sem cartão)

```sh
cd cinema
npx wrangler login
npx wrangler secret put TICKET_KEY    # uma frase longa e aleatória
npm run deploy
```

Depois, na Vercel, `VITE_CINEMA_URL=https://sessao-noturna-cinema.<conta>.workers.dev` e um redeploy do site (a variável entra no build). `?cinema=off` força o modo local, e `?cinema=<url>` aponta para outro servidor.

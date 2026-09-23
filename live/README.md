# live — the portfolio's shared backend

One small Java 21 process that runs Gabriel's actual research code for everyone on the site at
the same time. Nothing is mocked: visitors watch it over Server-Sent Events and can poke it.

- **raftkv** ([raft-kv-store](https://github.com/Tech-GabrielLima/raft-kv-store) @ `c5f1083`):
  a 5-node cluster (`RaftNode` + `KvServer` over the in-process `SimulatedNetwork`, reliable mode,
  `RaftConfig.defaults().withNoop(true)`), wired like its own `RaftKvHttpServer` demo. The whole
  `src/main/java` tree is compiled in.
- **matching engine** ([lowlatency-matching-engine](https://github.com/Tech-GabrielLima/lowlatency-matching-engine)
  @ `f1714ed`): only the Spring-free core, `com.exchange.engine` and `com.exchange.domain`. A single
  thread makes every `MatchingEngine.process` call. A market-maker bot keeps the book alive.

Neither repo is copied here: `build.sh` compiles them from a checkout, and the Dockerfile clones
them at the pinned commits.

## Protocol (all under `/live`)

| Route | Result |
|---|---|
| `GET /events` | SSE. The current state on connect, then `event: state` every 250 ms, and a `: ping` every 15 s. |
| `POST /ticket` | `{"n":1}`: a sequential number starting at 1 |
| `POST /raft/{id}/toggle` | disconnects or reconnects node `id` (0..4), returns the `raft` object. A node heals itself after 30 s. `409 {"error":"quorum"}` if 2 are already down. |
| `POST /raft/clap` | appends `"+"` to key `claps` through consensus and reads it back (ReadIndex): `{"claps":n,"index":commit,"leader":id}`. `503` if no leader within 2 s. |
| `POST /order` | body `{"side":"BUY\|SELL","type":"LIMIT\|MARKET","price":int,"qty":1..50}` (price is required for LIMIT and must be within ±60 ticks of mid) → `{"id","reports":[{"status","filled","remaining","lastPrice"}],"trades":[[price,qty]]}` |
| `GET /health` | `{"ok":true}` |

The state frame:

```json
{"t":ms,"audience":n,"tickets":n,
 "raft":{"nodes":[{"id":0,"up":true,"role":"leader|follower","term":3,"commit":120,"last":120,"sees":0}],
         "leader":id|-1,"rpcs":n,"claps":n,"healAt":[ms|0 x5]},
 "book":{"bids":[[p,q]x≤10],"asks":[[p,q]x≤10],"last":[[tradeId,p,q,"BUY|SELL",ms]x≤12],
         "trades":n,"orders":n,"bestBid":p,"bestAsk":p,"resting":n,"checks":n,"mismatches":0},
 "machine":{"uptime":s,"java":"21…","heapMb":n,"threads":n,"events":n,"requests":n}}
```

A few details are shown exactly as they happen:

- `RaftNode` does not expose the candidate role, so `role` is only `leader` or `follower`, and
  `sees` gives the leader the node currently follows (`-1` for none).
- raftkv has no check-quorum, so a leader you disconnect still reports `leader` in its old term
  until it reconnects. `raft.leader` is the leader among connected nodes.
- raftkv has no PreVote either. An isolated node keeps raising its term, and when it rejoins it
  forces a new election.
- The engine only exposes the top of book, so depth is rebuilt from execution reports and checked
  against `OrderBook.snapshot()` after every command. `mismatches` should stay 0.

Limits: 5 POST/s per IP (burst 10, keyed by `Fly-Client-IP` if present, then the first `X-Forwarded-For`
hop) returns `429`. There are 500 SSE viewers at most (10 per IP) before `503`. Visitor orders
that rest are cancelled after 2 minutes, and the whole book resets every hour.

## Run locally

```sh
./build.sh                       # needs JDK 21+ (javac/jar on PATH, or JAVA_HOME)
java -jar build/live.jar         # http://localhost:8787/live/events
```

`RAFTKV_SRC` and `EXCHANGE_SRC` point `build.sh` at the checkouts. They default to
`../../portfolio/raftkv` and `../../portfolio/exchange`.

## Deploy (Render, free plan)

The repository's root `render.yaml` is a Render Blueprint for this service: Docker from `live/`,
the free plan (no card), a health check on `/live/health` and the site's origins in
`ALLOWED_ORIGINS`. In the Render dashboard: **New → Blueprint**, pick the repository, apply.
Every push to `main` redeploys it.

The free plan sleeps after 15 minutes without traffic and takes about a minute to wake. The site
knocks on `/live/health` as soon as a visitor arrives and shows the installations as "waking"
until the stream comes through (see `src/live/live.ts`). All state is in memory, so a sleep just
starts a fresh night. Render sets `PORT` itself.

| Env | Default | |
|---|---|---|
| `PORT` | `8787` | listen port |
| `ALLOWED_ORIGINS` | `*` | comma-separated CORS allow-list |

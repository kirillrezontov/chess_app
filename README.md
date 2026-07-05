# Chess app — frontend/backend split

A chess web app split cleanly into a **dumb frontend** (renders board state,
sends move intents) and an **authoritative Go backend** (owns all rules,
persistence, matchmaking). Nothing about chess legality, check detection, or
game state exists in JavaScript — every board you see on screen is a replay
of exactly what the server decided.

## Layout

```
frontend/          static HTML/CSS/JS client — no build step, no framework
backend/            Go backend
  cmd/server/        main.go — wiring/routing
  internal/engine/    chess rules: board, move gen, FEN, check/mate detection
  internal/game/      Session (one goroutine per live game) + Registry
  internal/auth/      JWT + bcrypt
  internal/store/     Postgres access layer (only place SQL lives)
  internal/ws/        WebSocket hub — bytes in, bytes out, no rules
  internal/api/       REST handlers + matchmaker
db/schema.sql        Postgres schema, auto-applied on first container start
docker/               Dockerfiles + nginx config
docker-compose.yml    db + backend + frontend, one command up
```

## Running it

```
docker compose up --build
```

- Frontend: http://localhost:3000
- Backend directly: http://localhost:8080
- Postgres: localhost:5432 (user/pass/db: chess/chess/chess)

The frontend talks to `/api/*` and `/ws/*` on its own origin; nginx proxies
both to the backend container, so there's no CORS configuration needed in
the browser.

## How a game flows

1. `POST /api/register` or `/api/login` → JWT.
2. `POST /api/queue` with a time control → ticket id.
3. Client polls `GET /api/queue/{ticketId}` until `status: "matched"`, which
   includes a `game_id`. The matchmaker goroutine pairs same-time-control
   tickets every 500ms, creates a `games` row, and calls
   `Registry.Start(...)`, which spawns the session's goroutine.
4. Client opens `wss://.../ws/games/{id}?token=...`.
5. Every move is sent as `{"type":"move","from":"e2","to":"e4","promotion":""}`.
   The session goroutine is the *only* code that touches the board; it
   validates fully server-side via `engine.Board.ApplyMove`, then broadcasts
   a `Snapshot` to every subscriber (both players, and any spectators you
   add later).
6. Illegal moves get `{"type":"error","error":"..."}` back and the board is
   simply left as-is — the frontend never had an opinion about legality to
   begin with, so there's nothing to roll back.

## Concurrency model: goroutine-per-game vs container-per-game

The brief allows either "a distinct container" or "a separate thread on the
server" per game. This implementation uses **one goroutine per game**
(`internal/game.Registry.Start` calls `go session.Run()`), because:

- Goroutines are ~2KB at creation, so one Go process comfortably hosts
  thousands of concurrent games — far cheaper than a container per match.
- All access to a `Session`'s board is serialized through its `cmds`
  channel, so there's no lock contention or shared-mutable-state risk
  even though many WS connections read/write concurrently.

If you need actual OS-level isolation per game (hard CPU/memory caps per
match, independent crash/restart domains, or per-game horizontal scaling
across machines), the same `Session` type is the seam to split on: wrap it
behind a small gRPC or HTTP service, run *that* in its own container, and
have the matchmaker `docker run` (or schedule via Nomad/Kubernetes Jobs) a
new instance per match instead of `go session.Run()`. The wire format
(`Snapshot` JSON) and the WS hub's job (forward bytes to whichever
container/goroutine owns that game id) don't change either way.

## Extending

- **Draw offers** are currently auto-accepted server-side
  (`handleDrawOffer` in `session.go`) as a placeholder — wire up a real
  two-sided offer/accept exchange if you need it.
- **Spectators**: `Session.Broadcast` is already a fan-out channel; add a
  `/ws/spectate/{id}` route that subscribes without a `PlayerID` and never
  calls `SubmitMove`.
- **Rating updates**: `store.UpdateRating` exists but isn't wired to a rating
  formula yet — hook an Elo/Glicko calculation into `Session` when
  `outcome` is set, then call `store.FinishGame` + `store.UpdateRating` +
  insert into `rating_history`.
- **Legal-move highlighting**: `board.js`'s `Board.highlightLegalTargets`
  is ready to receive a target-square list; add a WS message type like
  `{"type":"legal_targets","from":"e2"}` → server replies with squares from
  `engine.Board.LegalMovesFrom`, so the frontend still never computes
  legality itself.

## Database

See `db/schema.sql`. Core tables: `users`, `games`, `moves` (full ply-by-ply
FEN history), `rating_history`, `sessions` (optional token revocation),
`queue_tickets` (durable matchmaking state if you outgrow the in-memory
matcher).

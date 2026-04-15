# Backlog (optional)

Scaffolding from “make it compile” is **done**. Use this list for **next steps** if you harden or reuse the repo as a template. Setup, layout, and env are documented in [`README.md`](README.md).

## Product / multiplayer

- [ ] **Player identity** — today seats match `displayName` string; add opaque `playerId` / session token from server after join.
- [ ] **Reconnect** — same player refreshes mid-game without losing seat (token + short TTL).
- [ ] **Room persistence** — in-memory rooms vanish on process restart; optional Redis/DB for `GameRoom` state.
- [ ] **Rate limits** — per IP / per connection on `join_game` and message rate.
- [ ] **Spectators** — third client joins read-only (protocol + UI).
- [ ] **`player_disconnected` / `player_reconnected` in UI** — server sends types already; client only uses `game_state` today.

## Quality

- [ ] **WebSocket integration test** — two clients, same `gameId`, assert join + one legal move + state shape.
- [ ] **Unit tests** — `rules.ts` (win/draw/full column) cheap wins.
- [ ] **Extract WS wiring** — optional `packages/server/src/ws/handler.ts` if `index.ts` grows.

## Deploy / ops

- [ ] **Dockerfile** (server) + static image or nginx recipe for `packages/client/dist`.
- [ ] **Metrics** — Prometheus counters on connections, joins, games completed.

## Client polish

- [ ] **Copy invite** button on table screen (clipboard API).
- [ ] **Toast / inline errors** instead of `alert()` for server errors.

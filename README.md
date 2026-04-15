# Connect 4

Monorepo with a **WebSocket server** (`@connect4/server`), a **Vite + Tailwind** browser client (`@connect4/client`), and shared types (`@connect4/shared`). Package management uses **pnpm** workspaces.

## Layout: separated client and server

| Package                | Role                                                                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **`@connect4/shared`** | **Wire protocol + domain types** (`ClientMessage`, `ServerMessage`, `GameState`, …). Both apps depend on this only — no client↔server imports.   |
| **`@connect4/server`** | **Authoritative game logic** and WebSockets. Serves **`GET /health`** (JSON, for probes) on the same HTTP server as the WS upgrade.              |
| **`@connect4/client`** | **Static UI**; talks to the server **only** via `WebSocket` using URLs from config (see below). Host on CDN/S3; point `VITE_WS_URL` at your API. |

That split is the template: **ship HTML/JS/CSS from anywhere**, run **one long-lived Node process** (or many behind a load balancer) for real-time state.

## Configuration

| Variable                | Where               | Purpose                                                                                             |
| ----------------------- | ------------------- | --------------------------------------------------------------------------------------------------- |
| `PORT`                  | Server              | HTTP + WebSocket listen port (default `3000`).                                                      |
| `LOG_LEVEL`, `NODE_ENV` | Server              | Pino verbosity / JSON vs pretty (see **Logging**).                                                  |
| `MAX_WS_MESSAGE_BYTES`  | Server              | Reject oversized WS frames (default `16384`).                                                       |
| `VITE_WS_URL`           | Client (build-time) | Full WebSocket URL, e.g. `wss://api.example.com` when the client and API use **different origins**. |
| `VITE_WS_PORT`          | Client (build-time) | Used **only** if `VITE_WS_URL` is unset: `ws(s)://<page-host>:<port>`.                              |

Copy **`packages/server/.env.example`** and **`packages/client/.env.example`** to `.env` in those packages (or export vars). The server loads `.env` via **`dotenv`** on startup.

**Health check:** `curl -s http://127.0.0.1:3000/health` → `{"ok":true,"service":"connect4-ws","uptime":…}`.

## Using this repo as a template

1. **Rename** the `@connect4/*` scope in `package.json` files and `pnpm-workspace.yaml` paths if you want your own org name.
2. **Extend the protocol** in `packages/shared` first (types + message unions), then implement server handlers and client UI.
3. **Keep rules on the server**; clients only send intents (`join_game`, `drop_piece`, …) and render `game_state`.
4. **Production gaps** you will still want for real games: **auth / player identity**, **rate limiting**, **persistence** (Redis/DB for rooms), **reconnect tokens**, **tests** (unit + one integration test for WS), **observability** (metrics, trace ids), **TLS** (`wss://`), and a **reverse proxy** (nginx, Caddy, cloud LB) in front of Node.
5. **CI** runs `lint`, `format:check`, and `build` on push/PR (see `.github/workflows/ci.yml`).

## Prerequisites

- [Node.js](https://nodejs.org/) **24.x** ([release schedule / LTS](https://nodejs.org/en/about/releases)) — CI uses 24; older LTS may work but is not validated here.
- [pnpm](https://pnpm.io/installation) — this repo pins a version via `packageManager` in the root `package.json`. With [Corepack](https://nodejs.org/api/corepack.html) enabled, pnpm is selected automatically:

  ```bash
  corepack enable
  ```

## Install and build

From the repository root:

```bash
pnpm install
pnpm run build
```

`pnpm run build` compiles every workspace package in dependency order (shared first, then server and client).

## Lint and format

From the repository root (ESLint applies to `packages/*/src/**/*.ts`; Prettier applies to the repo with ignores in `.prettierignore`):

```bash
pnpm run lint
pnpm run format        # write fixes
pnpm run format:check  # CI-style check
```

TypeScript sources use the `@/` path alias (mapped to each package’s `src/`). ESLint’s `no-restricted-imports` rule rejects `./` and `../` imports so new code stays on `@/`.

Prettier uses `@trivago/prettier-plugin-sort-imports` (with `^@connect4/` and `^@/` groups) and `prettier-plugin-tailwindcss` (must stay **last** in the `plugins` array).

## Run in development

You need **two processes**: the game server and the static/dev client.

**Terminal 1 — WebSocket server (port 3000):**

```bash
pnpm run dev:server
```

**Terminal 2 — Vite dev server (default port 5173):**

```bash
pnpm run dev:client
```

Then open the app in the browser, for example:

```text
http://localhost:5173/
```

The client builds the WebSocket URL from **`VITE_WS_URL`** or **`ws(s)://<current-host>:<VITE_WS_PORT>`** (see `packages/client/src/config.ts`). Keep the server running before or as you load the page.

## Logging

- **Server** uses [**pino**](https://getpino.io/): structured JSON logs on stdout when `NODE_ENV=production` (good for aggregators). In development (`NODE_ENV` unset or not `production`), logs go through **pino-pretty** for readable lines. Set **`LOG_LEVEL`** to a pino level (e.g. `trace`, `debug`, `info`, `warn`) to tune verbosity; default is `debug` in dev and `info` in production.
- **Client** uses [**consola**](https://github.com/unjs/consola): tagged messages in the browser devtools console; production builds use a slightly quieter default level than dev.

Connection lifecycle, joins, drops, wins/draws, invalid JSON, and WebSocket errors are logged on the server; the client logs session start, open/close, message types (debug), and errors.

### Routes: home vs room (UUID)

The client uses a tiny **route tree** (no router framework):

| Path           | Screen                                                                                      |
| -------------- | ------------------------------------------------------------------------------------------- |
| `/`            | **Home** — “Create room” (new random UUID) or “Join” (paste UUID or full `/room/...` link). |
| `/room/<uuid>` | **Table** — enter display name, connect WebSocket, then play.                               |

- **`gameId` is always a UUID** for the room (`crypto.randomUUID()` on create). Share the **invite link** (`…/room/<uuid>`). The **match** still happens over `join_game` with that id.
- **Legacy** `?gameId=<uuid>` and old **`/game/<uuid>`** URLs are redirected once to **`/room/<uuid>`**.

### Why “game full”?

A room allows **at most two** seated players (red and yellow). You get “full” when:

1. **A third browser/tab** tries to join the same `gameId` while two players are already seated, or
2. **Previously:** a bug left seats “stuck” after a refresh because disconnect did not clear `players` in state. That is **fixed**: when a WebSocket closes, that seat is freed and in-progress games return to **waiting** with a **reset board** so someone can rejoin.

If you still see full with only two tabs, close stray tabs for that room or **create** a new room (new UUID).

## Production-style run

After `pnpm run build`:

- Start the server with Node from the compiled output, for example:  
  `node packages/server/dist/index.js`  
  (exact path matches your `packages/server` `outDir` / `rootDir` layout from `tsc`.)
- Serve `packages/client/dist/` with any static file host configured for an **SPA** (all paths such as `/room/<uuid>` must serve `index.html`). Set **`VITE_WS_URL`** at build time to your public **`wss://`** endpoint when the static site and API differ.
- Run Node behind a process manager or container; use **`GET /health`** for readiness/liveness.

For local iteration, the dev commands above are enough.

---

## Example game state

Illustrative JSON shape (not necessarily identical to every field the live server sends):

```json
{
  "gameId": "a3f7c2d1-8b4e-4f6a-9c2d-1e5b3a7f0d8c",
  "status": "in_progress",
  "createdAt": "2026-04-14T12:00:00Z",
  "updatedAt": "2026-04-14T12:04:37Z",
  "players": {
    "red": {
      "id": "user_001",
      "displayName": "Alice",
      "connected": true,
      "lastSeen": "2026-04-14T12:04:37Z"
    },
    "yellow": {
      "id": "user_002",
      "displayName": "Bob",
      "connected": false,
      "lastSeen": "2026-04-14T12:03:55Z"
    }
  },
  "currentTurn": "yellow",
  "board": [
    [null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null],
    [null, null, "red", null, null, null, null],
    [null, null, "red", "yellow", null, null, null],
    ["red", "yellow", "red", "yellow", "yellow", null, null]
  ],
  "moves": [
    {
      "player": "red",
      "column": 0,
      "row": 5,
      "movedAt": "2026-04-14T12:01:00Z"
    },
    {
      "player": "yellow",
      "column": 3,
      "row": 5,
      "movedAt": "2026-04-14T12:01:22Z"
    },
    {
      "player": "red",
      "column": 2,
      "row": 5,
      "movedAt": "2026-04-14T12:02:10Z"
    },
    {
      "player": "yellow",
      "column": 4,
      "row": 5,
      "movedAt": "2026-04-14T12:02:44Z"
    },
    {
      "player": "red",
      "column": 2,
      "row": 4,
      "movedAt": "2026-04-14T12:03:20Z"
    },
    {
      "player": "yellow",
      "column": 1,
      "row": 5,
      "movedAt": "2026-04-14T12:03:55Z"
    },
    {
      "player": "red",
      "column": 2,
      "row": 3,
      "movedAt": "2026-04-14T12:04:37Z"
    }
  ],
  "result": null,
  "settings": {
    "rows": 6,
    "columns": 7,
    "reconnectTimeoutSeconds": 60
  }
}
```

# Connect 4

Monorepo with a **WebSocket server** (`@connect4/server`), a **Vite + Tailwind** browser client (`@connect4/client`), and shared types (`@connect4/shared`). Package management uses **pnpm** workspaces.

## Prerequisites

- [Node.js](https://nodejs.org/) (current LTS is a good default)
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

The client connects to `ws://localhost:3000`. Keep the server running before or as you load the page.

## Logging

- **Server** uses [**pino**](https://getpino.io/): structured JSON logs on stdout when `NODE_ENV=production` (good for aggregators). In development (`NODE_ENV` unset or not `production`), logs go through **pino-pretty** for readable lines. Set **`LOG_LEVEL`** to a pino level (e.g. `trace`, `debug`, `info`, `warn`) to tune verbosity; default is `debug` in dev and `info` in production.
- **Client** uses [**consola**](https://github.com/unjs/consola): tagged messages in the browser devtools console; production builds use a slightly quieter default level than dev.

Connection lifecycle, joins, drops, wins/draws, invalid JSON, and WebSocket errors are logged on the server; the client logs session start, open/close, message types (debug), and errors.

### Routes: home vs table (UUID)

The client uses a tiny **route tree** (no router framework):

| Path           | Screen                                                                                      |
| -------------- | ------------------------------------------------------------------------------------------- |
| `/`            | **Home** — “Create game” (new random UUID) or “Join” (paste UUID or full `/game/...` link). |
| `/game/<uuid>` | **Table** — enter display name, connect WebSocket, then play.                               |

- **`gameId` is always a UUID** for new games (`crypto.randomUUID()`). Share the **invite link** shown on the table screen (`…/game/<uuid>`).
- **Legacy** `?gameId=<uuid>` still works once: the app **replaces** the URL with `/game/<uuid>`.

### Why “game full”?

A room allows **at most two** seated players (red and yellow). You get “full” when:

1. **A third browser/tab** tries to join the same `gameId` while two players are already seated, or
2. **Previously:** a bug left seats “stuck” after a refresh because disconnect did not clear `players` in state. That is **fixed**: when a WebSocket closes, that seat is freed and in-progress games return to **waiting** with a **reset board** so someone can rejoin.

If you still see full with only two tabs, close stray tabs for that table or **create** a new game (new UUID).

## Production-style run

After `pnpm run build`:

- Start the server with Node from the compiled output, for example:  
  `node packages/server/dist/index.js`  
  (exact path matches your `packages/server` `outDir` / `rootDir` layout from `tsc`.)
- Serve `packages/client/dist/` with any static file host configured for an **SPA** (all paths such as `/game/<uuid>` must serve `index.html`). Ensure the WebSocket URL still points at your server (today it is hard-coded to `ws://localhost:3000` in `packages/client/src/gameSession.ts`).

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

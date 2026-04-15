# Connect 4 — TODO: Make It Compile

## 1. Root Workspace Setup

- [ ] Create `package.json` and `pnpm-workspace.yaml` for a pnpm workspace

  ```json
  {
    "name": "connect4",
    "private": true,
    "packageManager": "pnpm@10.18.3",
    "scripts": {
      "build": "pnpm -r run build",
      "dev:server": "pnpm --filter @connect4/server run dev",
      "dev:client": "pnpm --filter @connect4/client run dev"
    }
  }
  ```

  ```yaml
  packages:
    - 'packages/*'
  ```

- [ ] Create `tsconfig.base.json` at the root for shared TS settings

  ```json
  {
    "compilerOptions": {
      "target": "ES2022",
      "module": "NodeNext",
      "moduleResolution": "NodeNext",
      "strict": true,
      "declaration": true,
      "esModuleInterop": true,
      "skipLibCheck": true
    }
  }
  ```

---

## 2. `packages/shared`

- [ ] Create `packages/shared/package.json`

  ```json
  {
    "name": "@connect4/shared",
    "version": "1.0.0",
    "type": "module",
    "main": "./dist/index.js",
    "types": "./dist/index.d.ts",
    "scripts": {
      "build": "tsc"
    }
  }
  ```

- [ ] Create `packages/shared/tsconfig.json` extending root base
- [ ] Create `packages/shared/src/types.ts` _(provided in design)_
- [ ] Create `packages/shared/src/constants.ts`

  ```ts
  export const ROWS = 6
  export const COLS = 7
  ```

- [ ] Create `packages/shared/src/index.ts` to re-export everything

  ```ts
  export * from './types.js'
  export * from './constants.js'
  ```

---

## 3. `packages/server`

- [ ] Create `packages/server/package.json`

  ```json
  {
    "name": "@connect4/server",
    "version": "1.0.0",
    "type": "module",
    "scripts": {
      "dev": "tsx watch src/index.ts",
      "build": "tsc"
    },
    "dependencies": {
      "@connect4/shared": "*",
      "ws": "^8.18.0"
    },
    "devDependencies": {
      "@types/ws": "^8.5.14",
      "@types/node": "^22.0.0",
      "tsx": "^4.0.0",
      "typescript": "^5.0.0"
    }
  }
  ```

- [ ] Create `packages/server/tsconfig.json` extending root base
- [ ] Create `packages/server/src/game/rules.ts` _(provided in design)_
- [ ] Create `packages/server/src/game/GameRoom.ts` _(provided in design)_
- [ ] Create `packages/server/src/game/GameManager.ts` — **missing, needs to be written**

  ```ts
  import { GameRoom } from './GameRoom.js'

  export class GameManager {
    private rooms = new Map<string, GameRoom>()

    getOrCreate(gameId: string): GameRoom {
      if (!this.rooms.has(gameId)) {
        this.rooms.set(gameId, new GameRoom(gameId))
      }
      return this.rooms.get(gameId)!
    }

    get(gameId: string): GameRoom | undefined {
      return this.rooms.get(gameId)
    }
  }
  ```

- [ ] Create `packages/server/src/ws/handler.ts` — **missing, needs to be written** (optional extraction of WS logic from `index.ts`)
- [ ] Create `packages/server/src/index.ts` _(provided in design)_

---

## 4. `packages/client`

- [ ] Create `packages/client/package.json`

  ```json
  {
    "name": "@connect4/client",
    "version": "1.0.0",
    "type": "module",
    "scripts": {
      "dev": "vite",
      "build": "vite build"
    },
    "dependencies": {
      "@connect4/shared": "*"
    },
    "devDependencies": {
      "typescript": "^5.0.0",
      "vite": "^6.0.0"
    }
  }
  ```

- [ ] Create `packages/client/tsconfig.json` extending root base (set `"module": "ESNext"` for browser)
- [ ] Create `packages/client/vite.config.ts`

  ```ts
  import { defineConfig } from 'vite'

  export default defineConfig({ root: 'src' })
  ```

- [ ] Create `packages/client/src/index.html` — **missing, needs to be written**

  ```html
  <!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <title>Connect 4</title>
    </head>
    <body>
      <div id="board"></div>
      <script type="module" src="./main.ts"></script>
    </body>
  </html>
  ```

- [ ] Create `packages/client/src/main.ts` _(provided in design)_
- [ ] Create `packages/client/src/renderer.ts` — **missing, needs to be written**

  ```ts
  import { GameState } from '@connect4/shared'

  export function renderBoard(state: GameState, onDrop: (col: number) => void) {
    const container = document.getElementById('board')!
    container.innerHTML = ''

    state.board.forEach((row, r) => {
      row.forEach((cell, c) => {
        const el = document.createElement('div')
        el.className = `cell ${cell ?? 'empty'}`
        // Only attach click on top row (col header buttons), or per-column
        container.appendChild(el)
      })
    })

    // Column drop buttons
    for (let c = 0; c < state.board[0].length; c++) {
      const btn = document.createElement('button')
      btn.textContent = `↓`
      btn.onclick = () => onDrop(c)
      container.prepend(btn)
    }
  }
  ```

---

## 5. Build Order

Since `server` and `client` depend on `shared`, build in this order:

```bash
pnpm install                       # link workspace packages
pnpm run build                     # builds in dependency order (shared first)
pnpm run dev:server                # start server
pnpm run dev:client                # start Vite dev server
```

---

## 6. Known Gaps Summary

| File                                      | Status                               |
| ----------------------------------------- | ------------------------------------ |
| `packages/shared/src/types.ts`            | ✅ Provided                          |
| `packages/shared/src/constants.ts`        | ⚠️ Stub needed                       |
| `packages/shared/src/index.ts`            | ⚠️ Barrel export needed              |
| `packages/server/src/game/rules.ts`       | ✅ Provided                          |
| `packages/server/src/game/GameRoom.ts`    | ✅ Provided                          |
| `packages/server/src/game/GameManager.ts` | ❌ Missing — write from scratch      |
| `packages/server/src/ws/handler.ts`       | ❌ Missing — optional refactor       |
| `packages/server/src/index.ts`            | ✅ Provided                          |
| `packages/client/src/index.html`          | ❌ Missing — write from scratch      |
| `packages/client/src/main.ts`             | ✅ Provided                          |
| `packages/client/src/renderer.ts`         | ❌ Missing — write from scratch      |
| All `package.json` files                  | ❌ Missing — create for each package |
| All `tsconfig.json` files                 | ❌ Missing — create for each package |
| Root `tsconfig.base.json`                 | ❌ Missing — create at root          |

# Adding a new table game

This document describes how to plug a new title into the gameroom stack after the patterns used by Connect 4, tic-tac-toe, and rock–paper–scissors. For an **optional product backlog** (reconnect, persistence, tests, and so on), see [`docs/todo.md`](./todo.md).

The repo is a pnpm workspace: **`@gameroom/shared`** (types + wire contracts), **`@gameroom/server`** (room + game logic), **`@gameroom/client`** (Lit UI).

## 1. Shared package (`packages/shared`)

| Step | File | What to do |
| ---- | ---- | ---------- |
| 1a | New module, e.g. `src/myGame.ts` | Define the **state** type with a discriminant `game: 'my_game'`, `roomId`, `gameSessionId`, `players` as `readonly [PlayerId, PlayerId]` (or a larger tuple if you extend table capacity later), `status`, `result`, and any game-specific fields. Mirror `connect4.ts`, `ticTacToe.ts`, or `rockPaperScissors.ts`. |
| 1b | `src/room.ts` | Add your slug to **`GameKind`**, extend **`TABLE_GAME_KINDS`**, **`GAME_KIND_LABELS`**, import the new state type, and extend **`AnyGameState`**. |
| 1c | `src/messages.ts` | Extend **`GameMove`** with a variant tagged `game: 'my_game'` and the payload your client will send (`game_move`). |
| 1d | `src/gameMetrics.ts` | If the game can end in a way not already listed, add a **`GameMetricsEndReason`** variant and map it in **`outcomeDetailPhrase`**. |
| 1e | `src/index.ts` | `export * from '@/myGame.js'` (path alias matches `tsconfig`). |
| Optional | Same module | If some fields must **never** be sent to certain clients, add a **`wire*ForViewer`** helper (see `wireRockPaperScissorsForViewer` in `rockPaperScissors.ts`) and call it from that game’s **`RoomGameEngine.wireActiveSnapshot`** in `gameEngines.ts`. |

## 2. Server package (`packages/server`)

| Step | File | What to do |
| ---- | ---- | ---------- |
| 2a | `src/game/myGameSession.ts` (new) | Implement **`createGame(roomId, gameSessionId, players)`** returning initial state, **`applyMove(state, playerId, …)`** returning `SessionMoveResult` (`packages/server/src/game/sessionTypes.ts`), **`startNewRound(state, nextPlayers)`** for rematch (reset in-place like existing sessions), and keep roster length consistent with your engine’s `maxPlayers`. |
| 2b | `src/game/gameEngines.ts` | Add a **`RoomGameEngine`** (`kind`, **`chatLabel`**, `minPlayers`, `maxPlayers`, `create`, `applyMove`, `startNewRound`, `surrender`, **`announceGameStarted`**, **`announceGameFinished`**, optional **`wireActiveSnapshot`**, optional **`requiresTurnOrder: false`**). Append the engine to **`REGISTERED_TABLE_GAME_ENGINES`**. |
| 2c | `src/game/surrender.ts` | Extend **`SurrenderableGame`** and **`applySurrender`** if the new state should support surrender during `in_progress`. |
| 2d | `src/room/PlayerRoom.ts` | **No changes** for chat labels, announcements, or snapshot wiring — `PlayerRoom` delegates to the engine. |

No change is usually required in `packages/server/src/index.ts` for WebSocket routing: `create_game` / `game_move` / `surrender` / rematch messages are already generic.

## 3. Client package (`packages/client`)

| Step | File | What to do |
| ---- | ---- | ---------- |
| 3a | `src/views/myGameView.ts` (new) | Same as before: follow an existing **`render*View`**. |
| 3b | **`src/games/tableRegistry.ts`** | Add **`boardIsUnstarted`** branch, **`paintRegisteredTableGame`** `switch` case, and a **`TABLE_GAME_PICKER_CARDS`** entry (title, blurb, art, accent). |
| 3c | `src/views/gameSummaryDialog.ts` | Usually **no change** — recap uses **`GAME_KIND_LABELS`** and **`outcomeDetailPhrase`** from shared. |

Reuse **`connect4RosterSlot`** in `playerLabels.ts` whenever you need roster index 0/1 for the active two-player game.

## 4. Checklist (today’s repo — copy when starting a title)

- [ ] `packages/shared/src/<game>.ts` — state + result types (+ optional `wire*ForViewer` for hidden fields)
- [ ] `packages/shared/src/room.ts` — `GameKind`, **`TABLE_GAME_KINDS`**, **`GAME_KIND_LABELS`**, `AnyGameState`
- [ ] `packages/shared/src/messages.ts` — `GameMove`
- [ ] `packages/shared/src/gameMetrics.ts` — `GameMetricsEndReason` (if needed) + **`outcomeDetailPhrase`**
- [ ] `packages/shared/src/index.ts` — export
- [ ] `packages/server/src/game/<game>Session.ts` — create / apply / startNewRound
- [ ] `packages/server/src/game/gameEngines.ts` — full **`RoomGameEngine`** + append to **`REGISTERED_TABLE_GAME_ENGINES`**
- [ ] `packages/server/src/game/surrender.ts` — if surrenderable
- [ ] `packages/client/src/views/<game>View.ts` — UI + rematch + surrender
- [ ] **`packages/client/src/games/tableRegistry.ts`** — `boardIsUnstarted`, `paintRegisteredTableGame`, **`TABLE_GAME_PICKER_CARDS`**

Then run **`pnpm run build`** and **`pnpm run lint`** from the repo root.

Shared **unions** (`GameKind`, `AnyGameState`, `GameMove`) still need edits until you adopt **codegen** or **string kinds + runtime validation** (see §7).

## 5. Design notes

- **Table model:** Seats are abstract indices (`tableSeat.ts`). Game rosters are `PlayerId[]` / tuples shuffled when a session starts or rematches (`PlayerRoom.shuffledRoster()`). Do not hard-code colors as room-level identity; use roster index + CSS classes (`disc-0` / `disc-1`) where needed.
- **Turns:** Default is sequential turns enforced in `PlayerRoom.handleMove` via `state.currentTurn`. Opt out with **`requiresTurnOrder: false`** on the engine.
- **Post-game metrics:** `game_summary` is emitted when a session leaves `in_progress`; `gameKind` and `outcome.reason` come from shared types—keep them consistent.
- **Secrets on the wire:** If a game has hidden per-player information, **do not** broadcast one shared `activeGame` JSON to everyone. Redact per viewer in `getSnapshot(forPlayerId)` (see rock–paper–scissors) so other clients never receive the hidden payload.

## 6. Out of scope here

Lobby listing (`GameManager`), global chat, and room chat do not need changes for a new two-seat game. If you add games with **more than two** seats, you will need to revisit `ROOM_TABLE_CAPACITY`, roster building, and UI that assumes two pills.

---

## 7. Goal: rarely edit “core” files when adding a game

**Implemented (server):** `RoomGameEngine` includes **`chatLabel`**, **`announceGameStarted`**, **`announceGameFinished`**, and optional **`wireActiveSnapshot`**. `PlayerRoom` delegates chat and per-viewer snapshots to the engine. Engines are listed once in **`REGISTERED_TABLE_GAME_ENGINES`** in `gameEngines.ts`.

**Implemented (client):** `packages/client/src/games/tableRegistry.ts` owns **`paintRegisteredTableGame`**, **`boardIsUnstarted`**, and **`TABLE_GAME_PICKER_CARDS`**. `gameSession.ts` no longer branches per game for paint or picker cards.

**Still manual (shared types):** `GameKind`, `AnyGameState`, and `GameMove` remain closed unions until you add **codegen** or **string kinds + runtime validation**.

### Next optional steps

- Split each engine into **`packages/server/src/game/games/<slug>/`** and keep **`REGISTERED_TABLE_GAME_ENGINES`** as the only import list.
- **`import.meta.glob`** for client views if you want to avoid growing `tableRegistry.ts` `switch`.
- **Codegen** for shared unions from per-game manifests.

### Shared types: the hard part

| Approach | Core file edits | Type safety |
| -------- | --------------- | ----------- |
| Keep unions (current) | Several shared files per new game | Strong |
| **`GameKind` string + Zod/io-ts per game** | Core stays generic; each game owns schema | Runtime |
| **Codegen** | **New folder + run script** (ideal) | Strong if generated output is checked in |

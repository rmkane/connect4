# Adding a new table game

This document describes how to plug a new title into the gameroom stack after the patterns used by Connect 4, tic-tac-toe, and rock–paper–scissors. For an **optional product backlog** (reconnect, persistence, tests, and so on), see [`docs/todo.md`](./todo.md).

The repo is a pnpm workspace: **`@gameroom/shared`** (types + wire contracts), **`@gameroom/server`** (room + game logic), **`@gameroom/client`** (Lit UI).

## 1. Shared package (`packages/shared`)

| Step | File | What to do |
| ---- | ---- | ---------- |
| 1a | New module, e.g. `src/myGame.ts` | Define the **state** type with a discriminant `game: 'my_game'`, `roomId`, `gameSessionId`, `players` as `readonly [PlayerId, PlayerId]` (or a larger tuple if you extend table capacity later), `status`, `result`, and any game-specific fields. Mirror `connect4.ts`, `ticTacToe.ts`, or `rockPaperScissors.ts`. |
| 1b | `src/room.ts` | Add your slug to **`GameKind`**, import the new state type, and extend **`AnyGameState`**. `GameListing.kind` picks this up automatically. |
| 1c | `src/messages.ts` | Extend **`GameMove`** with a variant tagged `game: 'my_game'` and the payload your client will send (`game_move`). |
| 1d | `src/gameMetrics.ts` | If the game can end in a way not already listed, add a **`GameMetricsEndReason`** variant. Align finished `activeGame.result.reason` with this where metrics are finalized. |
| 1e | `src/index.ts` | `export * from '@/myGame.js'` (path alias matches `tsconfig`). |
| Optional | Same module or `room.ts` | If some fields must **never** be sent to certain clients (hidden information), add a **`wire*ForViewer(state, viewerId)`** helper and document it next to `wireRockPaperScissorsForViewer` in `rockPaperScissors.ts`. The server must call it when building `room_state` (see §3). |

## 2. Server package (`packages/server`)

| Step | File | What to do |
| ---- | ---- | ---------- |
| 2a | `src/game/myGameSession.ts` (new) | Implement **`createGame(roomId, gameSessionId, players)`** returning initial state, **`applyMove(state, playerId, …)`** returning `SessionMoveResult` (`packages/server/src/game/sessionTypes.ts`), **`startNewRound(state, nextPlayers)`** for rematch (reset in-place like existing sessions), and keep roster length consistent with your engine’s `maxPlayers`. |
| 2b | `src/game/gameEngines.ts` | Add a **`RoomGameEngine`**: `kind`, `minPlayers`, `maxPlayers`, `create`, `applyMove` (narrow `state.game` + `move.game`), `startNewRound`, `surrender`. Register it on **`enginesByKind`**. Set **`requiresTurnOrder: false`** only if moves are not gated on `state.currentTurn === playerId` (see `PlayerRoom.handleMove`). |
| 2c | `src/game/surrender.ts` | Extend **`SurrenderableGame`** and **`applySurrender`** if the new state should support surrender during `in_progress`. |
| 2d | `src/room/PlayerRoom.ts` | **Strings:** `gameLabel`, `announceGameStarted`, `announceGameFinished` (map `result.reason` to human phrases like the existing branches). **`getSnapshot(forPlayerId?)`:** if the game uses per-viewer redaction, clone `activeGame` and run your wire helper before putting it on `RoomSnapshot` (rock–paper–scissors does this). **`broadcast()`** already sends **one snapshot per seated socket** so each player can receive a different `activeGame` payload. Everything else (create game, moves, rematch, metrics, disconnect) is generic once the engine is registered. |

No change is usually required in `packages/server/src/index.ts` for WebSocket routing: `create_game` / `game_move` / `surrender` / rematch messages are already generic.

## 3. Client package (`packages/client`)

| Step | File | What to do |
| ---- | ---- | ---------- |
| 3a | `src/views/myGameView.ts` (new) | Follow **`connect4View.ts`**, **`ticTacToeView.ts`**, or **`rockPaperScissorsView.ts`**: header row, rules/surrender modals if needed, rematch controls (`RematchControls` from `rematchControls.ts`), “New game” → `dismiss_completed_game`, completed-state + `pendingRematch` handling, optional recap button. Render into the `#board` element like the other `render*View` functions. |
| 3b | `src/gameSession.ts` | **`boardIsUnstarted`:** extend so “fresh round / dismiss stale recap” logic stays correct for your state (empty board vs RPS-style counters; see existing branches). **`paintBoardArea`:** branch on `s.activeGame.game`, wire `game_move` and `surrender`, pass rematch callbacks and `recapForSession` like the other games. **`gamePicker`:** add a button that sends `create_game` with your `GameKind`. |
| 3c | `src/views/gameSummaryDialog.ts` | Add display name for **`summary.gameKind`** and any new **`outcome.reason`** phrasing in `outcomeDescription`. |

Reuse **`connect4RosterSlot`** in `playerLabels.ts` whenever you need roster index 0/1 for the active two-player game.

## 4. Checklist (copy when starting a title)

- [ ] `packages/shared/src/<game>.ts` — state + result types (+ optional wire helper for hidden fields)
- [ ] `packages/shared/src/room.ts` — `GameKind`, `AnyGameState`
- [ ] `packages/shared/src/messages.ts` — `GameMove`
- [ ] `packages/shared/src/gameMetrics.ts` — `GameMetricsEndReason` (if needed)
- [ ] `packages/shared/src/index.ts` — export
- [ ] `packages/server/src/game/<game>Session.ts` — create / apply / startNewRound
- [ ] `packages/server/src/game/gameEngines.ts` — engine + `enginesByKind`
- [ ] `packages/server/src/game/surrender.ts` — if surrenderable
- [ ] `packages/server/src/room/PlayerRoom.ts` — chat labels, announcements, optional `getSnapshot` redaction
- [ ] `packages/client/src/views/<game>View.ts` — UI + rematch + surrender
- [ ] `packages/client/src/gameSession.ts` — `boardIsUnstarted`, `paintBoardArea`, `gamePicker`
- [ ] `packages/client/src/views/gameSummaryDialog.ts` — labels / outcome copy

Then run **`pnpm run build`** and **`pnpm run lint`** from the repo root.

## 5. Design notes

- **Table model:** Seats are abstract indices (`tableSeat.ts`). Game rosters are `PlayerId[]` / tuples shuffled when a session starts or rematches (`PlayerRoom.shuffledRoster()`). Do not hard-code colors as room-level identity; use roster index + CSS classes (`disc-0` / `disc-1`) where needed.
- **Turns:** Default is sequential turns enforced in `PlayerRoom.handleMove` via `state.currentTurn`. Opt out with **`requiresTurnOrder: false`** on the engine.
- **Post-game metrics:** `game_summary` is emitted when a session leaves `in_progress`; `gameKind` and `outcome.reason` come from shared types—keep them consistent.
- **Secrets on the wire:** If a game has hidden per-player information, **do not** broadcast one shared `activeGame` JSON to everyone. Redact per viewer in `getSnapshot(forPlayerId)` (see rock–paper–scissors) so other clients never receive the hidden payload.

## 6. Out of scope here

Lobby listing (`GameManager`), global chat, and room chat do not need changes for a new two-seat game. If you add games with **more than two** seats, you will need to revisit `ROOM_TABLE_CAPACITY`, roster building, and UI that assumes two pills.

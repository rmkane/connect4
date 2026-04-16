import type { AnyGameState, GameKind, GameMove, PlayerId } from '@gameroom/shared'

import * as connect4Session from '@/game/connect4Session.js'
import type { SessionMoveResult } from '@/game/sessionTypes.js'
import { applySurrender } from '@/game/surrender.js'
import * as ticTacToeSession from '@/game/ticTacToeSession.js'

/**
 * Strategy for one `GameKind`: create state, apply moves, rematch, surrender.
 *
 * **`minPlayers` / `maxPlayers`** bound how many seated humans must be present to start or
 * rematch. The room passes a **roster** — ordered `PlayerId[]` of length `maxPlayers` — built
 * from table seats (shuffled vs join order where games care). Larger titles (Hearts, poker)
 * raise `maxPlayers` and pair with a room whose `ROOM_TABLE_CAPACITY` matches (see
 * `PlayerRoom.createGame`).
 */
export interface RoomGameEngine {
  readonly kind: GameKind
  readonly minPlayers: number
  readonly maxPlayers: number
  create(roomId: string, gameSessionId: string, players: readonly PlayerId[]): AnyGameState
  applyMove(state: AnyGameState, playerId: PlayerId, move: GameMove): SessionMoveResult
  startNewRound(state: AnyGameState, players: readonly PlayerId[]): void
  surrender(state: AnyGameState, playerId: PlayerId): PlayerId
}

const connect4Engine: RoomGameEngine = {
  kind: 'connect4',
  minPlayers: 2,
  maxPlayers: 2,
  create: connect4Session.createGame,
  applyMove: (state, playerId, move) => {
    if (state.game !== 'connect4' || move.game !== 'connect4') return { kind: 'invalid' }
    return connect4Session.applyMove(state, playerId, move.column)
  },
  startNewRound: (state, players) => {
    if (state.game !== 'connect4') return
    connect4Session.startNewRound(state, players)
  },
  surrender: (state, playerId) => {
    if (state.game !== 'connect4') throw new Error('connect4 engine: wrong state')
    return applySurrender(state, playerId)
  },
}

const ticTacToeEngine: RoomGameEngine = {
  kind: 'tic_tac_toe',
  minPlayers: 2,
  maxPlayers: 2,
  create: ticTacToeSession.createGame,
  applyMove: (state, playerId, move) => {
    if (state.game !== 'tic_tac_toe' || move.game !== 'tic_tac_toe') return { kind: 'invalid' }
    return ticTacToeSession.applyMove(state, playerId, move.row, move.col)
  },
  startNewRound: (state, players) => {
    if (state.game !== 'tic_tac_toe') return
    ticTacToeSession.startNewRound(state, players)
  },
  surrender: (state, playerId) => {
    if (state.game !== 'tic_tac_toe') throw new Error('tic_tac_toe engine: wrong state')
    return applySurrender(state, playerId)
  },
}

const enginesByKind: Record<GameKind, RoomGameEngine> = {
  connect4: connect4Engine,
  tic_tac_toe: ticTacToeEngine,
}

export function getEngine(kind: GameKind): RoomGameEngine {
  return enginesByKind[kind]
}

export function getEngineForActiveState(state: AnyGameState): RoomGameEngine {
  return enginesByKind[state.game]
}

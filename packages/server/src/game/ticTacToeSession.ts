import type { PlayerId, TicTacToeState } from '@gameroom/shared'

import type { SessionMoveResult } from '@/game/sessionTypes.js'
import { otherPlayer } from '@/game/twoPlayer.js'
import * as rules from '@/games/ticTacToe/rules.js'

/** Second seat in `players` opens (maps to “O” in UI copy). */
function pickOpening(players: readonly [PlayerId, PlayerId]): PlayerId {
  return players[1]
}

export function createGame(
  roomId: string,
  gameSessionId: string,
  players: readonly [PlayerId, PlayerId]
): TicTacToeState {
  return {
    game: 'tic_tac_toe',
    roomId,
    gameSessionId,
    players,
    board: rules.makeBoard(),
    currentTurn: pickOpening(players),
    status: 'in_progress',
    result: null,
  }
}

export function applyMove(
  state: TicTacToeState,
  playerId: PlayerId,
  row: number,
  col: number
): SessionMoveResult {
  if (!rules.placePiece(state.board, row, col, playerId)) {
    return { kind: 'invalid' }
  }

  if (rules.checkWin(state.board, row, col)) {
    state.status = 'completed'
    state.result = { winner: playerId, reason: 'three_in_row' }
    return { kind: 'finished', winner: playerId }
  }
  if (rules.checkDraw(state.board)) {
    state.status = 'completed'
    state.result = { winner: null, reason: 'draw' }
    return { kind: 'finished', winner: null }
  }
  state.currentTurn = otherPlayer(state.players, playerId)
  return { kind: 'ongoing' }
}

export function startNewRound(
  state: TicTacToeState,
  nextPlayers: readonly [PlayerId, PlayerId]
): void {
  state.players = nextPlayers
  state.board = rules.makeBoard()
  state.currentTurn = pickOpening(nextPlayers)
  state.status = 'in_progress'
  state.result = null
}

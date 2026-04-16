import type { Connect4State, PlayerId } from '@gameroom/shared'

import type { SessionMoveResult } from '@/game/sessionTypes.js'
import { otherPlayer } from '@/game/twoPlayer.js'
import * as rules from '@/games/connect4/rules.js'

function pickOpening(players: readonly [PlayerId, PlayerId]): PlayerId {
  return Math.random() < 0.5 ? players[0] : players[1]
}

export function createGame(
  roomId: string,
  gameSessionId: string,
  players: readonly [PlayerId, PlayerId]
): Connect4State {
  return {
    game: 'connect4',
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
  state: Connect4State,
  playerId: PlayerId,
  column: number
): SessionMoveResult {
  const row = rules.dropPiece(state.board, column, playerId)
  if (row === -1) return { kind: 'invalid' }

  if (rules.checkWin(state.board, row, column)) {
    state.status = 'completed'
    state.result = { winner: playerId, reason: 'four_in_a_row' }
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
  state: Connect4State,
  nextPlayers: readonly [PlayerId, PlayerId]
): void {
  state.players = nextPlayers
  state.board = rules.makeBoard()
  state.currentTurn = pickOpening(nextPlayers)
  state.status = 'in_progress'
  state.result = null
}

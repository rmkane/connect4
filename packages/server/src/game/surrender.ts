import type { Connect4State, PlayerId, TicTacToeState } from '@gameroom/shared'

import { otherPlayer } from '@/game/twoPlayer.js'

export type SurrenderableGame = Connect4State | TicTacToeState

/** Mutates `state` to completed with surrender result. Returns the winning player id. */
export function applySurrender(state: SurrenderableGame, playerId: PlayerId): PlayerId {
  const opponent = otherPlayer(state.players, playerId)
  state.status = 'completed'
  if (state.game === 'connect4') {
    state.result = { winner: opponent, reason: 'surrender' }
  } else {
    state.result = { winner: opponent, reason: 'surrender' }
  }
  return opponent
}

import type { PlayerId } from '@/core.js'

export type TicTacToeCell = PlayerId | null

export interface TicTacToeResult {
  winner: PlayerId | null
  reason: 'three_in_row' | 'draw' | 'forfeit' | 'surrender'
}

export interface TicTacToeState {
  game: 'tic_tac_toe'
  roomId: string
  gameSessionId: string
  /** Roster `[marks X, marks O]` — order is randomized vs table seats when the game starts / rematches; O always opens. */
  players: readonly [PlayerId, PlayerId]
  board: TicTacToeCell[][]
  currentTurn: PlayerId
  status: 'in_progress' | 'completed' | 'abandoned'
  result: TicTacToeResult | null
}

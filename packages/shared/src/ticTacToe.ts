import type { Color } from '@/core.js'

export type TicTacToeCell = Color | null

export interface TicTacToeResult {
  winner: Color | null
  reason: 'three_in_row' | 'draw' | 'forfeit'
}

export interface TicTacToeState {
  game: 'tic_tac_toe'
  roomId: string
  gameSessionId: string
  board: TicTacToeCell[][]
  currentTurn: Color
  status: 'in_progress' | 'completed' | 'abandoned'
  result: TicTacToeResult | null
}

import type { Cell, Color } from '@/core.js'

export interface Connect4Result {
  winner: Color | null
  reason: 'four_in_a_row' | 'draw' | 'forfeit'
}

export interface Connect4State {
  game: 'connect4'
  roomId: string
  gameSessionId: string
  board: Cell[][]
  currentTurn: Color
  status: 'in_progress' | 'completed' | 'abandoned'
  result: Connect4Result | null
}

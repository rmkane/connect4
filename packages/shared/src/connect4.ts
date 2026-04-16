import type { PlayerId } from '@/core.js'

export interface Connect4Result {
  winner: PlayerId | null
  reason: 'four_in_a_row' | 'draw' | 'forfeit' | 'surrender'
}

export interface Connect4State {
  game: 'connect4'
  roomId: string
  gameSessionId: string
  /** Roster `[slot 0, slot 1]` — order is randomized vs table seats when the game starts / rematches. */
  players: readonly [PlayerId, PlayerId]
  board: (PlayerId | null)[][]
  currentTurn: PlayerId
  status: 'in_progress' | 'completed' | 'abandoned'
  result: Connect4Result | null
}

export type Color = 'red' | 'yellow'
export type Cell = Color | null

export interface GameState {
  gameId: string
  board: Cell[][]
  currentTurn: Color
  status: 'waiting' | 'in_progress' | 'completed' | 'abandoned'
  players: { red: PlayerInfo | null; yellow: PlayerInfo | null }
  result: GameResult | null
}

export interface PlayerInfo {
  id: string
  displayName: string
}

export interface GameResult {
  winner: Color | null
  reason: 'four_in_a_row' | 'draw' | 'forfeit'
}

// Messages client → server
export type ClientMessage =
  | { type: 'join_game'; gameId: string; displayName: string }
  | { type: 'drop_piece'; gameId: string; column: number }

// Messages server → client
export type ServerMessage =
  | { type: 'game_state'; state: GameState }
  | { type: 'error'; message: string }
  | { type: 'player_disconnected'; color: Color }
  | { type: 'player_reconnected'; color: Color }

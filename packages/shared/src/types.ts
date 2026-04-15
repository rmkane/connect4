export type Color = 'red' | 'yellow'
export type Cell = Color | null

export interface GameState {
  gameId: string
  board: Cell[][]
  currentTurn: Color
  status: 'waiting' | 'in_progress' | 'completed' | 'abandoned'
  players: { red: PlayerInfo | null; yellow: PlayerInfo | null }
  result: GameResult | null
  /** Wins in this room since it was created (draws do not increment). */
  matchScores: { red: number; yellow: number }
}

export interface PlayerInfo {
  id: string
  displayName: string
}

export interface GameResult {
  winner: Color | null
  reason: 'four_in_a_row' | 'draw' | 'forfeit'
}

/** Lobby row from `GET /api/rooms` (waiting with a free seat, or full `in_progress`). */
export interface PublicRoomSummary {
  gameId: string
  status: 'waiting' | 'in_progress'
  redDisplayName: string | null
  yellowDisplayName: string | null
}

export interface RoomsListResponse {
  rooms: PublicRoomSummary[]
}

// Messages client → server
export type ClientMessage =
  | { type: 'join_game'; gameId: string; displayName: string }
  | { type: 'drop_piece'; gameId: string; column: number }
  | { type: 'new_game'; gameId: string }

// Messages server → client
export type ServerMessage =
  | { type: 'game_state'; state: GameState }
  | { type: 'error'; message: string }
  | { type: 'player_disconnected'; color: Color }
  | { type: 'player_reconnected'; color: Color }

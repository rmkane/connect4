import type { Connect4State } from '@/connect4.js'
import type { PlayerId, PlayerInfo } from '@/core.js'
import type { TicTacToeState } from '@/ticTacToe.js'

export type GameKind = 'connect4' | 'tic_tac_toe'

export interface GameListing {
  gameSessionId: string
  kind: GameKind
  status: 'in_progress' | 'completed' | 'abandoned'
}

export type AnyGameState = Connect4State | TicTacToeState

export interface RoomSnapshot {
  roomId: string
  seats: { red: PlayerInfo | null; yellow: PlayerInfo | null }
  /**
   * Wins in this room keyed by `PlayerId` (draws do not increment).
   * Includes an entry for each currently seated player (default 0).
   */
  matchScores: Record<PlayerId, number>
  games: GameListing[]
  activeGame: AnyGameState | null
}

/** Lobby row from `GET /api/rooms` (waiting with a free seat, or full table). */
export interface PublicRoomSummary {
  roomId: string
  status: 'waiting' | 'in_progress'
  redDisplayName: string | null
  yellowDisplayName: string | null
}

export interface RoomsListResponse {
  rooms: PublicRoomSummary[]
}

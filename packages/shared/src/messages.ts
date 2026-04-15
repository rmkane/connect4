import type { GameKind, RoomSnapshot } from '@/room.js'

export type GameMove =
  | { game: 'connect4'; column: number }
  | { game: 'tic_tac_toe'; row: number; col: number }

// Messages client → server
export type ClientMessage =
  | { type: 'join_room'; roomId: string; displayName: string }
  | { type: 'create_game'; roomId: string; kind: GameKind }
  | { type: 'game_move'; roomId: string; gameSessionId: string; move: GameMove }
  | { type: 'new_round'; roomId: string; gameSessionId: string }

// Messages server → client
export type ServerMessage =
  | { type: 'room_state'; snapshot: RoomSnapshot }
  | { type: 'error'; message: string }

import type { Color, PlayerId } from '@/core.js'
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
  | { type: 'surrender'; roomId: string; gameSessionId: string }
  /** After a finished game, return to the “choose a game” screen (either player may send). */
  | { type: 'dismiss_completed_game'; roomId: string }

// Messages server → client
export type ServerMessage =
  | { type: 'room_state'; snapshot: RoomSnapshot }
  /** Sent only to the connection that successfully `join_room`d (includes stable `playerId`). */
  | { type: 'joined_room'; roomId: string; playerId: PlayerId; seat: Color }
  | { type: 'error'; message: string }

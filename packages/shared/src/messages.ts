import type { ChatMessagePayload } from '@/chat.js'
import type { PlayerId } from '@/core.js'
import type { GameMetricsSummary } from '@/gameMetrics.js'
import type { GameKind, RoomSnapshot } from '@/room.js'
import type { TableSeatIndex } from '@/tableSeat.js'

export type GameMove =
  | { game: 'connect4'; column: number }
  | { game: 'tic_tac_toe'; row: number; col: number }

// Messages client → server
export type ClientMessage =
  | { type: 'join_room'; roomId: string; displayName: string }
  | { type: 'create_game'; roomId: string; kind: GameKind }
  | { type: 'game_move'; roomId: string; gameSessionId: string; move: GameMove }
  /** After a completed game — asks the opponent to agree to another round (same session id). */
  | { type: 'rematch_offer'; roomId: string; gameSessionId: string }
  | { type: 'rematch_accept'; roomId: string; gameSessionId: string }
  | { type: 'rematch_decline'; roomId: string; gameSessionId: string }
  /** Requester withdraws before the opponent responds. */
  | { type: 'rematch_cancel'; roomId: string; gameSessionId: string }
  | { type: 'surrender'; roomId: string; gameSessionId: string }
  /** After a finished game, return to the “choose a game” screen (either player may send). */
  | { type: 'dismiss_completed_game'; roomId: string }
  /** Table host only — short display title for the table (see `sanitizeRoomTitle`). */
  | { type: 'set_room_title'; roomId: string; title: string }
  /** Current table host only — hands host to another seated player. */
  | { type: 'transfer_leadership'; roomId: string; newLeaderId: PlayerId }
  /** Join the global lobby chat on this socket (no account required). */
  | { type: 'chat_subscribe_global'; displayName: string }
  | { type: 'chat_send'; scope: 'room'; roomId: string; text: string }
  | { type: 'chat_send'; scope: 'global'; text: string }

// Messages server → client
export type ServerMessage =
  | { type: 'room_state'; snapshot: RoomSnapshot }
  /** Sent only to the connection that successfully `join_room`d (includes stable `playerId`). */
  | {
      type: 'joined_room'
      roomId: string
      playerId: PlayerId
      seat: TableSeatIndex
      leaderId: PlayerId
    }
  | { type: 'error'; message: string }
  | ({ type: 'chat_message' } & ChatMessagePayload)
  | {
      type: 'chat_history'
      scope: 'room' | 'global'
      roomId?: string
      messages: ChatMessagePayload[]
    }
  /** Sent to all seated connections when a game leaves `in_progress` (completed or abandoned). */
  | { type: 'game_summary'; summary: GameMetricsSummary }

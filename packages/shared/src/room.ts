import type { PlayerId } from '@/core.js'
import type { AnyGameState, GameKind } from '@/games/registry.js'
import type { RoomSeatsTuple } from '@/tableSeat.js'

export type { AnyGameState, GameKind } from '@/games/registry.js'
export { GAME_KIND_LABELS, TABLE_GAME_KINDS } from '@/games/registry.js'

export interface GameListing {
  gameSessionId: string
  kind: GameKind
  status: 'in_progress' | 'completed' | 'abandoned'
}

/** Waiting for the other seated player to accept a rematch for this session. */
export interface PendingRematch {
  gameSessionId: string
  requesterId: PlayerId
  /** Changes on each new offer so the client can show a fresh prompt (e.g. after cancel + re-offer). */
  offeredAt: number
}

export interface RoomSnapshot {
  roomId: string
  /** Custom label for the table; empty means “use room id” in UI. */
  roomTitle: string
  /**
   * Table host (first joiner, or promoted on host leave / `transfer_leadership`).
   * `null` when the room is empty.
   */
  leaderId: PlayerId | null
  /** Physical table slots in join order; length = `ROOM_TABLE_CAPACITY` from `@/tableSeat.js`. */
  seats: RoomSeatsTuple
  /**
   * Wins in this room keyed by `PlayerId` (draws do not increment).
   * Includes an entry for each currently seated player (default 0).
   */
  matchScores: Record<PlayerId, number>
  games: GameListing[]
  activeGame: AnyGameState | null
  /** `null` when no one has asked to play again since the last completed round. */
  pendingRematch: PendingRematch | null
}

/** Lobby row from `GET /api/rooms` (waiting with a free seat, or full table). */
export interface PublicRoomSummary {
  roomId: string
  /** Set when hosts rename the table (lobby display). */
  roomTitle?: string
  status: 'waiting' | 'in_progress'
  /** Display names per table seat index (join order); `null` when that slot is empty. */
  seatDisplayNames: readonly [string | null, string | null]
}

export interface RoomsListResponse {
  rooms: PublicRoomSummary[]
}

import type { PlayerId, PlayerInfo } from '@/core.js'

/**
 * How many physical chairs this server build wires per room today.
 * Raise this and generalize `PlayerRoom` when adding 4-player (Hearts) or larger tables.
 */
export const ROOM_TABLE_CAPACITY = 2 as const

/** Join order: `0` = first to sit, `1` = second, … (no tie to any game’s piece colors). */
export type TableSeatIndex = 0 | 1

export const TABLE_SEAT_INDICES: readonly TableSeatIndex[] = [0, 1]

/** Snapshot of who occupies each table slot (same length as `ROOM_TABLE_CAPACITY`). */
export type RoomSeatsTuple = readonly [PlayerInfo | null, PlayerInfo | null]

export function roomTableIsFull(seats: RoomSeatsTuple): boolean {
  return seats[0] !== null && seats[1] !== null
}

export function seatedPlayerCount(seats: RoomSeatsTuple): number {
  return (seats[0] ? 1 : 0) + (seats[1] ? 1 : 0)
}

export function firstOpenSeatIndex(seats: RoomSeatsTuple): TableSeatIndex | null {
  if (seats[0] === null) return 0
  if (seats[1] === null) return 1
  return null
}

export function tableSeatIndexForPlayer(
  seats: RoomSeatsTuple,
  playerId: PlayerId
): TableSeatIndex | null {
  if (seats[0]?.id === playerId) return 0
  if (seats[1]?.id === playerId) return 1
  return null
}

export function displayNameAtSeat(seats: RoomSeatsTuple, index: TableSeatIndex): string | null {
  return seats[index]?.displayName ?? null
}

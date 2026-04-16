import type { PlayerId, RoomSnapshot } from '@gameroom/shared'
import { tableSeatIndexForPlayer } from '@gameroom/shared'

export function displayNameFor(
  snapshot: RoomSnapshot,
  playerId: PlayerId | null | undefined
): string {
  if (!playerId) return '—'
  const idx = tableSeatIndexForPlayer(snapshot.seats, playerId)
  if (idx === null) return '—'
  return snapshot.seats[idx]!.displayName
}

/** Which physical table slot this player occupies (`null` if not seated). */
export function tableSeatIndexForSeatedPlayer(
  snapshot: RoomSnapshot,
  playerId: PlayerId | null
): 0 | 1 | null {
  if (!playerId) return null
  return tableSeatIndexForPlayer(snapshot.seats, playerId)
}

/** In this game instance, which roster index owns this cell (`null` = empty). */
export function pieceCellClass(
  gamePlayers: readonly [PlayerId, PlayerId],
  cell: PlayerId | null
): 'empty' | 'disc-0' | 'disc-1' {
  if (!cell) return 'empty'
  if (cell === gamePlayers[0]) return 'disc-0'
  if (cell === gamePlayers[1]) return 'disc-1'
  return 'empty'
}

/** In this game instance, `players[0]` is X, `players[1]` is O. */
export function markForPlayer(
  gamePlayers: readonly [PlayerId, PlayerId],
  playerId: PlayerId
): 'X' | 'O' | null {
  if (playerId === gamePlayers[0]) return 'X'
  if (playerId === gamePlayers[1]) return 'O'
  return null
}

/** Roster index (`0` or `1`) for this player in the active Connect 4 game. */
export function connect4RosterSlot(
  gamePlayers: readonly [PlayerId, PlayerId],
  playerId: PlayerId | null
): 0 | 1 | null {
  if (!playerId) return null
  if (playerId === gamePlayers[0]) return 0
  if (playerId === gamePlayers[1]) return 1
  return null
}

export function matchScoreFor(snapshot: RoomSnapshot, playerId: PlayerId): number {
  return snapshot.matchScores[playerId] ?? 0
}

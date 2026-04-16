import type { PlayerId, RoomSnapshot } from '@gameroom/shared'

export function displayNameFor(
  snapshot: RoomSnapshot,
  playerId: PlayerId | null | undefined
): string {
  if (!playerId) return '—'
  if (snapshot.seats.red?.id === playerId) return snapshot.seats.red.displayName
  if (snapshot.seats.yellow?.id === playerId) return snapshot.seats.yellow.displayName
  return '—'
}

/** Room join order only (first / second seat in the room). */
export function seatSideForPlayer(
  snapshot: RoomSnapshot,
  playerId: PlayerId | null
): 'red' | 'yellow' | null {
  if (!playerId) return null
  if (snapshot.seats.red?.id === playerId) return 'red'
  if (snapshot.seats.yellow?.id === playerId) return 'yellow'
  return null
}

/** In this game instance, `players[0]` uses red discs, `players[1]` yellow. */
export function pieceCellClass(
  gamePlayers: readonly [PlayerId, PlayerId],
  cell: PlayerId | null
): 'empty' | 'red' | 'yellow' {
  if (!cell) return 'empty'
  if (cell === gamePlayers[0]) return 'red'
  if (cell === gamePlayers[1]) return 'yellow'
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

/** Which Connect 4 piece color this player has in the active game. */
export function connect4GameSide(
  gamePlayers: readonly [PlayerId, PlayerId],
  playerId: PlayerId | null
): 'red' | 'yellow' | null {
  if (!playerId) return null
  if (playerId === gamePlayers[0]) return 'red'
  if (playerId === gamePlayers[1]) return 'yellow'
  return null
}

export function matchScoreFor(snapshot: RoomSnapshot, playerId: PlayerId): number {
  return snapshot.matchScores[playerId] ?? 0
}

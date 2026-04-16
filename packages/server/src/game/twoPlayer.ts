import type { PlayerId } from '@gameroom/shared'

/** Opponent in a two-player `players` tuple. */
export function otherPlayer(players: readonly [PlayerId, PlayerId], playerId: PlayerId): PlayerId {
  return players[0] === playerId ? players[1] : players[0]
}

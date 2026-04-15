import type { PublicRoomSummary } from '@connect4/shared'

import { GameRoom } from '@/game/GameRoom.js'
import { logger } from '@/logger.js'

export class GameManager {
  private rooms = new Map<string, GameRoom>()

  /** Waiting tables with a free seat, plus games currently `in_progress`. */
  listLobbySummaries(): PublicRoomSummary[] {
    const list: PublicRoomSummary[] = []
    for (const room of this.rooms.values()) {
      const { state } = room
      if (state.status !== 'waiting' && state.status !== 'in_progress') continue

      const redDisplayName = state.players.red?.displayName ?? null
      const yellowDisplayName = state.players.yellow?.displayName ?? null
      const occupied = (redDisplayName ? 1 : 0) + (yellowDisplayName ? 1 : 0)

      if (state.status === 'waiting') {
        if (occupied >= 2) continue
        list.push({
          gameId: state.gameId,
          status: 'waiting',
          redDisplayName,
          yellowDisplayName,
        })
      } else if (occupied >= 2) {
        list.push({
          gameId: state.gameId,
          status: 'in_progress',
          redDisplayName,
          yellowDisplayName,
        })
      }
    }
    list.sort((a, b) => {
      const pri = (s: PublicRoomSummary['status']) => (s === 'in_progress' ? 0 : 1)
      const d = pri(a.status) - pri(b.status)
      return d !== 0 ? d : a.gameId.localeCompare(b.gameId)
    })
    return list
  }

  getOrCreate(gameId: string): GameRoom {
    if (!this.rooms.has(gameId)) {
      this.rooms.set(gameId, new GameRoom(gameId))
      logger.debug({ room: gameId }, 'game room created')
    }
    return this.rooms.get(gameId)!
  }

  get(gameId: string): GameRoom | undefined {
    return this.rooms.get(gameId)
  }

  /** Drop the room when nobody is seated (last connection left the table). */
  removeRoomIfEmpty(gameId: string): void {
    const room = this.rooms.get(gameId)
    if (!room) return
    if (room.state.players.red || room.state.players.yellow) return
    this.rooms.delete(gameId)
    logger.info({ gameId }, 'room removed (empty)')
  }
}

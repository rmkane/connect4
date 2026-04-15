import type { PublicRoomSummary } from '@connect4/shared'

import { logger } from '@/logger.js'
import { PlayerRoom } from '@/room/PlayerRoom.js'

export class GameManager {
  private rooms = new Map<string, PlayerRoom>()

  /** Waiting tables with a free seat, plus full tables (two seated). */
  listLobbySummaries(): PublicRoomSummary[] {
    const list: PublicRoomSummary[] = []
    for (const room of this.rooms.values()) {
      const redDisplayName = room.seats.red?.displayName ?? null
      const yellowDisplayName = room.seats.yellow?.displayName ?? null
      const occupied = (redDisplayName ? 1 : 0) + (yellowDisplayName ? 1 : 0)

      if (occupied < 2) {
        list.push({
          roomId: room.roomId,
          status: 'waiting',
          redDisplayName,
          yellowDisplayName,
        })
      } else {
        list.push({
          roomId: room.roomId,
          status: 'in_progress',
          redDisplayName,
          yellowDisplayName,
        })
      }
    }
    list.sort((a, b) => {
      const pri = (s: PublicRoomSummary['status']) => (s === 'in_progress' ? 0 : 1)
      const d = pri(a.status) - pri(b.status)
      return d !== 0 ? d : a.roomId.localeCompare(b.roomId)
    })
    return list
  }

  getOrCreate(roomId: string): PlayerRoom {
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, new PlayerRoom(roomId))
      logger.debug({ room: roomId }, 'room created')
    }
    return this.rooms.get(roomId)!
  }

  get(roomId: string): PlayerRoom | undefined {
    return this.rooms.get(roomId)
  }

  /** Drop the room when nobody is seated (last connection left the table). */
  removeRoomIfEmpty(roomId: string): void {
    const room = this.rooms.get(roomId)
    if (!room) return
    if (room.seats.red || room.seats.yellow) return
    this.rooms.delete(roomId)
    logger.info({ roomId }, 'room removed (empty)')
  }
}

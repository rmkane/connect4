import type { PublicRoomSummary } from '@gameroom/shared'
import { ROOM_TABLE_CAPACITY, seatedPlayerCount } from '@gameroom/shared'

import { logger } from '@/logger.js'
import { PlayerRoom } from '@/room/PlayerRoom.js'

export class GameManager {
  private rooms = new Map<string, PlayerRoom>()

  /** Waiting tables with a free seat, plus full tables (all seats taken). */
  listLobbySummaries(): PublicRoomSummary[] {
    const list: PublicRoomSummary[] = []
    for (const room of this.rooms.values()) {
      const snap = room.getSnapshot()
      const seatDisplayNames = [
        snap.seats[0]?.displayName ?? null,
        snap.seats[1]?.displayName ?? null,
      ] as const
      const occupied = seatedPlayerCount(snap.seats)
      const roomTitle = snap.roomTitle.trim() ? snap.roomTitle : undefined

      if (occupied < ROOM_TABLE_CAPACITY) {
        list.push({
          roomId: room.roomId,
          ...(roomTitle ? { roomTitle } : {}),
          status: 'waiting',
          seatDisplayNames,
        })
      } else {
        list.push({
          roomId: room.roomId,
          ...(roomTitle ? { roomTitle } : {}),
          status: 'in_progress',
          seatDisplayNames,
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
    if (room.seats[0] || room.seats[1]) return
    this.rooms.delete(roomId)
    logger.info({ roomId }, 'room removed (empty)')
  }
}

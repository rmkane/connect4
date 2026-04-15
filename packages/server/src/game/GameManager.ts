import { GameRoom } from '@/game/GameRoom.js'
import { logger } from '@/logger.js'

export class GameManager {
  private rooms = new Map<string, GameRoom>()

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
}

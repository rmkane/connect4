import { randomUUID } from 'node:crypto'

import type { Logger } from 'pino'
import { WebSocket } from 'ws'

import type {
  AnyGameState,
  ChatMessagePayload,
  Color,
  GameKind,
  GameListing,
  GameMove,
  PlayerId,
  PlayerInfo,
  RoomSnapshot,
  ServerMessage,
} from '@gameroom/shared'
import { CHAT_HISTORY_LIMIT, sanitizeChatText } from '@gameroom/shared'

import { getEngine, getEngineForActiveState } from '@/game/gameEngines.js'
import { logger } from '@/logger.js'

export class PlayerRoom {
  seats: { red: PlayerInfo | null; yellow: PlayerInfo | null } = {
    red: null,
    yellow: null,
  }
  private matchPoints = new Map<PlayerId, number>()
  games: GameListing[] = []
  activeGame: AnyGameState | null = null
  sockets: Map<Color, WebSocket> = new Map()
  private chatHistory: ChatMessagePayload[] = []
  private readonly log: Logger

  constructor(public readonly roomId: string) {
    this.log = logger.child({ room: roomId })
  }

  private snapshotScores(): Record<PlayerId, number> {
    const out: Record<PlayerId, number> = {}
    if (this.seats.red) out[this.seats.red.id] = this.matchPoints.get(this.seats.red.id) ?? 0
    if (this.seats.yellow)
      out[this.seats.yellow.id] = this.matchPoints.get(this.seats.yellow.id) ?? 0
    return out
  }

  getSnapshot(): RoomSnapshot {
    return {
      roomId: this.roomId,
      seats: { red: this.seats.red, yellow: this.seats.yellow },
      matchScores: this.snapshotScores(),
      games: this.games.map((g) => ({ ...g })),
      activeGame: this.activeGame
        ? (JSON.parse(JSON.stringify(this.activeGame)) as AnyGameState)
        : null,
    }
  }

  private broadcast() {
    const payload = JSON.stringify({ type: 'room_state', snapshot: this.getSnapshot() } satisfies {
      type: 'room_state'
      snapshot: RoomSnapshot
    })
    this.sockets.forEach((ws) => ws.readyState === WebSocket.OPEN && ws.send(payload))
  }

  private pushRoomChat(msg: ChatMessagePayload) {
    this.chatHistory.push(msg)
    if (this.chatHistory.length > CHAT_HISTORY_LIMIT) {
      this.chatHistory.splice(0, this.chatHistory.length - CHAT_HISTORY_LIMIT)
    }
  }

  /** Recent room chat for a connection that just joined. */
  sendChatHistoryTo(ws: WebSocket) {
    if (this.chatHistory.length === 0) return
    const payload = JSON.stringify({
      type: 'chat_history',
      scope: 'room' as const,
      roomId: this.roomId,
      messages: [...this.chatHistory],
    })
    if (ws.readyState === WebSocket.OPEN) ws.send(payload)
  }

  sendRoomChat(playerId: PlayerId, text: string): boolean {
    if (!this.isSeatedPlayer(playerId)) return false
    const clean = sanitizeChatText(text)
    if (!clean) return false

    const info =
      this.seats.red?.id === playerId
        ? this.seats.red
        : this.seats.yellow?.id === playerId
          ? this.seats.yellow
          : null
    if (!info) return false

    const msg: ChatMessagePayload = {
      scope: 'room',
      roomId: this.roomId,
      senderId: playerId,
      displayName: info.displayName,
      text: clean,
      sentAt: Date.now(),
    }
    this.pushRoomChat(msg)
    const payload = JSON.stringify({ type: 'chat_message', ...msg })
    this.sockets.forEach((ws) => ws.readyState === WebSocket.OPEN && ws.send(payload))
    return true
  }

  private listingFor(sessionId: string): GameListing | undefined {
    return this.games.find((g) => g.gameSessionId === sessionId)
  }

  private setListingStatus(sessionId: string, status: GameListing['status']) {
    const row = this.listingFor(sessionId)
    if (row) row.status = status
  }

  private addWin(playerId: PlayerId) {
    this.matchPoints.set(playerId, (this.matchPoints.get(playerId) ?? 0) + 1)
  }

  private isSeatedPlayer(playerId: PlayerId): boolean {
    return this.seats.red?.id === playerId || this.seats.yellow?.id === playerId
  }

  private seatedCount(): number {
    return (this.seats.red ? 1 : 0) + (this.seats.yellow ? 1 : 0)
  }

  /** Whether enough seats are filled and those sockets are open for this engine's roster. */
  private allEnginePlayersConnected(engine: { maxPlayers: number }): boolean {
    const seatedColors = (['red', 'yellow'] as const).filter((c) => this.seats[c])
    if (seatedColors.length < engine.maxPlayers) return false
    for (const c of seatedColors.slice(0, engine.maxPlayers)) {
      const ws = this.sockets.get(c)
      if (!ws || ws.readyState !== WebSocket.OPEN) return false
    }
    return true
  }

  /** Random `[A,B]` or `[B,A]` so in-game roles (red/yellow, X/O) are not tied to room join order. */
  private shuffledPlayers(): readonly [PlayerId, PlayerId] {
    const a = this.seats.red!.id
    const b = this.seats.yellow!.id
    return Math.random() < 0.5 ? [a, b] : [b, a]
  }

  join(ws: WebSocket, displayName: string): { seat: Color; playerId: PlayerId } | null {
    const seat: Color | null = !this.seats.red ? 'red' : !this.seats.yellow ? 'yellow' : null

    if (!seat) return null

    const playerId = randomUUID() as PlayerId
    this.seats[seat] = { id: playerId, displayName }
    this.sockets.set(seat, ws)

    const personal: ServerMessage = {
      type: 'joined_room',
      roomId: this.roomId,
      playerId,
      seat,
    }
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(personal))

    this.log.info({ seat, playerId, displayName }, 'player seated')
    this.broadcast()
    return { seat, playerId }
  }

  createGame(kind: GameKind): boolean {
    if (this.activeGame?.status === 'in_progress') return false

    const engine = getEngine(kind)
    const seated = this.seatedCount()
    if (seated < engine.minPlayers || seated > engine.maxPlayers) return false
    // Table is still two seats; `create` only accepts a pair of ids until seating grows.
    if (engine.maxPlayers > 2) return false

    const gameSessionId = randomUUID()
    this.games.push({ gameSessionId, kind, status: 'in_progress' })

    const players = this.shuffledPlayers()

    this.activeGame = engine.create(this.roomId, gameSessionId, players)

    this.log.info({ kind, gameSessionId }, 'game created')
    this.broadcast()
    return true
  }

  handleMove(playerId: PlayerId, gameSessionId: string, move: GameMove): void {
    const g = this.activeGame
    if (!g || g.gameSessionId !== gameSessionId) return
    if (g.status !== 'in_progress') return
    if (g.game !== move.game) return
    if (!this.isSeatedPlayer(playerId)) return
    if (g.currentTurn !== playerId) return

    const engine = getEngineForActiveState(g)
    const r = engine.applyMove(g, playerId, move)
    if (r.kind === 'invalid') {
      this.log.debug({ game: g.game, playerId, move }, 'move ignored')
      return
    }
    if (r.kind === 'finished') {
      if (r.winner) this.addWin(r.winner)
      this.setListingStatus(g.gameSessionId, 'completed')
      this.log.info({ game: g.game, playerId, move, winner: r.winner }, 'game finished from move')
    } else {
      this.log.debug({ game: g.game, playerId, move, nextTurn: g.currentTurn }, 'move applied')
    }
    this.broadcast()
  }

  /** Another round of the same active game after it completed; both seats and sockets required. */
  startNewRound(gameSessionId: string): boolean {
    const g = this.activeGame
    if (!g || g.gameSessionId !== gameSessionId) return false
    if (g.status !== 'completed') return false

    const engine = getEngineForActiveState(g)
    if (this.seatedCount() < engine.maxPlayers) return false
    if (!this.allEnginePlayersConnected(engine)) return false

    const nextPlayers = this.shuffledPlayers()

    engine.startNewRound(g, nextPlayers)

    this.setListingStatus(gameSessionId, 'in_progress')
    this.log.info({ gameSessionId }, 'new round started')
    this.broadcast()
    return true
  }

  surrender(playerId: PlayerId, gameSessionId: string): boolean {
    const g = this.activeGame
    if (!g || g.gameSessionId !== gameSessionId) return false
    if (g.status !== 'in_progress') return false
    if (!this.isSeatedPlayer(playerId)) return false

    const opponent = getEngineForActiveState(g).surrender(g, playerId)
    this.addWin(opponent)
    this.setListingStatus(gameSessionId, 'completed')
    this.log.info({ loser: playerId, winner: opponent }, 'game ended surrender')
    this.broadcast()
    return true
  }

  /** Clear a finished game so the room can pick another title. */
  dismissCompletedGame(playerId: PlayerId): boolean {
    if (!this.activeGame || this.activeGame.status !== 'completed') return false
    if (!this.isSeatedPlayer(playerId)) return false

    this.activeGame = null
    this.log.info({ playerId }, 'completed game dismissed')
    this.broadcast()
    return true
  }

  disconnect(seat: Color) {
    this.sockets.delete(seat)
    const leaving = this.seats[seat]
    this.seats[seat] = null
    if (leaving) this.matchPoints.delete(leaving.id)

    if (this.activeGame?.status === 'in_progress') {
      const sid = this.activeGame.gameSessionId
      this.setListingStatus(sid, 'abandoned')
      this.activeGame = null
    } else if (this.activeGame?.status === 'completed') {
      this.activeGame = null
    }

    if (!this.seats.red && !this.seats.yellow) {
      this.matchPoints.clear()
      this.games = []
      this.activeGame = null
      this.chatHistory = []
    }

    this.log.info({ seat }, 'player disconnected')
    this.broadcast()
  }
}

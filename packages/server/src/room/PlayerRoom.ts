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

import * as connect4Session from '@/game/connect4Session.js'
import { applySurrender } from '@/game/surrender.js'
import * as ticTacToeSession from '@/game/ticTacToeSession.js'
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
    if (!this.seats.red || !this.seats.yellow) return false
    if (this.activeGame?.status === 'in_progress') return false

    const gameSessionId = randomUUID()
    this.games.push({ gameSessionId, kind, status: 'in_progress' })

    const players = this.shuffledPlayers()

    this.activeGame =
      kind === 'connect4'
        ? connect4Session.createGame(this.roomId, gameSessionId, players)
        : ticTacToeSession.createGame(this.roomId, gameSessionId, players)

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

    if (g.game === 'connect4' && move.game === 'connect4') {
      const r = connect4Session.applyMove(g, playerId, move.column)
      if (r.kind === 'invalid') {
        this.log.debug({ playerId, column: move.column }, 'connect4 drop ignored')
        return
      }
      if (r.kind === 'finished') {
        if (r.winner) this.addWin(r.winner)
        this.setListingStatus(g.gameSessionId, 'completed')
        if (r.winner) this.log.info({ playerId, column: move.column }, 'connect4 won')
        else this.log.info('connect4 draw')
      } else {
        this.log.debug(
          { playerId, column: move.column, nextTurn: g.currentTurn },
          'connect4 piece placed'
        )
      }
      this.broadcast()
    } else if (g.game === 'tic_tac_toe' && move.game === 'tic_tac_toe') {
      const r = ticTacToeSession.applyMove(g, playerId, move.row, move.col)
      if (r.kind === 'invalid') {
        this.log.debug({ playerId, row: move.row, col: move.col }, 'tic-tac-toe move ignored')
        return
      }
      if (r.kind === 'finished') {
        if (r.winner) this.addWin(r.winner)
        this.setListingStatus(g.gameSessionId, 'completed')
        if (r.winner) this.log.info({ playerId, row: move.row, col: move.col }, 'tic-tac-toe won')
        else this.log.info('tic-tac-toe draw')
      } else {
        this.log.debug(
          { playerId, row: move.row, col: move.col, nextTurn: g.currentTurn },
          'tic-tac-toe move'
        )
      }
      this.broadcast()
    }
  }

  /** Another round of the same active game after it completed; both seats and sockets required. */
  startNewRound(gameSessionId: string): boolean {
    const g = this.activeGame
    if (!g || g.gameSessionId !== gameSessionId) return false
    if (g.status !== 'completed') return false
    if (!this.seats.red || !this.seats.yellow) return false
    for (const c of ['red', 'yellow'] as const) {
      const sock = this.sockets.get(c)
      if (!sock || sock.readyState !== WebSocket.OPEN) return false
    }

    const nextPlayers = this.shuffledPlayers()

    if (g.game === 'connect4') {
      connect4Session.startNewRound(g, nextPlayers)
    } else {
      ticTacToeSession.startNewRound(g, nextPlayers)
    }

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

    const opponent = applySurrender(g, playerId)
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

import { randomUUID } from 'node:crypto'

import type { Logger } from 'pino'
import { WebSocket } from 'ws'

import type {
  AnyGameState,
  Color,
  Connect4State,
  GameKind,
  GameListing,
  GameMove,
  PlayerId,
  PlayerInfo,
  RoomSnapshot,
  ServerMessage,
  TicTacToeState,
} from '@connect4/shared'

import * as connect4 from '@/games/connect4/rules.js'
import * as ticTacToe from '@/games/ticTacToe/rules.js'
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

  /** Connect 4: random opener each game/round (after role shuffle). */
  private pickConnect4Opening(players: readonly [PlayerId, PlayerId]): PlayerId {
    return Math.random() < 0.5 ? players[0] : players[1]
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

    if (kind === 'connect4') {
      this.activeGame = {
        game: 'connect4',
        roomId: this.roomId,
        gameSessionId,
        players,
        board: connect4.makeBoard(),
        currentTurn: this.pickConnect4Opening(players),
        status: 'in_progress',
        result: null,
      }
    } else {
      this.activeGame = {
        game: 'tic_tac_toe',
        roomId: this.roomId,
        gameSessionId,
        players,
        board: ticTacToe.makeBoard(),
        currentTurn: players[1],
        status: 'in_progress',
        result: null,
      }
    }

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
      this.applyConnect4Drop(g, playerId, move.column)
    } else if (g.game === 'tic_tac_toe' && move.game === 'tic_tac_toe') {
      this.applyTicTacToeMove(g, playerId, move.row, move.col)
    }
  }

  private applyConnect4Drop(state: Connect4State, playerId: PlayerId, column: number) {
    const row = connect4.dropPiece(state.board, column, playerId)
    if (row === -1) {
      this.log.debug({ playerId, column }, 'connect4 drop ignored')
      return
    }

    if (connect4.checkWin(state.board, row, column)) {
      state.status = 'completed'
      state.result = { winner: playerId, reason: 'four_in_a_row' }
      this.addWin(playerId)
      this.setListingStatus(state.gameSessionId, 'completed')
      this.log.info({ playerId, column, row }, 'connect4 won')
    } else if (connect4.checkDraw(state.board)) {
      state.status = 'completed'
      state.result = { winner: null, reason: 'draw' }
      this.setListingStatus(state.gameSessionId, 'completed')
      this.log.info('connect4 draw')
    } else {
      state.currentTurn = connect4.otherPlayer(state.players, playerId)
      this.log.debug(
        { playerId, column, row, nextTurn: state.currentTurn },
        'connect4 piece placed'
      )
    }

    this.broadcast()
  }

  private applyTicTacToeMove(state: TicTacToeState, playerId: PlayerId, row: number, col: number) {
    if (!ticTacToe.placePiece(state.board, row, col, playerId)) {
      this.log.debug({ playerId, row, col }, 'tic-tac-toe move ignored')
      return
    }

    if (ticTacToe.checkWin(state.board, row, col)) {
      state.status = 'completed'
      state.result = { winner: playerId, reason: 'three_in_row' }
      this.addWin(playerId)
      this.setListingStatus(state.gameSessionId, 'completed')
      this.log.info({ playerId, row, col }, 'tic-tac-toe won')
    } else if (ticTacToe.checkDraw(state.board)) {
      state.status = 'completed'
      state.result = { winner: null, reason: 'draw' }
      this.setListingStatus(state.gameSessionId, 'completed')
      this.log.info('tic-tac-toe draw')
    } else {
      state.currentTurn = connect4.otherPlayer(state.players, playerId)
      this.log.debug({ playerId, row, col, nextTurn: state.currentTurn }, 'tic-tac-toe move')
    }

    this.broadcast()
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
      g.players = nextPlayers
      g.board = connect4.makeBoard()
      g.currentTurn = this.pickConnect4Opening(nextPlayers)
      g.status = 'in_progress'
      g.result = null
    } else {
      g.players = nextPlayers
      g.board = ticTacToe.makeBoard()
      g.currentTurn = nextPlayers[1]
      g.status = 'in_progress'
      g.result = null
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

    const opponent = connect4.otherPlayer(g.players, playerId)
    g.status = 'completed'
    g.result = { winner: opponent, reason: 'surrender' }
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
    }

    this.log.info({ seat }, 'player disconnected')
    this.broadcast()
  }
}

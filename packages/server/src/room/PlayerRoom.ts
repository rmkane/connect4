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
  PlayerInfo,
  RoomSnapshot,
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
  matchScores: { red: number; yellow: number } = { red: 0, yellow: 0 }
  games: GameListing[] = []
  activeGame: AnyGameState | null = null
  sockets: Map<Color, WebSocket> = new Map()
  private readonly log: Logger

  constructor(public readonly roomId: string) {
    this.log = logger.child({ room: roomId })
  }

  getSnapshot(): RoomSnapshot {
    return {
      roomId: this.roomId,
      seats: { red: this.seats.red, yellow: this.seats.yellow },
      matchScores: { ...this.matchScores },
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

  join(ws: WebSocket, displayName: string): Color | null {
    const color: Color | null = !this.seats.red ? 'red' : !this.seats.yellow ? 'yellow' : null

    if (!color) return null

    this.seats[color] = { id: displayName, displayName }
    this.sockets.set(color, ws)
    this.log.info({ color, displayName }, 'player seated')
    this.broadcast()
    return color
  }

  createGame(kind: GameKind): boolean {
    if (!this.seats.red || !this.seats.yellow) return false
    if (this.activeGame?.status === 'in_progress') return false

    const gameSessionId = randomUUID()
    this.games.push({ gameSessionId, kind, status: 'in_progress' })

    if (kind === 'connect4') {
      this.activeGame = {
        game: 'connect4',
        roomId: this.roomId,
        gameSessionId,
        board: connect4.makeBoard(),
        currentTurn: 'red',
        status: 'in_progress',
        result: null,
      }
    } else {
      this.activeGame = {
        game: 'tic_tac_toe',
        roomId: this.roomId,
        gameSessionId,
        board: ticTacToe.makeBoard(),
        currentTurn: 'red',
        status: 'in_progress',
        result: null,
      }
    }

    this.log.info({ kind, gameSessionId }, 'game created')
    this.broadcast()
    return true
  }

  handleMove(color: Color, gameSessionId: string, move: GameMove): void {
    const g = this.activeGame
    if (!g || g.gameSessionId !== gameSessionId) return
    if (g.status !== 'in_progress') return
    if (g.game !== move.game) return
    if (g.currentTurn !== color) return

    if (g.game === 'connect4' && move.game === 'connect4') {
      this.applyConnect4Drop(g, color, move.column)
    } else if (g.game === 'tic_tac_toe' && move.game === 'tic_tac_toe') {
      this.applyTicTacToeMove(g, color, move.row, move.col)
    }
  }

  private applyConnect4Drop(state: Connect4State, color: Color, column: number) {
    const row = connect4.dropPiece(state.board, column, color)
    if (row === -1) {
      this.log.debug({ color, column }, 'connect4 drop ignored')
      return
    }

    if (connect4.checkWin(state.board, row, column)) {
      state.status = 'completed'
      state.result = { winner: color, reason: 'four_in_a_row' }
      this.matchScores[color] += 1
      this.setListingStatus(state.gameSessionId, 'completed')
      this.log.info({ color, column, row }, 'connect4 won')
    } else if (connect4.checkDraw(state.board)) {
      state.status = 'completed'
      state.result = { winner: null, reason: 'draw' }
      this.setListingStatus(state.gameSessionId, 'completed')
      this.log.info('connect4 draw')
    } else {
      state.currentTurn = color === 'red' ? 'yellow' : 'red'
      this.log.debug({ color, column, row, nextTurn: state.currentTurn }, 'connect4 piece placed')
    }

    this.broadcast()
  }

  private applyTicTacToeMove(state: TicTacToeState, color: Color, row: number, col: number) {
    if (!ticTacToe.placePiece(state.board, row, col, color)) {
      this.log.debug({ color, row, col }, 'tic-tac-toe move ignored')
      return
    }

    if (ticTacToe.checkWin(state.board, row, col)) {
      state.status = 'completed'
      state.result = { winner: color, reason: 'three_in_row' }
      this.matchScores[color] += 1
      this.setListingStatus(state.gameSessionId, 'completed')
      this.log.info({ color, row, col }, 'tic-tac-toe won')
    } else if (ticTacToe.checkDraw(state.board)) {
      state.status = 'completed'
      state.result = { winner: null, reason: 'draw' }
      this.setListingStatus(state.gameSessionId, 'completed')
      this.log.info('tic-tac-toe draw')
    } else {
      state.currentTurn = color === 'red' ? 'yellow' : 'red'
      this.log.debug({ color, row, col, nextTurn: state.currentTurn }, 'tic-tac-toe move')
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

    if (g.game === 'connect4') {
      g.board = connect4.makeBoard()
      g.currentTurn = 'red'
      g.status = 'in_progress'
      g.result = null
    } else {
      g.board = ticTacToe.makeBoard()
      g.currentTurn = 'red'
      g.status = 'in_progress'
      g.result = null
    }

    this.setListingStatus(gameSessionId, 'in_progress')
    this.log.info({ gameSessionId }, 'new round started')
    this.broadcast()
    return true
  }

  disconnect(color: Color) {
    this.sockets.delete(color)
    this.seats[color] = null

    if (this.activeGame?.status === 'in_progress') {
      const sid = this.activeGame.gameSessionId
      this.setListingStatus(sid, 'abandoned')
      this.activeGame = null
    } else if (this.activeGame?.status === 'completed') {
      this.activeGame = null
    }

    if (!this.seats.red && !this.seats.yellow) {
      this.matchScores = { red: 0, yellow: 0 }
      this.games = []
      this.activeGame = null
    }

    this.log.info({ color }, 'player disconnected')
    this.broadcast()
  }
}

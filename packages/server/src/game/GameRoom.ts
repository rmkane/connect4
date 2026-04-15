import type { Logger } from 'pino'
import { WebSocket } from 'ws'

import { Color, GameState } from '@connect4/shared'

import { checkDraw, checkWin, dropPiece, makeBoard } from '@/game/rules.js'
import { logger } from '@/logger.js'

export class GameRoom {
  state: GameState
  sockets: Map<Color, WebSocket> = new Map()
  private readonly log: Logger

  constructor(public gameId: string) {
    this.log = logger.child({ room: gameId })
    this.state = {
      gameId,
      board: makeBoard(),
      currentTurn: 'red',
      status: 'waiting',
      players: { red: null, yellow: null },
      result: null,
    }
  }

  join(ws: WebSocket, displayName: string): Color | null {
    const color: Color | null = !this.state.players.red
      ? 'red'
      : !this.state.players.yellow
        ? 'yellow'
        : null

    if (!color) return null

    this.state.players[color] = { id: displayName, displayName }
    this.sockets.set(color, ws)

    if (this.state.players.red && this.state.players.yellow) {
      this.state.status = 'in_progress'
      this.log.info('game started both players connected')
    } else {
      this.log.info({ color, displayName }, 'player seated waiting for opponent')
    }

    this.broadcast({ type: 'game_state', state: this.state })
    return color
  }

  handleDrop(color: Color, column: number) {
    if (this.state.status !== 'in_progress') {
      this.log.debug({ color, column, status: this.state.status }, 'drop ignored wrong status')
      return
    }
    if (this.state.currentTurn !== color) {
      this.log.debug(
        { color, column, currentTurn: this.state.currentTurn },
        'drop ignored wrong turn'
      )
      return
    }

    const row = dropPiece(this.state.board, column, color)
    if (row === -1) {
      this.log.debug({ color, column }, 'drop ignored column full')
      return
    }

    if (checkWin(this.state.board, row, column)) {
      this.state.status = 'completed'
      this.state.result = { winner: color, reason: 'four_in_a_row' }
      this.log.info({ color, column, row }, 'game won four in a row')
    } else if (checkDraw(this.state.board)) {
      this.state.status = 'completed'
      this.state.result = { winner: null, reason: 'draw' }
      this.log.info('game ended draw')
    } else {
      this.state.currentTurn = color === 'red' ? 'yellow' : 'red'
      this.log.debug({ color, column, row, nextTurn: this.state.currentTurn }, 'piece placed')
    }

    this.broadcast({ type: 'game_state', state: this.state })
  }

  disconnect(color: Color) {
    this.sockets.delete(color)
    this.state.players[color] = null

    if (this.state.status === 'in_progress') {
      this.state.status = 'waiting'
      this.state.board = makeBoard()
      this.state.result = null
      this.state.currentTurn = 'red'
    }

    this.log.info({ color }, 'player disconnected')
    this.broadcast({ type: 'game_state', state: this.state })
  }

  broadcast(msg: object) {
    const payload = JSON.stringify(msg)
    this.sockets.forEach((ws) => ws.readyState === ws.OPEN && ws.send(payload))
  }
}

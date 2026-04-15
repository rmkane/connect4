import { createServer } from 'http'
import { WebSocketServer } from 'ws'

import { ClientMessage, Color } from '@connect4/shared'

import { GameManager } from '@/game/GameManager.js'
import { logger } from '@/logger.js'

const manager = new GameManager()
const server = createServer()
const wss = new WebSocketServer({ server })

let connectionSeq = 0

wss.on('connection', (ws) => {
  const conn = ++connectionSeq
  const connLog = logger.child({ conn })
  connLog.info('websocket connected')

  let assignedGameId: string | null = null
  let assignedColor: Color | null = null

  ws.on('message', (data) => {
    let msg: ClientMessage
    try {
      msg = JSON.parse(data.toString()) as ClientMessage
    } catch (err) {
      connLog.warn({ err }, 'invalid message json')
      return
    }

    if (msg.type === 'join_game') {
      const room = manager.getOrCreate(msg.gameId)
      const color = room.join(ws, msg.displayName)
      if (color) {
        assignedGameId = msg.gameId
        assignedColor = color
        connLog.info(
          { gameId: msg.gameId, color, displayName: msg.displayName },
          'player joined game'
        )
      } else {
        connLog.warn(
          { gameId: msg.gameId, displayName: msg.displayName },
          'join rejected game full'
        )
        ws.send(
          JSON.stringify({
            type: 'error',
            message:
              'This room already has two players. Use another /game/<uuid> link, close extra tabs, or wait until a seat frees up.',
          })
        )
      }
    }

    if (msg.type === 'drop_piece' && assignedGameId && assignedColor) {
      connLog.debug(
        { gameId: assignedGameId, color: assignedColor, column: msg.column },
        'drop_piece'
      )
      manager.get(assignedGameId)?.handleDrop(assignedColor, msg.column)
    }
  })

  ws.on('close', () => {
    connLog.info({ gameId: assignedGameId, color: assignedColor }, 'websocket disconnected')
    if (assignedGameId && assignedColor) {
      manager.get(assignedGameId)?.disconnect(assignedColor)
    }
  })
})

server.listen(3000, () => {
  logger.info({ port: 3000 }, 'game server listening')
})

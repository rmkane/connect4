import 'dotenv/config'
import { createServer } from 'http'
import { type RawData, WebSocketServer } from 'ws'

import { ClientMessage, Color } from '@connect4/shared'

import { serverConfig } from '@/config.js'
import { GameManager } from '@/game/GameManager.js'
import { logger } from '@/logger.js'

function wsPayloadBytes(data: RawData): number {
  if (Buffer.isBuffer(data)) return data.length
  if (typeof data === 'string') return Buffer.byteLength(data)
  if (data instanceof ArrayBuffer) return data.byteLength
  return Buffer.concat(data).length
}

const manager = new GameManager()

const corsJsonHeaders = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'Access-Control-Allow-Origin': '*',
} as const

const server = createServer((req, res) => {
  const path = req.url?.split('?')[0] ?? ''

  if (req.method === 'OPTIONS' && (path === '/api/rooms' || path === '/health')) {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    })
    res.end()
    return
  }

  if (req.method === 'GET' && path === '/health') {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    })
    res.end(
      JSON.stringify({
        ok: true,
        service: 'connect4-ws',
        uptime: process.uptime(),
      })
    )
    return
  }

  if (req.method === 'GET' && path === '/api/rooms') {
    const rooms = manager.listLobbySummaries()
    res.writeHead(200, corsJsonHeaders)
    res.end(JSON.stringify({ rooms }))
    return
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
  res.end('Not found')
})

const wss = new WebSocketServer({ server })

let connectionSeq = 0

wss.on('connection', (ws) => {
  const conn = ++connectionSeq
  const connLog = logger.child({ conn })
  connLog.info('websocket connected')

  let assignedGameId: string | null = null
  let assignedColor: Color | null = null

  ws.on('message', (data) => {
    const size = wsPayloadBytes(data)
    if (size > serverConfig.maxMessageBytes) {
      connLog.warn({ size, max: serverConfig.maxMessageBytes }, 'message too large')
      ws.close(1009, 'message too large')
      return
    }

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
              'This room already has two players. Use another /room/<uuid> link, close extra tabs, or wait until a seat frees up.',
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

    if (
      msg.type === 'new_game' &&
      assignedGameId &&
      assignedColor &&
      msg.gameId === assignedGameId
    ) {
      const room = manager.get(assignedGameId)
      if (room && !room.startNewMatch()) {
        connLog.debug({ gameId: assignedGameId }, 'new_game rejected')
        ws.send(
          JSON.stringify({
            type: 'error',
            message:
              'New game is only available after a finished round, with both players still connected at this table.',
          })
        )
      }
    }
  })

  ws.on('close', () => {
    connLog.info({ gameId: assignedGameId, color: assignedColor }, 'websocket disconnected')
    if (assignedGameId && assignedColor) {
      const gid = assignedGameId
      manager.get(gid)?.disconnect(assignedColor)
      manager.removeRoomIfEmpty(gid)
    }
  })
})

function shutdown(signal: string) {
  logger.info({ signal }, 'shutdown initiated')
  wss.close(() => {
    server.close(() => {
      logger.info('server closed')
      process.exit(0)
    })
  })
}

process.once('SIGTERM', () => shutdown('SIGTERM'))
process.once('SIGINT', () => shutdown('SIGINT'))

server.listen(serverConfig.port, () => {
  logger.info({ port: serverConfig.port }, 'game server listening')
})

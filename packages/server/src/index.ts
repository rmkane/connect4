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

  let assignedRoomId: string | null = null
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

    if (msg.type === 'join_room') {
      const room = manager.getOrCreate(msg.roomId)
      const color = room.join(ws, msg.displayName)
      if (color) {
        assignedRoomId = msg.roomId
        assignedColor = color
        connLog.info(
          { roomId: msg.roomId, color, displayName: msg.displayName },
          'player joined room'
        )
      } else {
        connLog.warn(
          { roomId: msg.roomId, displayName: msg.displayName },
          'join rejected room full'
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

    if (
      msg.type === 'create_game' &&
      assignedRoomId &&
      assignedColor &&
      msg.roomId === assignedRoomId
    ) {
      const room = manager.get(assignedRoomId)
      if (room && !room.createGame(msg.kind)) {
        connLog.debug({ roomId: assignedRoomId }, 'create_game rejected')
        ws.send(
          JSON.stringify({
            type: 'error',
            message:
              'Start a game only when both seats are filled, no game is already in progress, and you are in this room.',
          })
        )
      }
    }

    if (
      msg.type === 'game_move' &&
      assignedRoomId &&
      assignedColor &&
      msg.roomId === assignedRoomId
    ) {
      connLog.debug(
        { roomId: assignedRoomId, color: assignedColor, gameSessionId: msg.gameSessionId },
        'game_move'
      )
      manager.get(assignedRoomId)?.handleMove(assignedColor, msg.gameSessionId, msg.move)
    }

    if (
      msg.type === 'new_round' &&
      assignedRoomId &&
      assignedColor &&
      msg.roomId === assignedRoomId
    ) {
      const room = manager.get(assignedRoomId)
      if (room && !room.startNewRound(msg.gameSessionId)) {
        connLog.debug({ roomId: assignedRoomId }, 'new_round rejected')
        ws.send(
          JSON.stringify({
            type: 'error',
            message:
              'New round is only available after a finished game, with both players still connected.',
          })
        )
      }
    }
  })

  ws.on('close', () => {
    connLog.info({ roomId: assignedRoomId, color: assignedColor }, 'websocket disconnected')
    if (assignedRoomId && assignedColor) {
      const rid = assignedRoomId
      manager.get(rid)?.disconnect(assignedColor)
      manager.removeRoomIfEmpty(rid)
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

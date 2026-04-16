import 'dotenv/config'
import { createServer } from 'http'
import { type RawData, WebSocketServer } from 'ws'

import { CHAT_MIN_INTERVAL_MS, ClientMessage, type Color, type PlayerId } from '@gameroom/shared'

import { GlobalChat } from '@/chat/GlobalChat.js'
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
const globalChat = new GlobalChat()

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
        service: 'gameroom-ws',
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
  let assignedPlayerId: PlayerId | null = null
  let assignedSeat: Color | null = null
  let subscribedGlobalChat = false
  let lastChatAtGlobal = 0
  let lastChatAtRoom = 0

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
      const joined = room.join(ws, msg.displayName)
      if (joined) {
        assignedRoomId = msg.roomId
        assignedPlayerId = joined.playerId
        assignedSeat = joined.seat
        connLog.info(
          {
            roomId: msg.roomId,
            playerId: joined.playerId,
            seat: joined.seat,
            displayName: msg.displayName,
          },
          'player joined room'
        )
        manager.get(msg.roomId)?.sendChatHistoryTo(ws)
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
      assignedPlayerId &&
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
      assignedPlayerId &&
      msg.roomId === assignedRoomId
    ) {
      connLog.debug(
        { roomId: assignedRoomId, playerId: assignedPlayerId, gameSessionId: msg.gameSessionId },
        'game_move'
      )
      manager.get(assignedRoomId)?.handleMove(assignedPlayerId, msg.gameSessionId, msg.move)
    }

    if (
      msg.type === 'new_round' &&
      assignedRoomId &&
      assignedPlayerId &&
      msg.roomId === assignedRoomId
    ) {
      const room = manager.get(assignedRoomId)
      if (room && !room.startNewRound(msg.gameSessionId)) {
        connLog.debug({ roomId: assignedRoomId }, 'new_round rejected')
        ws.send(
          JSON.stringify({
            type: 'error',
            message:
              'Play again is only available after a finished game, with both players still connected.',
          })
        )
      }
    }

    if (
      msg.type === 'surrender' &&
      assignedRoomId &&
      assignedPlayerId &&
      msg.roomId === assignedRoomId
    ) {
      const room = manager.get(assignedRoomId)
      if (room && !room.surrender(assignedPlayerId, msg.gameSessionId)) {
        connLog.debug({ roomId: assignedRoomId }, 'surrender rejected')
        ws.send(
          JSON.stringify({
            type: 'error',
            message: 'Surrender is only available during an active game, from a seated player.',
          })
        )
      }
    }

    if (
      msg.type === 'dismiss_completed_game' &&
      assignedRoomId &&
      assignedPlayerId &&
      msg.roomId === assignedRoomId
    ) {
      const room = manager.get(assignedRoomId)
      if (room && !room.dismissCompletedGame(assignedPlayerId)) {
        connLog.debug({ roomId: assignedRoomId }, 'dismiss_completed_game rejected')
        ws.send(
          JSON.stringify({
            type: 'error',
            message: 'New game is only available after a finished round, from a seated player.',
          })
        )
      }
    }

    if (msg.type === 'chat_subscribe_global') {
      globalChat.subscribe(ws, msg.displayName)
      subscribedGlobalChat = true
      connLog.debug('global chat subscribe')
    }

    if (msg.type === 'chat_send' && msg.scope === 'global') {
      if (!subscribedGlobalChat) {
        ws.send(JSON.stringify({ type: 'error', message: 'Join global chat first (subscribe).' }))
        return
      }
      const now = Date.now()
      if (now - lastChatAtGlobal < CHAT_MIN_INTERVAL_MS) return
      const sub = globalChat.getSubscriber(ws)
      if (!sub) return
      if (!globalChat.broadcastMessage(msg.text, sub)) return
      lastChatAtGlobal = now
    }

    if (msg.type === 'chat_send' && msg.scope === 'room') {
      if (!assignedRoomId || !assignedPlayerId || msg.roomId !== assignedRoomId) return
      const now = Date.now()
      if (now - lastChatAtRoom < CHAT_MIN_INTERVAL_MS) return
      const room = manager.get(assignedRoomId)
      if (room && room.sendRoomChat(assignedPlayerId, msg.text)) {
        lastChatAtRoom = now
      }
    }
  })

  ws.on('close', () => {
    if (subscribedGlobalChat) globalChat.unsubscribe(ws)
    connLog.info(
      { roomId: assignedRoomId, seat: assignedSeat, playerId: assignedPlayerId },
      'websocket disconnected'
    )
    if (assignedRoomId && assignedSeat) {
      const rid = assignedRoomId
      manager.get(rid)?.disconnect(assignedSeat)
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

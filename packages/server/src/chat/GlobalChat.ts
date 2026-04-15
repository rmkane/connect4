import { randomUUID } from 'node:crypto'

import type { Logger } from 'pino'
import { WebSocket } from 'ws'

import type { ChatMessagePayload, PlayerId } from '@connect4/shared'
import { CHAT_HISTORY_LIMIT, sanitizeChatText } from '@connect4/shared'

import { logger } from '@/logger.js'

type Subscriber = { guestId: PlayerId; displayName: string }

export class GlobalChat {
  private subscribers = new Map<WebSocket, Subscriber>()
  private history: ChatMessagePayload[] = []
  private readonly log: Logger

  constructor() {
    this.log = logger.child({ module: 'global_chat' })
  }

  subscribe(ws: WebSocket, displayName: string): PlayerId {
    const name = displayName.trim().slice(0, 64) || 'Guest'
    const existing = this.subscribers.get(ws)
    if (existing) {
      existing.displayName = name
      this.sendHistory(ws)
      return existing.guestId
    }
    const guestId = randomUUID() as PlayerId
    this.subscribers.set(ws, { guestId, displayName: name })
    this.sendHistory(ws)
    this.log.debug({ guestId }, 'global chat subscribed')
    return guestId
  }

  getSubscriber(ws: WebSocket): Subscriber | undefined {
    return this.subscribers.get(ws)
  }

  unsubscribe(ws: WebSocket) {
    this.subscribers.delete(ws)
  }

  sendHistory(ws: WebSocket) {
    if (this.history.length === 0) return
    const payload = JSON.stringify({
      type: 'chat_history',
      scope: 'global' as const,
      messages: [...this.history],
    })
    if (ws.readyState === WebSocket.OPEN) ws.send(payload)
  }

  broadcastMessage(text: string, sub: Subscriber): ChatMessagePayload | null {
    const clean = sanitizeChatText(text)
    if (!clean) return null

    const msg: ChatMessagePayload = {
      scope: 'global',
      senderId: sub.guestId,
      displayName: sub.displayName,
      text: clean,
      sentAt: Date.now(),
    }
    this.history.push(msg)
    if (this.history.length > CHAT_HISTORY_LIMIT)
      this.history.splice(0, this.history.length - CHAT_HISTORY_LIMIT)

    const payload = JSON.stringify({ type: 'chat_message', ...msg })
    this.subscribers.forEach((_, socket) => {
      if (socket.readyState === WebSocket.OPEN) socket.send(payload)
    })
    return msg
  }
}

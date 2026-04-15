import type { PlayerId } from '@/core.js'

export const CHAT_MAX_TEXT_LENGTH = 400
export const CHAT_HISTORY_LIMIT = 50
/** Min milliseconds between chat sends per connection (abuse guard). */
export const CHAT_MIN_INTERVAL_MS = 450

export interface ChatMessagePayload {
  scope: 'room' | 'global'
  /** Present when `scope === 'room'`. */
  roomId?: string
  senderId: PlayerId
  displayName: string
  text: string
  sentAt: number
}

export function sanitizeChatText(raw: string): string | null {
  const t = raw
    .replace(/\r\n|\r|\n/g, ' ')
    .trim()
    .slice(0, CHAT_MAX_TEXT_LENGTH)
  return t.length > 0 ? t : null
}

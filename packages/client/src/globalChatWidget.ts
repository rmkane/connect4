import { type TemplateResult, html, nothing, render } from 'lit'
import { live } from 'lit/directives/live.js'

import type { ChatMessagePayload, ClientMessage, ServerMessage } from '@gameroom/shared'
import { CHAT_HISTORY_LIMIT, CHAT_MAX_TEXT_LENGTH } from '@gameroom/shared'

import { chatLogWasFollowingTail, scrollChatLogToBottomById } from '@/chatScroll.js'
import { clientConfig } from '@/config.js'
import { logger } from '@/logger.js'

const GLOBAL_CHAT_LOG_ID = 'gameroom-global-chat-log'

const LS_NAME = 'gameroom_global_chat_display_name'
/** Previous app id; still read so display names survive the rename. */
const LS_NAME_LEGACY = 'connect4_global_chat_display_name'

function formatTime(ts: number): string {
  try {
    return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

export type GlobalChatWidgetOptions = {
  /** `sidebar`: home right column. `tabPanel`: room route Global tab (compact). */
  variant?: 'default' | 'sidebar' | 'tabPanel'
}

export function mountGlobalChatWidget(
  host: HTMLElement,
  opts?: GlobalChatWidgetOptions
): { destroy: () => void } {
  const variant = opts?.variant ?? 'default'
  let ws: WebSocket | null = null
  let messages: ChatMessagePayload[] = []
  let draft = ''
  let displayName =
    (typeof localStorage !== 'undefined' &&
      (localStorage.getItem(LS_NAME)?.trim() || localStorage.getItem(LS_NAME_LEGACY)?.trim())) ||
    'Guest'

  function send(msg: ClientMessage) {
    ws?.send(JSON.stringify(msg))
  }

  function connect() {
    ws?.close()
    ws = new WebSocket(clientConfig.wsUrl)
    ws.onopen = () => {
      logger.info({ displayName }, 'global chat ws open')
      send({ type: 'chat_subscribe_global', displayName })
    }
    ws.onmessage = (event) => {
      let msg: ServerMessage
      try {
        msg = JSON.parse(event.data) as ServerMessage
      } catch (err) {
        logger.warn({ err }, 'global chat invalid json')
        return
      }
      if (msg.type === 'chat_history' && msg.scope === 'global') {
        messages = msg.messages.slice(-CHAT_HISTORY_LIMIT)
        paint({ forceScroll: true })
      }
      if (msg.type === 'chat_message' && msg.scope === 'global') {
        const next: ChatMessagePayload = {
          scope: 'global',
          senderId: msg.senderId,
          displayName: msg.displayName,
          text: msg.text,
          sentAt: msg.sentAt,
        }
        messages = [...messages, next].slice(-CHAT_HISTORY_LIMIT)
        paint()
      }
      if (msg.type === 'error') {
        logger.warn({ message: msg.message }, 'global chat server error')
      }
    }
    ws.onerror = (e) => logger.error({ e }, 'global chat ws error')
    ws.onclose = () => {
      logger.info('global chat ws closed')
    }
  }

  function saveName(next: string) {
    displayName = next.trim().slice(0, 64) || 'Guest'
    try {
      localStorage.setItem(LS_NAME, displayName)
      localStorage.removeItem(LS_NAME_LEGACY)
    } catch {
      /* ignore */
    }
    if (ws?.readyState === WebSocket.OPEN) {
      send({ type: 'chat_subscribe_global', displayName })
    }
  }

  function trySend() {
    const t = draft.trim().slice(0, CHAT_MAX_TEXT_LENGTH)
    if (!t || !ws || ws.readyState !== WebSocket.OPEN) return
    send({ type: 'chat_send', scope: 'global', text: t })
    draft = ''
    paint({ forceScroll: true })
  }

  const sectionClass =
    variant === 'tabPanel'
      ? 'grid h-full min-h-0 min-w-0 flex-1 grid-rows-[auto_minmax(0,1fr)_auto] gap-2 text-left'
      : variant === 'sidebar'
        ? 'grid h-full min-h-0 min-w-0 flex-1 grid-rows-[auto_minmax(0,1fr)_auto] gap-2 rounded-xl border border-zinc-200 bg-white p-4 text-left shadow-sm sm:gap-3 sm:p-5'
        : 'grid h-full min-h-0 min-w-0 flex-1 grid-rows-[auto_minmax(0,1fr)_auto] gap-2 rounded-xl border border-zinc-200 bg-white p-4 text-left shadow-sm sm:p-5'

  const logClass =
    'min-h-0 min-w-0 overflow-x-hidden overflow-y-auto break-words rounded-lg border border-zinc-100 bg-zinc-50 p-2 text-sm'

  function shell(): TemplateResult {
    const chrome = html`
      <div class="min-w-0 space-y-2">
        ${variant === 'tabPanel'
          ? html`<p class="text-xs text-zinc-500">Everyone on this server.</p>`
          : html`
              <h2 class="text-sm font-semibold text-zinc-900">Global chat</h2>
              <p class="text-xs text-zinc-500">
                Same server as games — no account. Be nice; messages are ephemeral.
              </p>
            `}
        <label class="block text-xs font-medium text-zinc-600" for="global-chat-name"
          >Show as</label
        >
        <input
          id="global-chat-name"
          type="text"
          maxlength="64"
          autocomplete="nickname"
          class="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-sm text-zinc-900"
          .value=${displayName}
          @change=${(e: Event) => saveName((e.target as HTMLInputElement).value)}
        />
      </div>
    `

    return html`
      <section class=${sectionClass} aria-label="Global chat">
        ${chrome}
        <div id=${GLOBAL_CHAT_LOG_ID} class=${logClass} role="log" aria-live="polite">
          ${messages.length === 0
            ? html`<p class="px-1 py-2 text-xs text-zinc-500">No messages yet.</p>`
            : messages.map(
                (m) => html`
                  <p class="border-b border-zinc-100 py-1 last:border-0">
                    <span class="text-xs text-zinc-400">${formatTime(m.sentAt)}</span>
                    <span class="font-medium text-zinc-800">${m.displayName}</span>:
                    <span class="text-zinc-700">${m.text}</span>
                  </p>
                `
              )}
        </div>
        <div
          class="flex min-w-0 gap-2 border-t border-zinc-200/80 pt-2"
          aria-label="Send a global message"
        >
          <input
            type="text"
            maxlength=${CHAT_MAX_TEXT_LENGTH}
            placeholder="Message…"
            class="min-w-0 flex-1 rounded-lg border border-zinc-300 px-2 py-2 text-sm text-zinc-900"
            .value=${live(draft)}
            @input=${(e: Event) => {
              draft = (e.target as HTMLInputElement).value
            }}
            @keydown=${(e: KeyboardEvent) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                trySend()
              }
            }}
          />
          <button
            type="button"
            class="shrink-0 rounded-lg bg-zinc-800 px-3 py-2 text-sm font-semibold text-white hover:bg-zinc-900"
            @click=${() => trySend()}
          >
            Send
          </button>
        </div>
      </section>
    `
  }

  function paint(opts?: { forceScroll?: boolean }) {
    const logBefore = document.getElementById(GLOBAL_CHAT_LOG_ID)
    const stickToBottom =
      opts?.forceScroll === true || chatLogWasFollowingTail(logBefore as HTMLElement | null)
    render(shell(), host)
    if (stickToBottom) scrollChatLogToBottomById(GLOBAL_CHAT_LOG_ID)
  }

  paint()
  connect()

  return {
    destroy() {
      ws?.close()
      ws = null
      render(nothing, host)
    },
  }
}

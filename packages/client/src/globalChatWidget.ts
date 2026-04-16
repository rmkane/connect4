import { type TemplateResult, html, nothing, render } from 'lit'
import { live } from 'lit/directives/live.js'

import type { ChatMessagePayload, ClientMessage, ServerMessage } from '@connect4/shared'
import { CHAT_MAX_TEXT_LENGTH } from '@connect4/shared'

import { clientConfig } from '@/config.js'
import { logger } from '@/logger.js'

const LS_NAME = 'connect4_global_chat_display_name'

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
    (typeof localStorage !== 'undefined' && localStorage.getItem(LS_NAME)?.trim()) || 'Guest'

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
        messages = msg.messages.slice(-50)
        paint()
      }
      if (msg.type === 'chat_message' && msg.scope === 'global') {
        messages = [
          ...messages.slice(-49),
          {
            scope: 'global',
            senderId: msg.senderId,
            displayName: msg.displayName,
            text: msg.text,
            sentAt: msg.sentAt,
          },
        ]
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
    paint()
  }

  const sectionClass =
    variant === 'tabPanel'
      ? 'flex min-h-0 flex-1 flex-col text-left'
      : variant === 'sidebar'
        ? 'flex min-h-0 flex-1 flex-col rounded-xl border border-zinc-200 bg-white p-4 text-left shadow-sm sm:p-5'
        : 'w-full rounded-xl border border-zinc-200 bg-white p-4 text-left shadow-sm sm:p-5'

  const logClass =
    variant === 'tabPanel'
      ? 'mt-2 min-h-0 flex-1 overflow-y-auto rounded-lg border border-zinc-100 bg-zinc-50 p-2 text-sm'
      : 'mt-3 max-h-40 overflow-y-auto rounded-lg border border-zinc-100 bg-zinc-50 p-2 text-sm'

  function shell(): TemplateResult {
    return html`
      <section class=${sectionClass} aria-label="Global chat">
        ${variant === 'tabPanel'
          ? nothing
          : html`
              <h2 class="text-sm font-semibold text-zinc-900">Global chat</h2>
              <p class="mt-1 text-xs text-zinc-500">
                Same server as games — no account. Be nice; messages are ephemeral.
              </p>
            `}
        ${variant === 'tabPanel'
          ? html`<p class="text-xs text-zinc-500">Everyone on this server.</p>`
          : nothing}
        <label
          class="${variant === 'tabPanel'
            ? 'mt-2'
            : 'mt-3'} block text-xs font-medium text-zinc-600"
          for="global-chat-name"
          >Show as</label
        >
        <input
          id="global-chat-name"
          type="text"
          maxlength="64"
          autocomplete="nickname"
          class="mt-1 w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-sm text-zinc-900"
          .value=${displayName}
          @change=${(e: Event) => saveName((e.target as HTMLInputElement).value)}
        />
        <div class=${logClass} role="log" aria-live="polite">
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
        <div class="mt-2 flex gap-2">
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

  function paint() {
    render(shell(), host)
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

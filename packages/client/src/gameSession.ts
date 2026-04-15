import { type TemplateResult, html, nothing, render } from 'lit'

import type { ClientMessage, ServerMessage } from '@connect4/shared'

import { clientConfig } from '@/config.js'
import { logger } from '@/logger.js'
import { renderBoard } from '@/renderer.js'
import { navigateHome } from '@/router.js'
import { setUserContext } from '@/userContext.js'

export type GameSessionHandle = { destroy: () => void }

function canUseWebShare(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function'
}

export function mountGameSession(opts: { host: HTMLElement; gameId: string }): GameSessionHandle {
  const { host, gameId } = opts
  let ws: WebSocket | null = null
  let displayName = ''
  let phase: 'name' | 'play' = 'name'
  let inviteFeedback: '' | 'copied' | 'failed' = ''
  let inviteFeedbackTimer: ReturnType<typeof setTimeout> | null = null

  function send(msg: ClientMessage) {
    ws?.send(JSON.stringify(msg))
  }

  function dropPiece(column: number) {
    logger.debug({ gameId, column }, 'sending drop_piece')
    send({ type: 'drop_piece', gameId, column })
  }

  function requestNewGame() {
    logger.debug({ gameId }, 'sending new_game')
    send({ type: 'new_game', gameId })
  }

  function clearInviteFeedbackTimer() {
    if (inviteFeedbackTimer !== null) {
      clearTimeout(inviteFeedbackTimer)
      inviteFeedbackTimer = null
    }
  }

  function setInviteFeedback(next: '' | 'copied' | 'failed', ms: number) {
    clearInviteFeedbackTimer()
    inviteFeedback = next
    paint()
    inviteFeedbackTimer = setTimeout(() => {
      inviteFeedback = ''
      inviteFeedbackTimer = null
      paint()
    }, ms)
  }

  async function copyInviteUrl(shareUrl: string) {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setInviteFeedback('copied', 2000)
    } catch (err) {
      logger.warn({ err }, 'clipboard write failed, trying execCommand')
      try {
        const ta = document.createElement('textarea')
        ta.value = shareUrl
        ta.setAttribute('readonly', '')
        ta.style.position = 'fixed'
        ta.style.left = '-9999px'
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
        setInviteFeedback('copied', 2000)
      } catch (err2) {
        logger.warn({ err: err2 }, 'copy to clipboard failed')
        setInviteFeedback('failed', 3500)
      }
    }
  }

  async function shareInviteUrl(shareUrl: string) {
    if (typeof navigator.share !== 'function') return
    try {
      await navigator.share({
        title: 'Connect 4',
        text: 'Join my Connect 4 room',
        url: shareUrl,
      })
    } catch (err) {
      if (err && typeof err === 'object' && 'name' in err && err.name === 'AbortError') return
      logger.warn({ err }, 'navigator.share failed')
    }
  }

  function connect() {
    ws = new WebSocket(clientConfig.wsUrl)
    ws.onopen = () => {
      logger.info({ gameId, displayName }, 'websocket open sending join_game')
      send({ type: 'join_game', gameId, displayName })
    }
    ws.onmessage = (event) => {
      let msg: ServerMessage
      try {
        msg = JSON.parse(event.data) as ServerMessage
      } catch (err) {
        logger.warn({ err }, 'invalid server message json')
        return
      }
      logger.debug({ type: msg.type }, 'server message')
      if (msg.type === 'game_state') renderBoard(msg.state, dropPiece, requestNewGame, displayName)
      if (msg.type === 'error') {
        logger.warn({ message: msg.message }, 'server error')
        alert(msg.message)
      }
    }
    ws.onerror = (event) => {
      logger.error({ event }, 'websocket error')
    }
    ws.onclose = (event) => {
      logger.info({ code: event.code, reason: event.reason }, 'websocket closed')
    }
  }

  function shell(): TemplateResult {
    const shareUrl = `${location.origin}/room/${gameId}`

    return html`
      <div class="flex w-full max-w-4xl flex-col items-stretch">
        <div
          class="mb-6 flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm sm:flex-row sm:items-start sm:justify-between sm:p-5"
          aria-label="Table details"
        >
          <div class="min-w-0 flex-1">
            <button
              type="button"
              class="inline-flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-left text-sm font-medium text-red-800 underline decoration-red-300 underline-offset-2 hover:text-red-950"
              @click=${() => {
                ws?.close()
                navigateHome()
              }}
            >
              ← Leave table
            </button>
            <p class="mt-2 font-mono text-xs leading-relaxed text-zinc-600">
              Id <span class="break-all text-zinc-800 select-all">${gameId}</span>
            </p>
          </div>
          <div class="min-w-0 sm:max-w-[55%] sm:text-right">
            <p class="text-xs font-medium tracking-wide text-zinc-500 uppercase">Invite</p>
            <div
              class="mt-2 flex flex-wrap items-center gap-2 sm:justify-end"
              role="group"
              aria-label="Copy or share room link"
            >
              <button
                type="button"
                class="inline-flex cursor-pointer items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 shadow-sm transition hover:bg-zinc-50"
                @click=${() => void copyInviteUrl(shareUrl)}
              >
                Copy link
              </button>
              ${canUseWebShare()
                ? html`
                    <button
                      type="button"
                      class="inline-flex cursor-pointer items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 shadow-sm transition hover:bg-zinc-50"
                      @click=${() => void shareInviteUrl(shareUrl)}
                    >
                      Share…
                    </button>
                  `
                : nothing}
              ${inviteFeedback === 'copied'
                ? html`<span class="text-xs font-medium text-emerald-700">Copied</span>`
                : inviteFeedback === 'failed'
                  ? html`<span class="text-xs font-medium text-red-700">Copy failed</span>`
                  : nothing}
            </div>
          </div>
        </div>

        ${phase === 'name'
          ? html`
              <form
                class="mx-auto w-full max-w-md rounded-xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8"
                @submit=${(e: Event) => {
                  e.preventDefault()
                  const fd = new FormData(e.target as HTMLFormElement)
                  displayName = String(fd.get('displayName') ?? '').trim() || 'Player'
                  logger.info({ gameId, displayName }, 'starting session')
                  setUserContext(displayName)
                  phase = 'play'
                  paint()
                  connect()
                }}
              >
                <label class="block text-sm font-medium text-zinc-800" for="displayName"
                  >Display name</label
                >
                <input
                  id="displayName"
                  name="displayName"
                  type="text"
                  autocomplete="nickname"
                  class="mt-2 w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-sm text-zinc-900 focus:border-red-400 focus:ring-2 focus:ring-red-200 focus:outline-none"
                  placeholder="Your name"
                />
                <button
                  type="submit"
                  class="mt-5 w-full rounded-xl bg-red-700 px-4 py-2.5 text-sm font-semibold text-white shadow transition hover:bg-red-800"
                >
                  Connect to table
                </button>
              </form>
            `
          : html`
              <div
                id="board"
                class="flex w-full flex-col items-center"
                aria-label="Game board"
              ></div>
            `}
      </div>
    `
  }

  function paint() {
    render(shell(), host)
  }

  function destroy() {
    clearInviteFeedbackTimer()
    ws?.close()
    ws = null
    setUserContext(null)
    render(nothing, host)
  }

  paint()

  return { destroy }
}

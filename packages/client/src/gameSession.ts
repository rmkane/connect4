import { type TemplateResult, html, nothing, render } from 'lit'

import type { ClientMessage, ServerMessage } from '@connect4/shared'

import { logger } from '@/logger.js'
import { renderBoard } from '@/renderer.js'
import { navigateHome } from '@/router.js'

export type GameSessionHandle = { destroy: () => void }

export function mountGameSession(opts: { host: HTMLElement; gameId: string }): GameSessionHandle {
  const { host, gameId } = opts
  let ws: WebSocket | null = null
  let displayName = ''
  let phase: 'name' | 'play' = 'name'

  function send(msg: ClientMessage) {
    ws?.send(JSON.stringify(msg))
  }

  function dropPiece(column: number) {
    logger.debug({ gameId, column }, 'sending drop_piece')
    send({ type: 'drop_piece', gameId, column })
  }

  function connect() {
    ws = new WebSocket(`ws://localhost:3000`)
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
      if (msg.type === 'game_state') renderBoard(msg.state, dropPiece, displayName)
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
    const shareUrl = `${location.origin}/game/${gameId}`

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
            <p class="text-xs font-medium tracking-wide text-zinc-500 uppercase">Invite link</p>
            <p class="mt-1 font-mono text-xs break-all text-zinc-700 select-all">${shareUrl}</p>
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
    ws?.close()
    ws = null
    render(nothing, host)
  }

  paint()

  return { destroy }
}

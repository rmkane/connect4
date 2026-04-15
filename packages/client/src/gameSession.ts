import { type TemplateResult, html, nothing, render } from 'lit'
import { live } from 'lit/directives/live.js'

import type {
  ChatMessagePayload,
  ClientMessage,
  GameKind,
  PlayerId,
  RoomSnapshot,
  ServerMessage,
} from '@connect4/shared'
import { CHAT_MAX_TEXT_LENGTH } from '@connect4/shared'

import { clientConfig } from '@/config.js'
import { logger } from '@/logger.js'
import { navigateHome } from '@/router.js'
import { setUserContext } from '@/userContext.js'
import { renderConnect4View } from '@/views/connect4View.js'
import { renderTicTacToeView } from '@/views/ticTacToeView.js'

export type GameSessionHandle = { destroy: () => void }

function formatChatTime(ts: number): string {
  try {
    return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

function canUseWebShare(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function'
}

export function mountGameSession(opts: { host: HTMLElement; roomId: string }): GameSessionHandle {
  const { host, roomId } = opts
  let ws: WebSocket | null = null
  let displayName = ''
  let phase: 'name' | 'play' = 'name'
  let lastSnapshot: RoomSnapshot | null = null
  let myPlayerId: PlayerId | null = null
  let roomChatMessages: ChatMessagePayload[] = []
  let roomChatDraft = ''
  let inviteFeedback: '' | 'copied' | 'failed' = ''
  let inviteFeedbackTimer: ReturnType<typeof setTimeout> | null = null

  function send(msg: ClientMessage) {
    ws?.send(JSON.stringify(msg))
  }

  function paintRoomChat() {
    const el = document.getElementById('room-chat')
    if (!el || phase !== 'play') return
    render(
      html`
        <section
          class="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm"
          aria-label="Room chat"
        >
          <h2 class="text-sm font-semibold text-zinc-900">Room chat</h2>
          <p class="mt-1 text-xs text-zinc-500">
            Only people seated in this room see these messages.
          </p>
          <div
            class="mt-3 max-h-36 overflow-y-auto rounded-lg border border-zinc-100 bg-zinc-50 p-2 text-sm"
            role="log"
            aria-live="polite"
          >
            ${roomChatMessages.length === 0
              ? html`<p class="py-2 text-xs text-zinc-500">No messages yet.</p>`
              : roomChatMessages.map(
                  (m) => html`
                    <p class="border-b border-zinc-100 py-1 last:border-0">
                      <span class="text-xs text-zinc-400">${formatChatTime(m.sentAt)}</span>
                      <span
                        class="${m.senderId === myPlayerId
                          ? 'font-semibold text-red-800'
                          : 'font-medium text-zinc-800'}"
                        >${m.displayName}</span
                      >:
                      <span class="text-zinc-700">${m.text}</span>
                    </p>
                  `
                )}
          </div>
          <div class="mt-2 flex gap-2">
            <input
              type="text"
              maxlength=${CHAT_MAX_TEXT_LENGTH}
              placeholder="Message to room…"
              class="min-w-0 flex-1 rounded-lg border border-zinc-300 px-2 py-2 text-sm text-zinc-900"
              .value=${live(roomChatDraft)}
              @input=${(e: Event) => {
                roomChatDraft = (e.target as HTMLInputElement).value
              }}
              @keydown=${(e: KeyboardEvent) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  sendRoomChat()
                }
              }}
            />
            <button
              type="button"
              class="shrink-0 rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white hover:bg-red-800"
              @click=${() => sendRoomChat()}
            >
              Send
            </button>
          </div>
        </section>
      `,
      el
    )
  }

  function sendRoomChat() {
    const t = roomChatDraft.trim()
    if (!t || !myPlayerId) return
    send({ type: 'chat_send', scope: 'room', roomId, text: t })
    roomChatDraft = ''
    paintRoomChat()
  }

  function paintBoardArea() {
    const el = document.getElementById('board')
    if (!el || !lastSnapshot) return

    const s = lastSnapshot
    const bothSeated = Boolean(s.seats.red && s.seats.yellow)

    if (!bothSeated) {
      render(preGameWaiting(s), el)
      return
    }

    if (!s.activeGame) {
      render(gamePicker(), el)
      return
    }

    if (s.activeGame.game === 'connect4') {
      const game = s.activeGame
      renderConnect4View(
        s,
        game,
        (column) => {
          logger.debug({ roomId, column }, 'sending connect4 move')
          send({
            type: 'game_move',
            roomId,
            gameSessionId: game.gameSessionId,
            move: { game: 'connect4', column },
          })
        },
        () => {
          logger.debug({ roomId }, 'sending new_round')
          send({ type: 'new_round', roomId, gameSessionId: game.gameSessionId })
        },
        () => {
          logger.debug({ roomId }, 'dismiss_completed_game')
          send({ type: 'dismiss_completed_game', roomId })
        },
        () => {
          logger.debug({ roomId }, 'surrender connect4')
          send({ type: 'surrender', roomId, gameSessionId: game.gameSessionId })
        },
        myPlayerId
      )
      return
    }

    const ttt = s.activeGame
    renderTicTacToeView(
      s,
      ttt,
      (row, col) => {
        logger.debug({ roomId, row, col }, 'sending tic-tac-toe move')
        send({
          type: 'game_move',
          roomId,
          gameSessionId: ttt.gameSessionId,
          move: { game: 'tic_tac_toe', row, col },
        })
      },
      () => {
        send({ type: 'new_round', roomId, gameSessionId: ttt.gameSessionId })
      },
      () => {
        send({ type: 'dismiss_completed_game', roomId })
      },
      () => {
        send({ type: 'surrender', roomId, gameSessionId: ttt.gameSessionId })
      },
      myPlayerId
    )
  }

  function preGameWaiting(s: RoomSnapshot): TemplateResult {
    const r = s.seats.red?.displayName ?? null
    const y = s.seats.yellow?.displayName ?? null

    return html`
      <div
        class="mx-auto max-w-md rounded-xl border border-zinc-200 bg-white p-6 text-center shadow-sm"
        aria-live="polite"
      >
        <h2 class="text-lg font-semibold text-zinc-900">Waiting for opponent</h2>
        <p class="mt-3 text-sm text-zinc-600">
          ${r && !y
            ? html`Invite someone for <span class="font-medium text-amber-700">yellow</span>.`
            : !r && y
              ? html`Waiting for <span class="font-medium text-red-700">red</span> to join.`
              : html`Share the invite link so someone can take the other seat.`}
        </p>
        <div class="mt-4 text-left text-sm text-zinc-700">
          <p><span class="font-medium text-red-700">Red</span>: ${r ?? '—'}</p>
          <p class="mt-1"><span class="font-medium text-amber-700">Yellow</span>: ${y ?? '—'}</p>
        </div>
      </div>
    `
  }

  function gamePicker(): TemplateResult {
    function pick(kind: GameKind) {
      logger.info({ roomId, kind }, 'create_game')
      send({ type: 'create_game', roomId, kind })
    }

    return html`
      <div
        class="mx-auto flex max-w-md flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm"
        aria-labelledby="pick-game-heading"
      >
        <h2 id="pick-game-heading" class="text-lg font-semibold text-zinc-900">Choose a game</h2>
        <p class="text-sm text-zinc-600">
          Both players are here. Pick what to play — you can start a different title after a round
          ends.
        </p>
        <div class="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            class="flex-1 rounded-lg bg-red-700 px-4 py-3 text-sm font-semibold text-white shadow transition hover:bg-red-800"
            @click=${() => pick('connect4')}
          >
            Connect 4
          </button>
          <button
            type="button"
            class="flex-1 rounded-lg border border-zinc-300 bg-zinc-50 px-4 py-3 text-sm font-semibold text-zinc-900 shadow-sm transition hover:bg-zinc-100"
            @click=${() => pick('tic_tac_toe')}
          >
            Tic-tac-toe
          </button>
        </div>
      </div>
    `
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
        title: 'Game room',
        text: 'Join my game room',
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
      logger.info({ roomId, displayName }, 'websocket open sending join_room')
      send({ type: 'join_room', roomId, displayName })
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
      if (msg.type === 'joined_room') {
        myPlayerId = msg.playerId
        logger.info({ playerId: msg.playerId, seat: msg.seat }, 'assigned player id')
        if (phase === 'play' && lastSnapshot) paintBoardArea()
        if (phase === 'play') paintRoomChat()
      }
      if (msg.type === 'room_state') {
        lastSnapshot = msg.snapshot
        if (phase === 'play') paintBoardArea()
        if (phase === 'play') paintRoomChat()
      }
      if (msg.type === 'chat_history' && msg.scope === 'room' && msg.roomId === roomId) {
        roomChatMessages = msg.messages.slice(-100)
        if (phase === 'play') paintRoomChat()
      }
      if (msg.type === 'chat_message' && msg.scope === 'room' && msg.roomId === roomId) {
        roomChatMessages = [
          ...roomChatMessages.slice(-99),
          {
            scope: 'room',
            roomId: msg.roomId,
            senderId: msg.senderId,
            displayName: msg.displayName,
            text: msg.text,
            sentAt: msg.sentAt,
          },
        ]
        if (phase === 'play') paintRoomChat()
      }
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
    const shareUrl = `${location.origin}/room/${roomId}`

    return html`
      <div class="flex w-full max-w-4xl flex-col items-stretch">
        <div
          class="mb-6 flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm sm:flex-row sm:items-start sm:justify-between sm:p-5"
          aria-label="Room details"
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
              ← Leave room
            </button>
            <p class="mt-2 font-mono text-xs leading-relaxed text-zinc-600">
              Room <span class="break-all text-zinc-800 select-all">${roomId}</span>
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
                  logger.info({ roomId, displayName }, 'starting session')
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
                  Join room
                </button>
              </form>
            `
          : html`
              <div
                id="board"
                class="flex w-full flex-col items-center"
                aria-label="Play area"
              ></div>
              <div id="room-chat" class="mt-6 w-full"></div>
            `}
      </div>
    `
  }

  function paint() {
    render(shell(), host)
    if (phase === 'play' && lastSnapshot) paintBoardArea()
    if (phase === 'play') paintRoomChat()
  }

  function destroy() {
    clearInviteFeedbackTimer()
    ws?.close()
    ws = null
    myPlayerId = null
    roomChatMessages = []
    roomChatDraft = ''
    setUserContext(null)
    render(nothing, host)
  }

  paint()

  return { destroy }
}

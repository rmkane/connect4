import { type TemplateResult, html, nothing, render } from 'lit'
import { live } from 'lit/directives/live.js'

import type {
  AnyGameState,
  ChatMessagePayload,
  ClientMessage,
  GameKind,
  GameMetricsSummary,
  PendingRematch,
  PlayerId,
  RoomSnapshot,
  ServerMessage,
} from '@gameroom/shared'
import {
  CHAT_HISTORY_LIMIT,
  CHAT_MAX_TEXT_LENGTH,
  ROOM_TABLE_CAPACITY,
  SYSTEM_ANNOUNCEMENT_PLAYER_ID,
  roomTableIsFull,
} from '@gameroom/shared'

import { chatLogWasFollowingTail, scrollChatLogToBottomById } from '@/chatScroll.js'
import { clientConfig } from '@/config.js'
import { logger } from '@/logger.js'
import { navigateHome } from '@/router.js'
import { clearSessionContext, paintRoomSessionChrome } from '@/sessionContext.js'
import { alertModal, closeModalById, openModalById } from '@/views/appModal.js'
import { renderConnect4View } from '@/views/connect4View.js'
import { gameSummaryDialog } from '@/views/gameSummaryDialog.js'
import { rematchOfferDialog } from '@/views/rematchOfferDialog.js'
import { renderTicTacToeView } from '@/views/ticTacToeView.js'

const ROOM_CHAT_LOG_ID = 'gameroom-room-chat-log'
const ROOM_DISPLAY_NAME_MAX = 64
const SESSION_ERR_DLG_ID = 'gs-session-err-dlg'
const SESSION_JOIN_NAME_DLG_ID = 'gs-join-name-dlg'
const GAME_SUMMARY_DLG_ID = 'gs-game-summary-dlg'
const REMATCH_OFFER_DLG_ID = 'gs-rematch-offer-dlg'

export type GameSessionHandle = { destroy: () => void }

function boardIsUnstarted(ag: AnyGameState): boolean {
  if (ag.game === 'connect4') return ag.board.every((row) => row.every((c) => c === null))
  return ag.board.every((row) => row.every((c) => c === null))
}

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

function otherSeatedPlayer(
  s: RoomSnapshot,
  myId: PlayerId
): { id: PlayerId; displayName: string } | null {
  for (let i = 0; i < ROOM_TABLE_CAPACITY; i++) {
    const p = s.seats[i]
    if (p && p.id !== myId) return { id: p.id, displayName: p.displayName }
  }
  return null
}

export function mountGameSession(opts: {
  host: HTMLElement
  roomId: string
  roomChatMount: HTMLElement
}): GameSessionHandle {
  const { host, roomId, roomChatMount } = opts
  let ws: WebSocket | null = null
  let displayName = ''
  let phase: 'name' | 'play' = 'name'
  let lastSnapshot: RoomSnapshot | null = null
  /** Until the first `room_state`, host comes from `joined_room`. */
  let leaderIdHint: PlayerId | null = null
  let myPlayerId: PlayerId | null = null
  let roomChatMessages: ChatMessagePayload[] = []
  let roomChatDraft = ''
  let inviteFeedback: '' | 'copied' | 'failed' = ''
  let inviteFeedbackTimer: ReturnType<typeof setTimeout> | null = null
  let titleDraft = ''
  let serverErrorMessage: string | null = null
  let joinNameError: string | null = null
  /** Latest finished game on this socket; kept after closing the recap dialog until stale or leave. */
  let lastGameSummary: GameMetricsSummary | null = null
  /** Last rematch prompt we auto-opened (`session:requester:offeredAt`); avoids reopening on every `room_state`. */
  let lastRematchOfferPromptKey: string | null = null

  function rematchOfferForOpponent(snapshot: RoomSnapshot): PendingRematch | null {
    if (!myPlayerId) return null
    const pr = snapshot.pendingRematch
    const ag = snapshot.activeGame
    if (!pr || pr.requesterId === myPlayerId) return null
    if (!ag || ag.status !== 'completed' || ag.gameSessionId !== pr.gameSessionId) return null
    return pr
  }

  function syncRematchOfferDialog(snapshot: RoomSnapshot) {
    if (phase !== 'play') {
      lastRematchOfferPromptKey = null
      closeModalById(REMATCH_OFFER_DLG_ID)
      return
    }
    const offer = rematchOfferForOpponent(snapshot)
    if (!offer) {
      lastRematchOfferPromptKey = null
      closeModalById(REMATCH_OFFER_DLG_ID)
      return
    }
    const key = `${offer.gameSessionId}:${offer.requesterId}:${offer.offeredAt}`
    if (key !== lastRematchOfferPromptKey) {
      lastRematchOfferPromptKey = key
      paint()
      queueMicrotask(() => openModalById(REMATCH_OFFER_DLG_ID))
    }
  }

  function openGameRecap() {
    queueMicrotask(() => openModalById(GAME_SUMMARY_DLG_ID))
  }

  /** Drop recap when a new session starts or the same session begins a fresh round (Play again). */
  function clearStaleGameSummary(snapshot: RoomSnapshot) {
    if (!lastGameSummary) return
    const ag = snapshot.activeGame
    if (ag && ag.gameSessionId !== lastGameSummary.gameSessionId) {
      lastGameSummary = null
      closeModalById(GAME_SUMMARY_DLG_ID)
      return
    }
    if (
      ag &&
      ag.status === 'in_progress' &&
      ag.gameSessionId === lastGameSummary.gameSessionId &&
      boardIsUnstarted(ag)
    ) {
      lastGameSummary = null
      closeModalById(GAME_SUMMARY_DLG_ID)
    }
  }

  function send(msg: ClientMessage) {
    ws?.send(JSON.stringify(msg))
  }

  function paintRoomChatPlaceholder() {
    if (phase !== 'name') return
    render(
      html`
        <div
          class="rounded-lg border border-dashed border-zinc-200 bg-white/80 p-4 text-left text-sm text-zinc-600"
        >
          <p class="font-semibold text-zinc-900">Room chat</p>
          <p class="mt-2 leading-relaxed">
            Use the form in the center to join this room. After you are seated, messages you send
            here are visible only to people at this table.
          </p>
        </div>
      `,
      roomChatMount
    )
  }

  function paintRoomChat(opts?: { forceScroll?: boolean }) {
    if (phase !== 'play') return
    const logBefore = document.getElementById(ROOM_CHAT_LOG_ID)
    const stickToBottom =
      opts?.forceScroll === true || chatLogWasFollowingTail(logBefore as HTMLElement | null)

    render(
      html`
        <section
          class="grid min-h-0 min-w-0 flex-1 grid-rows-[auto_minmax(0,1fr)_auto] gap-2 text-left"
          aria-label="Room chat"
        >
          <p class="min-w-0 text-xs text-zinc-500">
            Only people seated in this room see these messages.
          </p>
          <div
            id=${ROOM_CHAT_LOG_ID}
            class="min-h-0 min-w-0 overflow-x-hidden overflow-y-auto rounded-lg border border-zinc-100 bg-zinc-50 p-2 text-sm wrap-break-word"
            role="log"
            aria-live="polite"
          >
            ${roomChatMessages.length === 0
              ? html`<p class="py-2 text-xs text-zinc-500">No messages yet.</p>`
              : roomChatMessages.map((m) =>
                  m.system === true || m.senderId === SYSTEM_ANNOUNCEMENT_PLAYER_ID
                    ? html`
                        <p
                          class="border-b border-zinc-100 bg-zinc-100/60 py-1.5 pl-1 last:border-0"
                          role="status"
                        >
                          <span class="text-xs text-zinc-400">${formatChatTime(m.sentAt)}</span>
                          <span
                            class="ml-1 text-xs font-semibold tracking-wide text-zinc-500 uppercase"
                            >Room</span
                          >
                          <span class="ml-1 text-zinc-700">${m.text}</span>
                        </p>
                      `
                    : html`
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
          <div
            class="flex min-w-0 gap-2 border-t border-zinc-200/80 pt-2"
            aria-label="Send a room message"
          >
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
      roomChatMount
    )
    if (stickToBottom) scrollChatLogToBottomById(ROOM_CHAT_LOG_ID)
  }

  function sendRoomChat() {
    const t = roomChatDraft.trim()
    if (!t || !myPlayerId) return
    send({ type: 'chat_send', scope: 'room', roomId, text: t })
    roomChatDraft = ''
    paintRoomChat({ forceScroll: true })
  }

  function paintBoardArea() {
    const el = document.getElementById('board')
    if (!el || !lastSnapshot) return

    const s = lastSnapshot
    const bothSeated = roomTableIsFull(s.seats)

    if (!bothSeated) {
      render(preGameWaiting(s), el)
      return
    }

    if (!s.activeGame) {
      const isTableHost = Boolean(myPlayerId && s.leaderId === myPlayerId)
      render(gamePicker(isTableHost, Boolean(lastGameSummary)), el)
      return
    }

    const recapForSession =
      lastGameSummary && lastGameSummary.gameSessionId === s.activeGame.gameSessionId
        ? { show: true, onOpen: openGameRecap }
        : null

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
        {
          offer: () => {
            logger.debug({ roomId }, 'rematch_offer')
            send({ type: 'rematch_offer', roomId, gameSessionId: game.gameSessionId })
          },
          accept: () => {
            send({ type: 'rematch_accept', roomId, gameSessionId: game.gameSessionId })
          },
          decline: () => {
            send({ type: 'rematch_decline', roomId, gameSessionId: game.gameSessionId })
          },
          cancel: () => {
            send({ type: 'rematch_cancel', roomId, gameSessionId: game.gameSessionId })
          },
        },
        () => {
          logger.debug({ roomId }, 'dismiss_completed_game')
          send({ type: 'dismiss_completed_game', roomId })
        },
        () => {
          logger.debug({ roomId }, 'surrender connect4')
          send({ type: 'surrender', roomId, gameSessionId: game.gameSessionId })
        },
        myPlayerId,
        recapForSession
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
      {
        offer: () => {
          send({ type: 'rematch_offer', roomId, gameSessionId: ttt.gameSessionId })
        },
        accept: () => {
          send({ type: 'rematch_accept', roomId, gameSessionId: ttt.gameSessionId })
        },
        decline: () => {
          send({ type: 'rematch_decline', roomId, gameSessionId: ttt.gameSessionId })
        },
        cancel: () => {
          send({ type: 'rematch_cancel', roomId, gameSessionId: ttt.gameSessionId })
        },
      },
      () => {
        send({ type: 'dismiss_completed_game', roomId })
      },
      () => {
        send({ type: 'surrender', roomId, gameSessionId: ttt.gameSessionId })
      },
      myPlayerId,
      recapForSession
    )
  }

  function preGameWaiting(s: RoomSnapshot): TemplateResult {
    const s0 = s.seats[0]?.displayName ?? null
    const s1 = s.seats[1]?.displayName ?? null

    return html`
      <div
        class="mx-auto max-w-md rounded-xl border border-zinc-200 bg-white p-6 text-center shadow-sm"
        aria-live="polite"
      >
        <h2 class="text-lg font-semibold text-zinc-900">Waiting for opponent</h2>
        <p class="mt-3 text-sm text-zinc-600">
          ${s0 && !s1
            ? html`Invite someone to take
                <span class="font-medium text-amber-800">table seat 2</span>.`
            : !s0 && s1
              ? html`Waiting for <span class="font-medium text-zinc-900">table seat 1</span> to
                  fill.`
              : html`Share the invite link so someone can take the other seat.`}
        </p>
        <div class="mt-4 text-left text-sm text-zinc-700">
          <p><span class="font-medium text-zinc-900">Seat 1</span>: ${s0 ?? '—'}</p>
          <p class="mt-1"><span class="font-medium text-zinc-900">Seat 2</span>: ${s1 ?? '—'}</p>
        </div>
      </div>
    `
  }

  function gamePicker(isTableHost: boolean, showLastRecap: boolean): TemplateResult {
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
        ${showLastRecap
          ? html`
              <button
                type="button"
                class="w-full rounded-lg border border-zinc-300 bg-zinc-50 px-4 py-2.5 text-sm font-semibold text-zinc-800 shadow-sm transition hover:bg-zinc-100"
                @click=${openGameRecap}
              >
                View last game recap
              </button>
            `
          : nothing}
        ${isTableHost
          ? html`
              <p class="text-sm text-zinc-600">
                Both players are here. As table host, pick what to play — you can choose a different
                title after a round ends.
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
            `
          : html`
              <p class="text-sm text-zinc-600">
                Both players are here. Waiting for the table host to start a game.
              </p>
            `}
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
        leaderIdHint = msg.leaderId
        logger.info({ playerId: msg.playerId, seat: msg.seat }, 'assigned player id')
        if (phase === 'play' && lastSnapshot) paintBoardArea()
        if (phase === 'play') paintRoomChat()
        if (phase === 'play') paintSessionChrome()
      }
      if (msg.type === 'room_state') {
        lastSnapshot = msg.snapshot
        leaderIdHint = msg.snapshot.leaderId
        titleDraft = msg.snapshot.roomTitle
        clearStaleGameSummary(msg.snapshot)
        syncRematchOfferDialog(msg.snapshot)
        if (phase === 'play') paintBoardArea()
        if (phase === 'play') paintSessionChrome()
      }
      if (msg.type === 'chat_history' && msg.scope === 'room' && msg.roomId === roomId) {
        roomChatMessages = msg.messages.slice(-CHAT_HISTORY_LIMIT)
        if (phase === 'play') paintRoomChat({ forceScroll: true })
      }
      if (msg.type === 'chat_message' && msg.scope === 'room' && msg.roomId === roomId) {
        const next: ChatMessagePayload = {
          scope: 'room',
          roomId: msg.roomId,
          senderId: msg.senderId,
          displayName: msg.displayName,
          text: msg.text,
          sentAt: msg.sentAt,
          ...(msg.system === true ? { system: true as const } : {}),
        }
        roomChatMessages = [...roomChatMessages, next].slice(-CHAT_HISTORY_LIMIT)
        if (phase === 'play') paintRoomChat()
      }
      if (msg.type === 'error') {
        logger.warn({ message: msg.message }, 'server error')
        serverErrorMessage = msg.message
        paint()
        queueMicrotask(() => openModalById(SESSION_ERR_DLG_ID))
      }
      if (msg.type === 'game_summary' && msg.summary.roomId === roomId) {
        lastGameSummary = msg.summary
        paint()
        queueMicrotask(() => openModalById(GAME_SUMMARY_DLG_ID))
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
    return html`
      <div class="flex w-full max-w-4xl flex-col items-stretch">
        ${phase === 'name'
          ? html`
              <form
                class="mx-auto w-full max-w-md rounded-xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8"
                novalidate
                @submit=${(e: Event) => {
                  e.preventDefault()
                  const fd = new FormData(e.target as HTMLFormElement)
                  const raw = String(fd.get('displayName') ?? '').trim()
                  if (raw.length < 1) {
                    joinNameError =
                      'A display name is required so your opponent can see who they are playing.'
                    paint()
                    queueMicrotask(() => openModalById(SESSION_JOIN_NAME_DLG_ID))
                    return
                  }
                  if (raw.length > ROOM_DISPLAY_NAME_MAX) {
                    joinNameError = `Display name must be at most ${ROOM_DISPLAY_NAME_MAX} characters.`
                    paint()
                    queueMicrotask(() => openModalById(SESSION_JOIN_NAME_DLG_ID))
                    return
                  }
                  joinNameError = null
                  displayName = raw
                  logger.info({ roomId, displayName }, 'starting session')
                  phase = 'play'
                  paint()
                  connect()
                }}
              >
                <label class="block text-sm font-medium text-zinc-800" for="displayName"
                  >Display name <span class="text-red-700">*</span></label
                >
                <input
                  id="displayName"
                  name="displayName"
                  type="text"
                  required
                  minlength="1"
                  maxlength=${ROOM_DISPLAY_NAME_MAX}
                  autocomplete="nickname"
                  class="mt-2 w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-sm text-zinc-900 focus:border-red-400 focus:ring-2 focus:ring-red-200 focus:outline-none"
                  placeholder="How you appear at the table"
                />
                <p class="mt-1.5 text-xs text-zinc-500">
                  Required · max ${ROOM_DISPLAY_NAME_MAX} characters
                </p>
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
            `}
        ${serverErrorMessage
          ? alertModal(SESSION_ERR_DLG_ID, 'Server message', serverErrorMessage, {
              onDismiss: () => {
                serverErrorMessage = null
                paint()
              },
            })
          : nothing}
        ${joinNameError
          ? alertModal(SESSION_JOIN_NAME_DLG_ID, 'Display name required', joinNameError, {
              onDismiss: () => {
                joinNameError = null
                paint()
              },
            })
          : nothing}
        ${phase === 'play' && lastGameSummary
          ? gameSummaryDialog(GAME_SUMMARY_DLG_ID, lastGameSummary)
          : nothing}
        ${phase === 'play' && lastSnapshot && rematchOfferForOpponent(lastSnapshot)
          ? rematchOfferDialog(
              REMATCH_OFFER_DLG_ID,
              lastSnapshot,
              rematchOfferForOpponent(lastSnapshot)!,
              {
                onAccept: () => {
                  const pr = lastSnapshot!.pendingRematch!
                  send({ type: 'rematch_accept', roomId, gameSessionId: pr.gameSessionId })
                },
                onDecline: () => {
                  const pr = lastSnapshot!.pendingRematch!
                  send({ type: 'rematch_decline', roomId, gameSessionId: pr.gameSessionId })
                },
              }
            )
          : nothing}
      </div>
    `
  }

  function paintSessionChrome() {
    if (phase !== 'play' || !displayName) {
      clearSessionContext()
      return
    }
    const shareUrl = `${location.origin}/room/${roomId}`
    const roomTitle = lastSnapshot?.roomTitle ?? ''
    const leaderId = lastSnapshot?.leaderId ?? leaderIdHint
    const isTableHost = Boolean(myPlayerId && leaderId === myPlayerId)
    const passHostTarget =
      isTableHost && lastSnapshot && myPlayerId ? otherSeatedPlayer(lastSnapshot, myPlayerId) : null
    paintRoomSessionChrome({
      displayName,
      roomId,
      roomTitle,
      titleDraft,
      isTableHost,
      passHostTarget,
      onPassHost: () => {
        if (!passHostTarget) return
        send({ type: 'transfer_leadership', roomId, newLeaderId: passHostTarget.id })
      },
      shareUrl,
      inviteFeedback,
      onTitleInput: (v) => {
        titleDraft = v
        paintSessionChrome()
      },
      onSaveTitle: () => {
        send({ type: 'set_room_title', roomId, title: titleDraft })
      },
      onLeave: () => {
        ws?.close()
        navigateHome()
      },
      onCopy: () => void copyInviteUrl(shareUrl),
      onShare: canUseWebShare() ? () => void shareInviteUrl(shareUrl) : undefined,
    })
  }

  function paint() {
    render(shell(), host)
    if (phase === 'play' && lastSnapshot) paintBoardArea()
    if (phase === 'play') paintRoomChat()
    else paintRoomChatPlaceholder()
    paintSessionChrome()
  }

  function destroy() {
    clearInviteFeedbackTimer()
    ws?.close()
    ws = null
    myPlayerId = null
    leaderIdHint = null
    roomChatMessages = []
    roomChatDraft = ''
    titleDraft = ''
    serverErrorMessage = null
    joinNameError = null
    lastGameSummary = null
    lastRematchOfferPromptKey = null
    closeModalById(REMATCH_OFFER_DLG_ID)
    clearSessionContext()
    render(nothing, roomChatMount)
    render(nothing, host)
  }

  paint()

  return { destroy }
}

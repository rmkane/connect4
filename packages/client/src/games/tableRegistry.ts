import { type TemplateResult, html } from 'lit'

import type {
  AnyGameState,
  ClientMessage,
  GameKind,
  PlayerId,
  RoomSnapshot,
} from '@gameroom/shared'

import { renderConnect4View } from '@/views/connect4View.js'
import { renderRockPaperScissorsView } from '@/views/rockPaperScissorsView.js'
import { renderTicTacToeView } from '@/views/ticTacToeView.js'

export type TableGamePaintContext = {
  roomId: string
  snapshot: RoomSnapshot
  state: AnyGameState
  send: (msg: ClientMessage) => void
  myPlayerId: PlayerId | null
  recapForSession: { show: boolean; onOpen: () => void } | null
  logger: typeof import('@/logger.js').logger
}

export function boardIsUnstarted(ag: AnyGameState): boolean {
  switch (ag.game) {
    case 'connect4':
      return ag.board.every((row) => row.every((c) => c === null))
    case 'rock_paper_scissors':
      return ag.completedRounds === 0 && ag.roundThrows[0] === null && ag.roundThrows[1] === null
    case 'tic_tac_toe':
      return ag.board.every((row) => row.every((c) => c === null))
    default: {
      const _exhaustive: never = ag
      void _exhaustive
      return false
    }
  }
}

export function paintRegisteredTableGame(ctx: TableGamePaintContext): void {
  const { snapshot, state, roomId, send, myPlayerId, recapForSession, logger } = ctx
  switch (state.game) {
    case 'connect4': {
      renderConnect4View(
        snapshot,
        state,
        (column) => {
          logger.debug({ roomId, column }, 'sending connect4 move')
          send({
            type: 'game_move',
            roomId,
            gameSessionId: state.gameSessionId,
            move: { game: 'connect4', column },
          })
        },
        rematchSenders(roomId, state.gameSessionId, send),
        () => {
          logger.debug({ roomId }, 'dismiss_completed_game')
          send({ type: 'dismiss_completed_game', roomId })
        },
        () => {
          logger.debug({ roomId }, 'surrender connect4')
          send({ type: 'surrender', roomId, gameSessionId: state.gameSessionId })
        },
        myPlayerId,
        recapForSession
      )
      break
    }
    case 'tic_tac_toe': {
      renderTicTacToeView(
        snapshot,
        state,
        (row, col) => {
          logger.debug({ roomId, row, col }, 'sending tic-tac-toe move')
          send({
            type: 'game_move',
            roomId,
            gameSessionId: state.gameSessionId,
            move: { game: 'tic_tac_toe', row, col },
          })
        },
        rematchSenders(roomId, state.gameSessionId, send),
        () => send({ type: 'dismiss_completed_game', roomId }),
        () => send({ type: 'surrender', roomId, gameSessionId: state.gameSessionId }),
        myPlayerId,
        recapForSession
      )
      break
    }
    case 'rock_paper_scissors': {
      renderRockPaperScissorsView(
        snapshot,
        state,
        (thrown) => {
          logger.debug({ roomId, thrown }, 'sending rps move')
          send({
            type: 'game_move',
            roomId,
            gameSessionId: state.gameSessionId,
            move: { game: 'rock_paper_scissors', throw: thrown },
          })
        },
        rematchSenders(roomId, state.gameSessionId, send),
        () => send({ type: 'dismiss_completed_game', roomId }),
        () => send({ type: 'surrender', roomId, gameSessionId: state.gameSessionId }),
        myPlayerId,
        recapForSession
      )
      break
    }
    default: {
      const _never: never = state
      void _never
    }
  }
}

function rematchSenders(roomId: string, gameSessionId: string, send: (msg: ClientMessage) => void) {
  return {
    offer: () => send({ type: 'rematch_offer', roomId, gameSessionId }),
    accept: () => send({ type: 'rematch_accept', roomId, gameSessionId }),
    decline: () => send({ type: 'rematch_decline', roomId, gameSessionId }),
    cancel: () => send({ type: 'rematch_cancel', roomId, gameSessionId }),
  }
}

export type PickerCardMeta = {
  kind: GameKind
  accent: string
  icon: string
  title: string
  blurb: string
  renderArt: () => TemplateResult
}

const c4Art = () => html`
  <div class="flex gap-0.5" aria-hidden="true">
    ${[0, 1, 2, 3, 4, 5, 6].map(
      () => html`
        <div class="flex flex-col gap-0.5">
          ${[0, 1, 2].map(
            () =>
              html`<span
                class="block h-1.5 w-1.5 rounded-full bg-zinc-200 group-hover:bg-red-200/80"
              ></span>`
          )}
        </div>
      `
    )}
  </div>
`

const tttArt = () => html`
  <div class="grid grid-cols-3 gap-px rounded bg-zinc-300 p-px shadow-inner" aria-hidden="true">
    ${['X', 'O', 'X', 'O', 'X', 'O', 'X', 'O', 'X'].map(
      (m) =>
        html`<span
          class="${m === 'X'
            ? 'text-red-600'
            : 'text-blue-600'} flex h-3 w-3 items-center justify-center bg-white text-[7px] font-bold"
          >${m}</span
        >`
    )}
  </div>
`

const rpsArt = () => html`<span class="text-xl tracking-tight" aria-hidden="true">✊ ✋ ✌️</span>`

/** Metadata for the host game picker — add a row here when you add a `GameKind`. */
export const TABLE_GAME_PICKER_CARDS: readonly PickerCardMeta[] = [
  {
    kind: 'connect4',
    accent:
      'border-red-200/90 bg-gradient-to-br from-white to-red-50/50 hover:border-red-400 focus-visible:ring-red-400/80',
    icon: '⚫',
    title: 'Connect 4',
    blurb: 'Classic gravity drops — first four in a row wins.',
    renderArt: c4Art,
  },
  {
    kind: 'tic_tac_toe',
    accent:
      'border-sky-200/90 bg-gradient-to-br from-white to-sky-50/50 hover:border-sky-400 focus-visible:ring-sky-400/80',
    icon: '▦',
    title: 'Tic-tac-toe',
    blurb: 'Quick Xs and Os — three in a row on a tight board.',
    renderArt: tttArt,
  },
  {
    kind: 'rock_paper_scissors',
    accent:
      'border-emerald-200/90 bg-gradient-to-br from-white to-emerald-50/50 hover:border-emerald-400 focus-visible:ring-emerald-400/80',
    icon: '✦',
    title: 'Rock paper scissors',
    blurb: 'Hidden throws until both ready — race to the match.',
    renderArt: rpsArt,
  },
]

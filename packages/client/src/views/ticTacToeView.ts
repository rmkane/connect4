import { type TemplateResult, html, nothing, render } from 'lit'

import type { PlayerId, RoomSnapshot, TicTacToeState } from '@gameroom/shared'

import { rulesDialogMarkup, rulesOpenButton } from '@/views/gameRulesDialog.js'
import { displayNameFor, markForPlayer, matchScoreFor } from '@/views/playerLabels.js'

const TTT_RULES_DIALOG_ID = 'ttt-rules-dialog'

function canPlay(
  state: TicTacToeState,
  myPlayerId: PlayerId | null,
  row: number,
  col: number
): boolean {
  if (state.status !== 'in_progress' || myPlayerId === null || state.currentTurn !== myPlayerId)
    return false
  return state.board[row][col] === null
}

function snapshotSeatsFilled(snapshot: RoomSnapshot): boolean {
  return Boolean(snapshot.seats.red && snapshot.seats.yellow)
}

function youBannerLine(
  snapshot: RoomSnapshot,
  state: TicTacToeState,
  myPlayerId: PlayerId | null
): string {
  if (myPlayerId === null) return 'You: spectating'
  const n = displayNameFor(snapshot, myPlayerId)
  const m = markForPlayer(state.players, myPlayerId)
  return m ? `You: ${n} (${m})` : `You: ${n}`
}

function turnBannerLine(
  state: TicTacToeState,
  snapshot: RoomSnapshot,
  myPlayerId: PlayerId | null
): string {
  if (state.status === 'abandoned') return 'Abandoned'
  if (state.status === 'completed') {
    const res = state.result
    if (!res) return 'Finished'
    if (res.reason === 'draw') return 'Result: draw'
    if (res.winner) {
      const wn = displayNameFor(snapshot, res.winner)
      if (myPlayerId && res.winner === myPlayerId) return 'Result: you won'
      if (myPlayerId && res.winner !== myPlayerId) return `Result: ${wn} won`
      return `Result: ${wn} won`
    }
    return 'Finished'
  }
  const who = displayNameFor(snapshot, state.currentTurn)
  const mark = markForPlayer(state.players, state.currentTurn)
  const m = mark ?? '?'
  if (myPlayerId === state.currentTurn) return `Turn: you (${m})`
  return `Turn: ${who} (${m})`
}

function cellContent(
  gamePlayers: readonly [PlayerId, PlayerId],
  cell: PlayerId | null
): TemplateResult {
  const m = cell ? markForPlayer(gamePlayers, cell) : null
  if (m === 'X') {
    return html`<span class="text-2xl font-bold tracking-tight text-red-700" aria-label="X"
      >X</span
    >`
  }
  if (m === 'O') {
    return html`<span class="text-2xl font-bold tracking-tight text-blue-700" aria-label="O"
      >O</span
    >`
  }
  return html`<span class="sr-only">empty</span>`
}

function boardTemplate(
  snapshot: RoomSnapshot,
  state: TicTacToeState,
  onCell: (row: number, col: number) => void,
  onPlayAgain: () => void,
  onChooseAnotherGame: () => void,
  onSurrender: () => void,
  myPlayerId: PlayerId | null
): TemplateResult {
  const showCompletedActions =
    state.status === 'completed' &&
    myPlayerId !== null &&
    snapshotSeatsFilled(snapshot) &&
    Boolean(snapshot.seats.red && snapshot.seats.yellow)
  const showSurrender = state.status === 'in_progress' && myPlayerId !== null
  const [xId, oId] = state.players

  const rows = state.board.map((row, ri) =>
    row.map((cell, ci) => {
      const playable = canPlay(state, myPlayerId, ri, ci)
      const mark = cell ? markForPlayer(state.players, cell) : null
      return html`
        <button
          type="button"
          class="box-border flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg border-2 border-zinc-400 bg-zinc-50 text-zinc-900 shadow-sm transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
          ?disabled=${!playable}
          title=${playable ? 'Place your mark' : cell ? 'Taken' : 'Not your turn or game over'}
          aria-label=${cell === null
            ? 'Empty cell'
            : mark === 'X'
              ? 'X'
              : mark === 'O'
                ? 'O'
                : 'Taken'}
          @click=${() => onCell(ri, ci)}
        >
          ${cellContent(state.players, cell)}
        </button>
      `
    })
  )

  const youLine = youBannerLine(snapshot, state, myPlayerId)
  const turnLine = turnBannerLine(state, snapshot, myPlayerId)
  const xScore = matchScoreFor(snapshot, xId)
  const oScore = matchScoreFor(snapshot, oId)

  const myMark = myPlayerId ? markForPlayer(state.players, myPlayerId) : null
  const seatNote =
    myMark && state.status === 'in_progress'
      ? html`<p class="text-xs text-zinc-600">You are playing <strong>${myMark}</strong>.</p>`
      : myPlayerId === null && state.status === 'in_progress'
        ? html`<p class="text-xs text-zinc-600">You are viewing without a seat in this game.</p>`
        : nothing

  const rulesBody = html`
    <div class="space-y-3">
      <p>
        On your turn, place <strong>X</strong> or <strong>O</strong> in an empty cell. First to get
        three in a row (row, column, or diagonal) wins.
      </p>
      <p class="text-xs text-zinc-500">
        Marks are assigned at random each game. <strong>O</strong> always moves first, then you
        alternate.
      </p>
      <div class="border-t border-zinc-200 pt-3 text-xs text-zinc-700">
        <p><span class="font-semibold text-red-700">X</span>: ${displayNameFor(snapshot, xId)}</p>
        <p class="mt-1">
          <span class="font-semibold text-blue-700">O</span>: ${displayNameFor(snapshot, oId)}
        </p>
      </div>
      ${seatNote}
    </div>
  `

  return html`
    <div
      class="mx-auto flex w-full max-w-full flex-col items-center gap-2 px-2 py-2 font-sans sm:px-3"
    >
      <div
        class="flex w-full max-w-[min(100%,28rem)] min-w-0 flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-[11px] text-zinc-800 shadow-sm sm:text-xs"
        aria-live="polite"
      >
        <span class="shrink-0 font-semibold tracking-tight text-zinc-900">Tic-tac-toe</span>
        <span class="hidden h-3 w-px shrink-0 bg-zinc-300 sm:block" aria-hidden="true"></span>
        <span class="min-w-0 truncate sm:max-w-[40%]" title=${youLine}>${youLine}</span>
        <span class="hidden h-3 w-px shrink-0 bg-zinc-300 md:block" aria-hidden="true"></span>
        <span class="min-w-0 flex-1 truncate text-zinc-700" title=${turnLine}>${turnLine}</span>
        <span
          class="ml-auto shrink-0 font-mono font-semibold text-zinc-900 tabular-nums sm:text-sm"
          title="Games won (X — O)"
        >
          <span class="text-red-700">${xScore}</span><span class="mx-0.5 text-zinc-400">—</span
          ><span class="text-blue-700">${oScore}</span>
        </span>
      </div>

      <div class="flex w-full max-w-[min(100%,28rem)] flex-wrap items-center justify-center gap-2">
        ${rulesOpenButton(TTT_RULES_DIALOG_ID)}
        ${showSurrender
          ? html`
              <button
                type="button"
                class="rounded-md border border-red-300 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-900 shadow-sm transition hover:bg-red-100 sm:text-sm"
                @click=${() => {
                  if (confirm('Surrender? Your opponent wins this game.')) onSurrender()
                }}
              >
                Surrender
              </button>
            `
          : nothing}
        ${showCompletedActions
          ? html`
              <button
                type="button"
                class="rounded-md bg-red-700 px-2.5 py-1 text-xs font-semibold text-white shadow-sm transition hover:bg-red-800 sm:text-sm"
                @click=${onPlayAgain}
              >
                Play again
              </button>
              <button
                type="button"
                class="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-900 shadow-sm transition hover:bg-zinc-50 sm:text-sm"
                @click=${onChooseAnotherGame}
              >
                New game
              </button>
            `
          : nothing}
      </div>

      <div class="flex shrink-0 flex-col items-center">
        <div
          class="grid w-max shrink-0 auto-rows-[2.5rem] grid-cols-3 gap-1"
          aria-label="Tic-tac-toe board"
        >
          ${rows.flat()}
        </div>
      </div>

      ${rulesDialogMarkup(TTT_RULES_DIALOG_ID, 'Tic-tac-toe — how to play', rulesBody)}
    </div>
  `
}

export function renderTicTacToeView(
  snapshot: RoomSnapshot,
  state: TicTacToeState,
  onCell: (row: number, col: number) => void,
  onPlayAgain: () => void,
  onChooseAnotherGame: () => void,
  onSurrender: () => void,
  myPlayerId: PlayerId | null
) {
  const container = document.getElementById('board')
  if (!container) return

  render(
    boardTemplate(
      snapshot,
      state,
      onCell,
      onPlayAgain,
      onChooseAnotherGame,
      onSurrender,
      myPlayerId
    ),
    container
  )
}

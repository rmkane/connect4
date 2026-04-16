import { type TemplateResult, html, nothing, render } from 'lit'

import type { PlayerId, RoomSnapshot, TicTacToeState } from '@gameroom/shared'

import { displayNameFor, markForPlayer, matchScoreFor } from '@/views/playerLabels.js'

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

function headline(state: TicTacToeState, snapshot: RoomSnapshot): string {
  switch (state.status) {
    case 'in_progress': {
      const mark = markForPlayer(state.players, state.currentTurn)
      const who = displayNameFor(snapshot, state.currentTurn)
      return `${who}'s turn — ${mark ?? '?'} to play`
    }
    case 'completed': {
      const res = state.result
      if (!res) return 'Game over'
      if (res.reason === 'draw') return 'Game over — draw'
      if (res.reason === 'surrender' && res.winner) {
        const wn = displayNameFor(snapshot, res.winner)
        return `Game over — ${wn} wins (opponent surrendered)`
      }
      if (res.winner) {
        const wn = displayNameFor(snapshot, res.winner)
        const m = markForPlayer(state.players, res.winner)
        return m ? `Game over — ${wn} (${m}) wins` : `Game over — ${wn} wins`
      }
      return 'Game over'
    }
    case 'abandoned':
      return 'Game abandoned'
  }
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

  const myMark = myPlayerId ? markForPlayer(state.players, myPlayerId) : null

  return html`
    <div
      class="mx-auto flex max-w-full flex-col gap-6 px-2 py-2 font-sans sm:px-4 sm:py-4 lg:flex-row lg:items-start lg:justify-center lg:gap-10"
    >
      <section
        class="w-full max-w-md min-w-0 shrink-0 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm lg:w-88"
        aria-live="polite"
      >
        <h2 class="text-lg font-semibold text-zinc-900">${headline(state, snapshot)}</h2>
        <p class="mt-2 text-xs font-medium tracking-wide text-zinc-500 uppercase">Tic-tac-toe</p>
        <p class="mt-1 text-xs text-zinc-500">
          X and O are assigned at random each game. O always moves first, then you alternate.
        </p>
        <div class="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <p>
            <span class="font-medium text-red-700">X</span>:
            <span class="text-zinc-700">${displayNameFor(snapshot, xId)}</span>
          </p>
          <p>
            <span class="font-medium text-blue-700">O</span>:
            <span class="text-zinc-700">${displayNameFor(snapshot, oId)}</span>
          </p>
        </div>
        <p class="mt-3 text-xs font-medium tracking-wide text-zinc-500 uppercase">Games won</p>
        <p class="mt-1 text-base font-semibold text-zinc-900 tabular-nums">
          <span class="text-red-700">X ${matchScoreFor(snapshot, xId)}</span>
          <span class="mx-1.5 font-normal text-zinc-400">—</span>
          <span class="text-blue-700">O ${matchScoreFor(snapshot, oId)}</span>
        </p>
        ${myMark
          ? html`<p class="mt-2 text-sm text-zinc-600">
              You are playing <strong>${myMark}</strong>.
            </p>`
          : myPlayerId === null && state.status === 'in_progress'
            ? html`<p class="mt-2 text-sm text-zinc-600">You are viewing (not seated).</p>`
            : nothing}
        ${showSurrender
          ? html`
              <button
                type="button"
                class="mt-4 w-full rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-900 shadow-sm transition hover:bg-red-100"
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
              <div class="mt-4 flex flex-col gap-2">
                <button
                  type="button"
                  class="w-full rounded-lg bg-red-700 px-3 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-red-800"
                  @click=${onPlayAgain}
                >
                  Play again
                </button>
                <button
                  type="button"
                  class="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 shadow-sm transition hover:bg-zinc-50"
                  @click=${onChooseAnotherGame}
                >
                  New game
                </button>
              </div>
            `
          : nothing}
      </section>

      <div class="flex shrink-0 flex-col items-center lg:items-start">
        <div
          class="grid w-max shrink-0 auto-rows-[2.5rem] grid-cols-3 gap-1"
          aria-label="Tic-tac-toe board"
        >
          ${rows.flat()}
        </div>
      </div>
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

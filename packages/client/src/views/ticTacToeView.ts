import { type TemplateResult, html, nothing, render } from 'lit'

import type { Color, RoomSnapshot, TicTacToeState } from '@connect4/shared'

/** Seat `red` opens as X; seat `yellow` as O (wire protocol only). */
function markForSeat(color: Color): 'X' | 'O' {
  return color === 'red' ? 'X' : 'O'
}

function seatColor(snapshot: RoomSnapshot, displayName: string): Color | null {
  if (snapshot.seats.red?.displayName === displayName) return 'red'
  if (snapshot.seats.yellow?.displayName === displayName) return 'yellow'
  return null
}

function snapshotSeatsFilled(snapshot: RoomSnapshot): boolean {
  return Boolean(snapshot.seats.red && snapshot.seats.yellow)
}

function canPlay(state: TicTacToeState, seat: Color | null, row: number, col: number): boolean {
  if (state.status !== 'in_progress' || seat === null || state.currentTurn !== seat) return false
  return state.board[row][col] === null
}

function headline(state: TicTacToeState, snapshot: RoomSnapshot): string {
  const xName = snapshot.seats.red?.displayName ?? '—'
  const oName = snapshot.seats.yellow?.displayName ?? '—'

  switch (state.status) {
    case 'in_progress': {
      const mark = markForSeat(state.currentTurn)
      const who = snapshot.seats[state.currentTurn]?.displayName ?? mark
      return `${who}'s turn — ${mark} to play`
    }
    case 'completed': {
      const res = state.result
      if (!res) return 'Game over'
      if (res.reason === 'draw') return 'Game over — draw'
      if (res.winner === 'red') return `Game over — ${xName} (X) wins`
      if (res.winner === 'yellow') return `Game over — ${oName} (O) wins`
      return 'Game over'
    }
    case 'abandoned':
      return 'Game abandoned'
  }
}

function cellContent(cell: Color | null): TemplateResult {
  if (cell === 'red') {
    return html`<span class="text-3xl font-bold tracking-tight text-red-700" aria-label="X"
      >X</span
    >`
  }
  if (cell === 'yellow') {
    return html`<span class="text-3xl font-bold tracking-tight text-blue-700" aria-label="O"
      >O</span
    >`
  }
  return html`<span class="sr-only">empty</span>`
}

function boardTemplate(
  snapshot: RoomSnapshot,
  state: TicTacToeState,
  onCell: (row: number, col: number) => void,
  onNewRound: () => void,
  myDisplayName: string
): TemplateResult {
  const seat = seatColor(snapshot, myDisplayName)
  const showNewRound =
    state.status === 'completed' && seat !== null && snapshotSeatsFilled(snapshot)

  const rows = state.board.map((row, ri) =>
    row.map((cell, ci) => {
      const playable = canPlay(state, seat, ri, ci)
      return html`
        <button
          type="button"
          class="flex h-16 w-16 shrink-0 cursor-pointer items-center justify-center rounded-lg border-2 border-zinc-400 bg-zinc-50 text-zinc-900 shadow-sm transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
          ?disabled=${!playable}
          title=${playable ? 'Place your mark' : cell ? 'Taken' : 'Not your turn or game over'}
          aria-label=${cell === null ? 'Empty cell' : cell === 'red' ? 'X' : 'O'}
          @click=${() => onCell(ri, ci)}
        >
          ${cellContent(cell)}
        </button>
      `
    })
  )

  const myMark = seat ? markForSeat(seat) : null

  return html`
    <div class="mx-auto flex w-max max-w-full flex-col gap-4 px-2 py-2 font-sans sm:px-4 sm:py-4">
      <section
        class="max-w-md rounded-lg border border-zinc-200 bg-white p-4 shadow-sm"
        aria-live="polite"
      >
        <h2 class="text-lg font-semibold text-zinc-900">${headline(state, snapshot)}</h2>
        <p class="mt-2 text-xs font-medium tracking-wide text-zinc-500 uppercase">Tic-tac-toe</p>
        <div class="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <p>
            <span class="font-medium text-red-700">X</span>:
            <span class="text-zinc-700">${snapshot.seats.red?.displayName ?? '—'}</span>
          </p>
          <p>
            <span class="font-medium text-blue-700">O</span>:
            <span class="text-zinc-700">${snapshot.seats.yellow?.displayName ?? '—'}</span>
          </p>
        </div>
        <p class="mt-3 text-xs font-medium tracking-wide text-zinc-500 uppercase">Games won</p>
        <p class="mt-1 text-base font-semibold text-zinc-900 tabular-nums">
          <span class="text-red-700">X ${snapshot.matchScores.red}</span>
          <span class="mx-1.5 font-normal text-zinc-400">—</span>
          <span class="text-blue-700">O ${snapshot.matchScores.yellow}</span>
        </p>
        ${myMark
          ? html`<p class="mt-2 text-sm text-zinc-600">
              You are playing <strong>${myMark}</strong>.
            </p>`
          : seat === null && state.status === 'in_progress'
            ? html`<p class="mt-2 text-sm text-zinc-600">You are viewing (not seated).</p>`
            : nothing}
        ${showNewRound
          ? html`
              <button
                type="button"
                class="mt-4 w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm font-semibold text-zinc-900 shadow-sm transition hover:bg-white"
                @click=${onNewRound}
              >
                New round
              </button>
            `
          : nothing}
      </section>

      <div class="grid w-max grid-cols-3 gap-2">${rows.flat()}</div>
    </div>
  `
}

export function renderTicTacToeView(
  snapshot: RoomSnapshot,
  state: TicTacToeState,
  onCell: (row: number, col: number) => void,
  onNewRound: () => void,
  myDisplayName: string
) {
  const container = document.getElementById('board')
  if (!container) return

  render(boardTemplate(snapshot, state, onCell, onNewRound, myDisplayName), container)
}

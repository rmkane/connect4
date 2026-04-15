import { type TemplateResult, html, nothing, render } from 'lit'

import type { Color, Connect4State, RoomSnapshot } from '@connect4/shared'

function seatColor(snapshot: RoomSnapshot, displayName: string): Color | null {
  if (snapshot.seats.red?.displayName === displayName) return 'red'
  if (snapshot.seats.yellow?.displayName === displayName) return 'yellow'
  return null
}

function canDrop(state: Connect4State, seat: Color | null): boolean {
  return state.status === 'in_progress' && seat !== null && state.currentTurn === seat
}

function snapshotSeatsFilled(snapshot: RoomSnapshot): boolean {
  return Boolean(snapshot.seats.red && snapshot.seats.yellow)
}

function dropTitle(state: Connect4State, seat: Color | null, snapshot: RoomSnapshot): string {
  if (state.status !== 'in_progress') return 'Game is not in progress'
  if (seat === null) return 'You are not seated in this room'
  if (state.currentTurn !== seat) {
    const who = snapshot.seats[state.currentTurn]?.displayName ?? state.currentTurn
    return `Wait for ${who}'s move`
  }
  return 'Drop a piece in this column'
}

function headline(state: Connect4State, snapshot: RoomSnapshot): string {
  const r = snapshot.seats.red?.displayName ?? '—'
  const y = snapshot.seats.yellow?.displayName ?? '—'

  switch (state.status) {
    case 'in_progress': {
      const who = snapshot.seats[state.currentTurn]?.displayName ?? state.currentTurn
      const side = state.currentTurn === 'red' ? 'Red' : 'Yellow'
      return `${who}'s turn — ${side} to move`
    }
    case 'completed': {
      const res = state.result
      if (!res) return 'Game over'
      if (res.reason === 'draw') return 'Game over — draw'
      if (res.winner === 'red') return `Game over — ${r} (red) wins`
      if (res.winner === 'yellow') return `Game over — ${y} (yellow) wins`
      return 'Game over'
    }
    case 'abandoned':
      return 'Game abandoned'
  }
}

function detailLine(
  state: Connect4State,
  snapshot: RoomSnapshot,
  seat: Color | null
): string | null {
  if (seat) {
    const side = seat === 'red' ? 'Red' : 'Yellow'
    const bits: string[] = [`Your pieces: ${side}`]
    if (state.status === 'completed' && state.result && state.result.reason !== 'draw') {
      bits.push(`Reason: ${state.result.reason.replace(/_/g, ' ')}`)
    }
    return bits.join(' · ')
  }
  if (state.status === 'in_progress') {
    return 'You are viewing this room (not seated as Red or Yellow).'
  }
  return null
}

function boardTemplate(
  snapshot: RoomSnapshot,
  state: Connect4State,
  onDrop: (col: number) => void,
  onNewRound: () => void,
  myDisplayName: string
): TemplateResult {
  const seat = seatColor(snapshot, myDisplayName)
  const allowDrop = canDrop(state, seat)
  const showNewRound =
    state.status === 'completed' &&
    seat !== null &&
    snapshotSeatsFilled(snapshot) &&
    Boolean(snapshot.seats.red && snapshot.seats.yellow)
  const showDropRow = state.status === 'in_progress'
  const cols = state.board[0].length

  const dropButtons = Array.from({ length: cols }, (_, c) => {
    return html`
      <button
        type="button"
        class="h-8 w-10 cursor-pointer rounded-md border border-zinc-300 bg-white text-sm shadow-sm hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
        ?disabled=${!allowDrop}
        title=${dropTitle(state, seat, snapshot)}
        @click=${() => onDrop(c)}
      >
        ↓
      </button>
    `
  })

  const cells = state.board.flatMap((row) =>
    row.map((cell) => {
      const shade = cell ?? 'empty'
      return html`<div class="cell ${shade} h-10 w-10 shrink-0"></div>`
    })
  )

  const detail = detailLine(state, snapshot, seat)

  return html`
    <div class="mx-auto flex w-max max-w-full flex-col gap-4 px-2 py-2 font-sans sm:px-4 sm:py-4">
      <section
        class="max-w-md rounded-lg border border-zinc-200 bg-white p-4 shadow-sm"
        aria-live="polite"
      >
        <h2 class="text-lg font-semibold text-zinc-900">${headline(state, snapshot)}</h2>
        <p class="mt-2 text-xs font-medium tracking-wide text-zinc-500 uppercase">Connect 4</p>
        <div class="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <p>
            <span class="font-medium text-red-700">Red</span>:
            <span class="text-zinc-700">${snapshot.seats.red?.displayName ?? '—'}</span>
          </p>
          <p>
            <span class="font-medium text-amber-700">Yellow</span>:
            <span class="text-zinc-700">${snapshot.seats.yellow?.displayName ?? '—'}</span>
          </p>
        </div>
        <p class="mt-3 text-xs font-medium tracking-wide text-zinc-500 uppercase">Games won</p>
        <p class="mt-1 text-base font-semibold text-zinc-900 tabular-nums">
          <span class="text-red-700">${snapshot.matchScores.red}</span>
          <span class="mx-1.5 font-normal text-zinc-400">—</span>
          <span class="text-amber-700">${snapshot.matchScores.yellow}</span>
        </p>
        ${detail ? html`<p class="mt-2 text-sm text-zinc-600">${detail}</p>` : null}
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

      <div class="flex flex-col gap-2">
        ${showDropRow ? html`<div class="mb-1 flex gap-1">${dropButtons}</div>` : nothing}
        <div class="grid auto-rows-[2.5rem] grid-cols-7 gap-1">${cells}</div>
      </div>
    </div>
  `
}

export function renderConnect4View(
  snapshot: RoomSnapshot,
  state: Connect4State,
  onDrop: (col: number) => void,
  onNewRound: () => void,
  myDisplayName: string
) {
  const container = document.getElementById('board')
  if (!container) return

  render(boardTemplate(snapshot, state, onDrop, onNewRound, myDisplayName), container)
}

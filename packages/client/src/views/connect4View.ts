import { type TemplateResult, html, nothing, render } from 'lit'

import type { Connect4State, PlayerId, RoomSnapshot } from '@gameroom/shared'

import {
  connect4GameSide,
  displayNameFor,
  matchScoreFor,
  pieceCellClass,
} from '@/views/playerLabels.js'

function canDrop(state: Connect4State, myPlayerId: PlayerId | null): boolean {
  return state.status === 'in_progress' && myPlayerId !== null && state.currentTurn === myPlayerId
}

function snapshotSeatsFilled(snapshot: RoomSnapshot): boolean {
  return Boolean(snapshot.seats.red && snapshot.seats.yellow)
}

function dropTitle(
  state: Connect4State,
  myPlayerId: PlayerId | null,
  snapshot: RoomSnapshot
): string {
  if (state.status !== 'in_progress') return 'Game is not in progress'
  if (myPlayerId === null) return 'You are not seated in this room'
  if (state.currentTurn !== myPlayerId) {
    const who = displayNameFor(snapshot, state.currentTurn)
    return `Wait for ${who}'s move`
  }
  return 'Drop a piece in this column'
}

function pieceSideLabel(state: Connect4State, playerId: PlayerId): 'Red' | 'Yellow' | '—' {
  if (state.players[0] === playerId) return 'Red'
  if (state.players[1] === playerId) return 'Yellow'
  return '—'
}

function headline(state: Connect4State, snapshot: RoomSnapshot): string {
  switch (state.status) {
    case 'in_progress': {
      const who = displayNameFor(snapshot, state.currentTurn)
      const side = pieceSideLabel(state, state.currentTurn)
      return `${who}'s turn — ${side} to move`
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
        const side = pieceSideLabel(state, res.winner)
        return side !== '—' ? `Game over — ${wn} (${side}) wins` : `Game over — ${wn} wins`
      }
      return 'Game over'
    }
    case 'abandoned':
      return 'Game abandoned'
  }
}

function detailLine(
  state: Connect4State,
  snapshot: RoomSnapshot,
  myPlayerId: PlayerId | null
): string | null {
  const side = connect4GameSide(state.players, myPlayerId)
  if (side) {
    const label = side === 'red' ? 'Red' : 'Yellow'
    const bits: string[] = [`Your pieces: ${label}`]
    if (state.status === 'completed' && state.result && state.result.reason !== 'draw') {
      if (state.result.reason === 'surrender') {
        bits.push(
          state.result.winner === myPlayerId
            ? 'Result: opponent surrendered'
            : 'Result: you surrendered'
        )
      } else {
        bits.push(`Reason: ${state.result.reason.replace(/_/g, ' ')}`)
      }
    }
    return bits.join(' · ')
  }
  if (state.status === 'in_progress') {
    return 'You are viewing this room (not seated in this game).'
  }
  return null
}

function boardTemplate(
  snapshot: RoomSnapshot,
  state: Connect4State,
  onDrop: (col: number) => void,
  onPlayAgain: () => void,
  onChooseAnotherGame: () => void,
  onSurrender: () => void,
  myPlayerId: PlayerId | null
): TemplateResult {
  const allowDrop = canDrop(state, myPlayerId)
  const showCompletedActions =
    state.status === 'completed' &&
    myPlayerId !== null &&
    snapshotSeatsFilled(snapshot) &&
    Boolean(snapshot.seats.red && snapshot.seats.yellow)
  const showSurrender = state.status === 'in_progress' && myPlayerId !== null
  const showDropRow = state.status === 'in_progress'
  const cols = state.board[0].length
  const [redId, yellowId] = state.players

  /** One 7-column grid: drop row uses the same tracks as piece cells so arrows line up. */
  const dropRow = showDropRow
    ? Array.from({ length: cols }, (_, c) => {
        return html`
          <button
            type="button"
            class="box-border flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-md border border-zinc-300 bg-white text-sm font-semibold shadow-sm hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
            ?disabled=${!allowDrop}
            title=${dropTitle(state, myPlayerId, snapshot)}
            @click=${() => onDrop(c)}
          >
            ↓
          </button>
        `
      })
    : []

  const pieceCells = state.board.flatMap((row) =>
    row.map((cell) => {
      const shade = pieceCellClass(state.players, cell)
      return html`<div
        class="cell ${shade} box-border h-10 w-10 shrink-0"
        aria-hidden="true"
      ></div>`
    })
  )

  const gridCells = [...dropRow, ...pieceCells]

  const detail = detailLine(state, snapshot, myPlayerId)

  return html`
    <div
      class="mx-auto flex max-w-full flex-col gap-6 px-2 py-2 font-sans sm:px-4 sm:py-4 lg:flex-row lg:items-start lg:justify-center lg:gap-10"
    >
      <section
        class="w-full max-w-md min-w-0 shrink-0 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm lg:w-[22rem]"
        aria-live="polite"
      >
        <h2 class="text-lg font-semibold text-zinc-900">${headline(state, snapshot)}</h2>
        <p class="mt-2 text-xs font-medium tracking-wide text-zinc-500 uppercase">Connect 4</p>
        <p class="mt-1 text-xs text-zinc-500">
          Red and yellow pieces are assigned at random each game; who drops first is also random.
        </p>
        <div class="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <p>
            <span class="font-medium text-red-700">Red</span>:
            <span class="text-zinc-700">${displayNameFor(snapshot, redId)}</span>
          </p>
          <p>
            <span class="font-medium text-amber-700">Yellow</span>:
            <span class="text-zinc-700">${displayNameFor(snapshot, yellowId)}</span>
          </p>
        </div>
        <p class="mt-3 text-xs font-medium tracking-wide text-zinc-500 uppercase">Games won</p>
        <p class="mt-1 text-base font-semibold text-zinc-900 tabular-nums">
          <span class="text-red-700">${matchScoreFor(snapshot, redId)}</span>
          <span class="mx-1.5 font-normal text-zinc-400">—</span>
          <span class="text-amber-700">${matchScoreFor(snapshot, yellowId)}</span>
        </p>
        ${detail ? html`<p class="mt-2 text-sm text-zinc-600">${detail}</p>` : null}
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
          class="grid w-max shrink-0 [grid-auto-rows:2.5rem] grid-cols-7 gap-1"
          aria-label="Connect 4 board"
        >
          ${gridCells}
        </div>
      </div>
    </div>
  `
}

export function renderConnect4View(
  snapshot: RoomSnapshot,
  state: Connect4State,
  onDrop: (col: number) => void,
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
      onDrop,
      onPlayAgain,
      onChooseAnotherGame,
      onSurrender,
      myPlayerId
    ),
    container
  )
}

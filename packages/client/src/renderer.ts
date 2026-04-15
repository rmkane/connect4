import { type TemplateResult, html, render } from 'lit'

import type { Color, GameState } from '@connect4/shared'

/** Map this browser's display name to a seat color, if seated. */
function seatColor(state: GameState, displayName: string): Color | null {
  if (state.players.red?.displayName === displayName) return 'red'
  if (state.players.yellow?.displayName === displayName) return 'yellow'
  return null
}

function canDrop(state: GameState, seat: Color | null): boolean {
  return state.status === 'in_progress' && seat !== null && state.currentTurn === seat
}

function dropTitle(state: GameState, seat: Color | null): string {
  if (state.status !== 'in_progress') return 'Game is not in progress'
  if (seat === null) return 'You are not seated in this game'
  if (state.currentTurn !== seat)
    return `Wait for ${state.players[state.currentTurn]?.displayName ?? state.currentTurn}'s move`
  return 'Drop a piece in this column'
}

/** Primary status line from `GameState` (turn, result, waiting). */
function headline(state: GameState): string {
  const r = state.players.red?.displayName ?? '—'
  const y = state.players.yellow?.displayName ?? '—'

  switch (state.status) {
    case 'waiting': {
      const hasR = Boolean(state.players.red)
      const hasY = Boolean(state.players.yellow)
      if (!hasR && !hasY) return 'Waiting for players to join'
      if (hasR && !hasY) return `Waiting for yellow — ${r} is ready (red)`
      if (!hasR && hasY) return `Waiting for red — ${y} is ready (yellow)`
      return 'Starting…'
    }
    case 'in_progress': {
      const who = state.players[state.currentTurn]?.displayName ?? state.currentTurn
      return `${who}'s turn (${state.currentTurn})`
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

/** Extra context: your seat, result reason. */
function detailLine(state: GameState, seat: Color | null): string | null {
  if (seat) {
    const bits: string[] = [`You are playing as ${seat}`]
    if (state.status === 'completed' && state.result && state.result.reason !== 'draw') {
      bits.push(`Reason: ${state.result.reason.replace(/_/g, ' ')}`)
    }
    return bits.join(' · ')
  }
  if (state.status === 'waiting' || state.status === 'in_progress') {
    return 'You are viewing this room (not seated as red or yellow).'
  }
  return null
}

/** Declarative view: status + board + column controls. */
function boardTemplate(
  state: GameState,
  onDrop: (col: number) => void,
  myDisplayName: string
): TemplateResult {
  const seat = seatColor(state, myDisplayName)
  const allowDrop = canDrop(state, seat)
  const cols = state.board[0].length

  const dropButtons = Array.from({ length: cols }, (_, c) => {
    return html`
      <button
        type="button"
        class="h-8 w-10 cursor-pointer rounded-md border border-zinc-300 bg-white text-sm shadow-sm hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
        ?disabled=${!allowDrop}
        title=${dropTitle(state, seat)}
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

  const detail = detailLine(state, seat)

  return html`
    <div class="mx-auto flex w-max max-w-full flex-col gap-4 px-2 py-2 font-sans sm:px-4 sm:py-4">
      <section
        class="max-w-md rounded-lg border border-zinc-200 bg-white p-4 shadow-sm"
        aria-live="polite"
      >
        <h2 class="text-lg font-semibold text-zinc-900">${headline(state)}</h2>
        <div class="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <p>
            <span class="font-medium text-red-700">Red</span>:
            <span class="text-zinc-700">${state.players.red?.displayName ?? '—'}</span>
          </p>
          <p>
            <span class="font-medium text-amber-700">Yellow</span>:
            <span class="text-zinc-700">${state.players.yellow?.displayName ?? '—'}</span>
          </p>
        </div>
        ${detail ? html`<p class="mt-2 text-sm text-zinc-600">${detail}</p>` : null}
      </section>

      <div class="flex flex-col gap-2">
        <div class="mb-1 flex gap-1">${dropButtons}</div>
        <div class="grid auto-rows-[2.5rem] grid-cols-7 gap-1">${cells}</div>
      </div>
    </div>
  `
}

export function renderBoard(
  state: GameState,
  onDrop: (col: number) => void,
  myDisplayName: string
) {
  const container = document.getElementById('board')
  if (!container) return

  render(boardTemplate(state, onDrop, myDisplayName), container)
}

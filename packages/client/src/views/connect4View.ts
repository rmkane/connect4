import { type TemplateResult, html, nothing, render } from 'lit'

import type { Connect4State, PlayerId, RoomSnapshot } from '@gameroom/shared'

import { confirmModal, infoModal, modalOpenButton, openModalById } from '@/views/appModal.js'
import {
  connect4GameSide,
  displayNameFor,
  matchScoreFor,
  pieceCellClass,
} from '@/views/playerLabels.js'

const C4_RULES_DIALOG_ID = 'c4-rules-dialog'
const C4_SURRENDER_DIALOG_ID = 'c4-surrender-dialog'

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

function youBannerLine(
  snapshot: RoomSnapshot,
  state: Connect4State,
  myPlayerId: PlayerId | null
): string {
  if (myPlayerId === null) return 'You: spectating'
  const n = displayNameFor(snapshot, myPlayerId)
  const side = connect4GameSide(state.players, myPlayerId)
  if (!side) return `You: ${n}`
  return `You: ${n} (${side === 'red' ? 'Red' : 'Yellow'})`
}

function turnBannerLine(
  state: Connect4State,
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
  const side = pieceSideLabel(state, state.currentTurn)
  if (myPlayerId === state.currentTurn) return `Turn: you (${side})`
  return `Turn: ${who} (${side})`
}

function detailLine(
  state: Connect4State,
  snapshot: RoomSnapshot,
  myPlayerId: PlayerId | null
): string | null {
  const side = connect4GameSide(state.players, myPlayerId)
  if (side) {
    const label = side === 'red' ? 'Red' : 'Yellow'
    const bits: string[] = [`Your color: ${label}.`]
    if (state.status === 'completed' && state.result && state.result.reason !== 'draw') {
      if (state.result.reason === 'surrender') {
        bits.push(
          state.result.winner === myPlayerId
            ? 'Opponent surrendered.'
            : 'You surrendered this game.'
        )
      } else {
        bits.push(`Outcome: ${state.result.reason.replace(/_/g, ' ')}.`)
      }
    }
    return bits.join(' ')
  }
  if (state.status === 'in_progress') {
    return 'You are viewing this room without a seat in this game.'
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
  const youLine = youBannerLine(snapshot, state, myPlayerId)
  const turnLine = turnBannerLine(state, snapshot, myPlayerId)
  const rScore = matchScoreFor(snapshot, redId)
  const yScore = matchScoreFor(snapshot, yellowId)

  const rulesBody = html`
    <div class="space-y-3">
      <p>
        Take turns dropping discs into the columns; pieces stack from the bottom. The first player
        to connect <strong>four in a row</strong> horizontally, vertically, or diagonally wins.
      </p>
      <p class="text-xs text-zinc-500">
        Red and yellow are assigned at random each game. Who moves first is random too.
      </p>
      <div class="border-t border-zinc-200 pt-3 text-xs text-zinc-700">
        <p>
          <span class="font-semibold text-red-700">Red</span>: ${displayNameFor(snapshot, redId)}
        </p>
        <p class="mt-1">
          <span class="font-semibold text-amber-700">Yellow</span>:
          ${displayNameFor(snapshot, yellowId)}
        </p>
      </div>
      ${detail
        ? html`<p class="border-t border-zinc-200 pt-3 text-xs text-zinc-600">${detail}</p>`
        : nothing}
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
        <span class="shrink-0 font-semibold tracking-tight text-zinc-900">Connect 4</span>
        <span class="hidden h-3 w-px shrink-0 bg-zinc-300 sm:block" aria-hidden="true"></span>
        <span class="min-w-0 truncate sm:max-w-[40%]" title=${youLine}>${youLine}</span>
        <span class="hidden h-3 w-px shrink-0 bg-zinc-300 md:block" aria-hidden="true"></span>
        <span class="min-w-0 flex-1 truncate text-zinc-700" title=${turnLine}>${turnLine}</span>
        <span
          class="ml-auto shrink-0 font-mono font-semibold text-zinc-900 tabular-nums sm:text-sm"
          title="Games won (red — yellow)"
        >
          <span class="text-red-700">${rScore}</span><span class="mx-0.5 text-zinc-400">—</span
          ><span class="text-amber-700">${yScore}</span>
        </span>
      </div>

      <div class="flex w-full max-w-[min(100%,28rem)] flex-wrap items-center justify-center gap-2">
        ${modalOpenButton(C4_RULES_DIALOG_ID, 'Rules')}
        ${showSurrender
          ? html`
              <button
                type="button"
                class="rounded-md border border-red-300 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-900 shadow-sm transition hover:bg-red-100 sm:text-sm"
                @click=${() => openModalById(C4_SURRENDER_DIALOG_ID)}
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
          class="grid w-max shrink-0 auto-rows-[2.5rem] grid-cols-7 gap-1"
          aria-label="Connect 4 board"
        >
          ${gridCells}
        </div>
      </div>

      ${infoModal(C4_RULES_DIALOG_ID, 'Connect 4 — how to play', rulesBody)}
      ${showSurrender
        ? confirmModal(
            C4_SURRENDER_DIALOG_ID,
            'Surrender this game?',
            html`
              <p>
                Your opponent will win this match immediately. This cannot be undone for the current
                game.
              </p>
            `,
            {
              confirmLabel: 'Surrender',
              cancelLabel: 'Keep playing',
              danger: true,
              onConfirm: () => onSurrender(),
            }
          )
        : nothing}
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

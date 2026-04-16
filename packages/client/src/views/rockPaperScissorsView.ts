import { type TemplateResult, html, nothing, render } from 'lit'

import type { PlayerId, RockPaperScissorsState, RoomSnapshot, RpsThrow } from '@gameroom/shared'
import { roomTableIsFull } from '@gameroom/shared'

import { confirmModal, infoModal, modalOpenButton, openModalById } from '@/views/appModal.js'
import { connect4RosterSlot, displayNameFor, matchScoreFor } from '@/views/playerLabels.js'
import type { RematchControls } from '@/views/rematchControls.js'

const RPS_RULES_DIALOG_ID = 'rps-rules-dialog'
const RPS_SURRENDER_DIALOG_ID = 'rps-surrender-dialog'

function throwEmoji(t: RpsThrow): string {
  if (t === 'rock') return '✊'
  if (t === 'paper') return '✋'
  return '✌️'
}

function throwLabel(t: RpsThrow): string {
  if (t === 'rock') return 'Rock'
  if (t === 'paper') return 'Paper'
  return 'Scissors'
}

function throwCell(slotIdx: 0 | 1, state: RockPaperScissorsState): TemplateResult {
  const t = state.roundThrows[slotIdx]
  const locked = state.seatCommittedThisRound[slotIdx]
  if (t) {
    return html`
      <p class="mt-1 text-2xl" aria-label=${throwLabel(t)}>${throwEmoji(t)}</p>
      <p class="mt-0.5 text-[10px] text-zinc-500">${throwLabel(t)}</p>
    `
  }
  if (locked) {
    return html`
      <p class="mt-1 text-sm font-semibold tracking-wide text-zinc-600" aria-label="Locked in">
        Ready
      </p>
      <p class="mt-0.5 text-[10px] text-zinc-500">Hidden until both throw</p>
    `
  }
  return html`
    <p class="mt-1 text-2xl text-zinc-400" aria-label="Not yet thrown">—</p>
    <p class="mt-0.5 text-[10px] text-zinc-500">Waiting</p>
  `
}

function lastResolvedPanel(
  snapshot: RoomSnapshot,
  state: RockPaperScissorsState
): TemplateResult | typeof nothing {
  const lr = state.lastResolvedHand
  if (!lr) {
    return nothing
  }
  const [a, b] = lr.throws
  const n0 = displayNameFor(snapshot, state.players[0])
  const n1 = displayNameFor(snapshot, state.players[1])
  const outcome =
    lr.winnerSeat === null
      ? html`<p class="mt-2 text-sm font-medium text-zinc-700">
          This hand is a tie — no point toward the match.
        </p>`
      : html`<p class="mt-2 text-sm font-medium text-zinc-700">
          <span class="font-semibold text-zinc-900"
            >${displayNameFor(snapshot, state.players[lr.winnerSeat])}</span
          >
          wins the hand (+1 toward the match).
        </p>`
  return html`
    <div
      class="w-full max-w-[min(100%,28rem)] rounded-lg border border-emerald-200 bg-emerald-50/60 px-4 py-3 text-center shadow-sm"
      role="status"
    >
      <p class="text-xs font-semibold tracking-wide text-emerald-900 uppercase">Last hand</p>
      <p class="mt-1 text-lg text-zinc-900">
        <span aria-label=${throwLabel(a)}>${throwEmoji(a)}</span>
        <span class="mx-2 text-zinc-400">vs</span>
        <span aria-label=${throwLabel(b)}>${throwEmoji(b)}</span>
      </p>
      <p class="text-xs text-zinc-600">${n0} · ${n1}</p>
      ${outcome}
    </div>
  `
}

function matchSettledBanner(
  snapshot: RoomSnapshot,
  state: RockPaperScissorsState,
  myPlayerId: PlayerId | null
): TemplateResult {
  const res = state.result
  if (!res?.winner) {
    return html`<p class="text-center text-base font-semibold text-zinc-800">Match finished.</p>`
  }
  const w = res.winner
  const wn = displayNameFor(snapshot, w)
  if (myPlayerId === w) {
    return html`<p class="text-center text-lg font-semibold text-emerald-800">
      You won the match.
    </p>`
  }
  if (myPlayerId !== null) {
    return html`<p class="text-center text-lg font-semibold text-zinc-800">${wn} won the match.</p>`
  }
  return html`<p class="text-center text-lg font-semibold text-zinc-800">${wn} won the match.</p>`
}

/** Room-level match wins (same table as other games). */
function rpsRoomMatchBanner(
  snapshot: RoomSnapshot,
  p0: PlayerId,
  p1: PlayerId,
  myPlayerId: PlayerId | null
): TemplateResult {
  const s0 = matchScoreFor(snapshot, p0)
  const s1 = matchScoreFor(snapshot, p1)
  const n0 = displayNameFor(snapshot, p0)
  const n1 = displayNameFor(snapshot, p1)

  const pill = (label: string, score: number, variant: 0 | 1) => {
    const ring =
      variant === 0
        ? 'border-amber-200 ring-1 ring-amber-100'
        : 'border-violet-200 ring-1 ring-violet-100'
    const num = variant === 0 ? 'text-amber-800' : 'text-violet-800'
    return html`
      <div
        class="${ring} flex min-w-0 flex-1 flex-col items-center rounded-md border bg-white px-2 py-1 text-center shadow-sm"
      >
        <span class="text-[10px] font-semibold tracking-wide text-zinc-500 uppercase"
          >${label}</span
        >
        <span class="${num} mt-0.5 text-lg leading-none font-bold tabular-nums">${score}</span>
      </div>
    `
  }

  if (myPlayerId === p0) {
    return html`
      <div
        class="ml-auto flex max-w-52 min-w-0 shrink-0 items-stretch gap-1.5 sm:max-w-60"
        role="status"
        aria-label=${`Table match wins: you ${s0}, ${n1} ${s1}`}
      >
        ${pill('You', s0, 0)}
        <span class="self-center text-[10px] font-semibold text-zinc-400" aria-hidden="true"
          >vs</span
        >
        ${pill('Opp', s1, 1)}
      </div>
    `
  }
  if (myPlayerId === p1) {
    return html`
      <div
        class="ml-auto flex max-w-52 min-w-0 shrink-0 items-stretch gap-1.5 sm:max-w-60"
        role="status"
        aria-label=${`Table match wins: you ${s1}, ${n0} ${s0}`}
      >
        ${pill('You', s1, 1)}
        <span class="self-center text-[10px] font-semibold text-zinc-400" aria-hidden="true"
          >vs</span
        >
        ${pill('Opp', s0, 0)}
      </div>
    `
  }
  return html`
    <div
      class="ml-auto flex max-w-52 min-w-0 shrink-0 items-stretch gap-1.5 sm:max-w-60"
      role="status"
      aria-label=${`Table match wins: ${n0} ${s0}, ${n1} ${s1}`}
    >
      ${pill(n0, s0, 0)}
      <span class="self-center text-[10px] font-semibold text-zinc-400" aria-hidden="true">vs</span>
      ${pill(n1, s1, 1)}
    </div>
  `
}

function youBannerLine(snapshot: RoomSnapshot, myPlayerId: PlayerId | null): string {
  if (myPlayerId === null) return 'You: spectating'
  return `You: ${displayNameFor(snapshot, myPlayerId)}`
}

function turnBannerLine(
  state: RockPaperScissorsState,
  snapshot: RoomSnapshot,
  myPlayerId: PlayerId | null
): string {
  if (state.status === 'abandoned') return 'Abandoned'
  if (state.status === 'completed') {
    const res = state.result
    if (!res) return 'Finished'
    if (res.reason === 'surrender' && res.winner) {
      const wn = displayNameFor(snapshot, res.winner)
      if (myPlayerId && res.winner === myPlayerId) return 'Result: you won (surrender)'
      if (myPlayerId && res.winner !== myPlayerId) return `Result: ${wn} won (surrender)`
      return `Result: ${wn} won (surrender)`
    }
    if (res.winner) {
      const wn = displayNameFor(snapshot, res.winner)
      if (myPlayerId && res.winner === myPlayerId) return 'Result: you won the match'
      if (myPlayerId && res.winner !== myPlayerId) return `Result: ${wn} won the match`
      return `Result: ${wn} won the match`
    }
    return 'Finished'
  }
  const w = state.wins
  const handLine = `Match score (hands): ${w[0]}–${w[1]} · first to ${state.winsToWinMatch} wins the game`
  if (myPlayerId === null)
    return `${handLine}. Each game is several hands until someone wins the match.`
  const slot = connect4RosterSlot(state.players, myPlayerId)
  if (slot === null) return `${handLine}.`
  const sc = state.seatCommittedThisRound
  const oppSlot = slot === 0 ? 1 : 0
  const mineCommitted = sc[slot]
  const oppCommitted = sc[oppSlot]
  if (!mineCommitted && !oppCommitted) return `${handLine}. Choose your throw.`
  if (mineCommitted && !oppCommitted) return `${handLine}. You’re locked in — waiting for opponent.`
  if (!mineCommitted && oppCommitted)
    return `${handLine}. Opponent is locked in — choose your throw.`
  return `${handLine}.`
}

function boardTemplate(
  snapshot: RoomSnapshot,
  state: RockPaperScissorsState,
  onThrow: (t: RpsThrow) => void,
  rematch: RematchControls,
  onChooseAnotherGame: () => void,
  onSurrender: () => void,
  myPlayerId: PlayerId | null,
  recap: { show: boolean; onOpen: () => void } | null
): TemplateResult {
  const showCompletedActions =
    state.status === 'completed' && myPlayerId !== null && roomTableIsFull(snapshot.seats)
  const showRecapButton =
    state.status === 'completed' && recap !== null && recap.show && roomTableIsFull(snapshot.seats)
  const showSurrender = state.status === 'in_progress' && myPlayerId !== null
  const [p0, p1] = state.players

  const pr = snapshot.pendingRematch
  const rematchForThisGame = pr !== null && pr.gameSessionId === state.gameSessionId
  const imRematchRequester = Boolean(
    rematchForThisGame && myPlayerId !== null && pr!.requesterId === myPlayerId
  )
  const imRematchOpponent = Boolean(
    rematchForThisGame && myPlayerId !== null && pr!.requesterId !== myPlayerId
  )

  const newGameBtn = html`
    <button
      type="button"
      class="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-900 shadow-sm transition hover:bg-zinc-50 sm:text-sm"
      @click=${onChooseAnotherGame}
    >
      New game
    </button>
  `

  const slot = connect4RosterSlot(state.players, myPlayerId)
  const canPick =
    state.status === 'in_progress' && slot !== null && state.roundThrows[slot] === null
  const throws: RpsThrow[] = ['rock', 'paper', 'scissors']

  const throwPanel = html`
    <div class="flex w-full max-w-[min(100%,28rem)] flex-col items-center gap-3">
      <div class="grid w-full grid-cols-3 gap-2" aria-label="Rock paper scissors choices">
        ${throws.map(
          (t) => html`
            <button
              type="button"
              class="flex flex-col items-center justify-center rounded-xl border-2 border-zinc-300 bg-zinc-50 px-2 py-4 text-sm font-semibold text-zinc-900 shadow-sm transition hover:border-zinc-400 hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
              ?disabled=${!canPick}
              @click=${() => onThrow(t)}
            >
              <span class="text-3xl leading-none" aria-hidden="true">${throwEmoji(t)}</span>
              <span class="mt-2 text-xs">${throwLabel(t)}</span>
            </button>
          `
        )}
      </div>
      <div
        class="grid w-full grid-cols-2 gap-3 rounded-lg border border-zinc-200 bg-white px-3 py-3 text-center text-sm shadow-sm"
        aria-live="polite"
      >
        <div>
          <p class="text-[10px] font-semibold text-zinc-500 uppercase">
            ${displayNameFor(snapshot, p0)}
          </p>
          ${throwCell(0, state)}
        </div>
        <div>
          <p class="text-[10px] font-semibold text-zinc-500 uppercase">
            ${displayNameFor(snapshot, p1)}
          </p>
          ${throwCell(1, state)}
        </div>
      </div>
    </div>
  `

  const youLine = youBannerLine(snapshot, myPlayerId)
  const turnLine = turnBannerLine(state, snapshot, myPlayerId)

  const rulesBody = html`
    <div class="space-y-3">
      <p>
        One <strong>game</strong> here is a full match of several <strong>hands</strong> (rounds of
        rock–paper–scissors). Each hand is hidden until both players have locked in, then both
        throws are revealed together with who won that hand (or a tie).
      </p>
      <p>
        Win a hand with classic rules: rock beats scissors, scissors beats paper, paper beats rock.
        Tied hands replay with no point toward the match.
      </p>
      <p class="text-xs text-zinc-500">
        First player to win <strong>${state.winsToWinMatch}</strong> hands wins the game. The header
        pills are <strong>table</strong> wins across finished games at this table.
      </p>
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
        <span class="shrink-0 font-semibold tracking-tight text-zinc-900">RPS</span>
        <span class="hidden text-[10px] text-zinc-500 sm:inline" aria-hidden="true"
          >· best-of hands</span
        >
        <span class="hidden h-3 w-px shrink-0 bg-zinc-300 sm:block" aria-hidden="true"></span>
        <span class="min-w-0 truncate sm:max-w-[40%]" title=${youLine}>${youLine}</span>
        <span class="hidden h-3 w-px shrink-0 bg-zinc-300 md:block" aria-hidden="true"></span>
        <span class="min-w-0 flex-1 truncate text-zinc-700" title=${turnLine}>${turnLine}</span>
        ${rpsRoomMatchBanner(snapshot, p0, p1, myPlayerId)}
      </div>

      ${state.status === 'completed' ? matchSettledBanner(snapshot, state, myPlayerId) : nothing}
      ${lastResolvedPanel(snapshot, state)}

      <div class="flex w-full max-w-[min(100%,28rem)] flex-wrap items-center justify-center gap-2">
        ${modalOpenButton(RPS_RULES_DIALOG_ID, 'Rules')}
        ${showSurrender
          ? html`
              <button
                type="button"
                class="rounded-md border border-red-300 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-900 shadow-sm transition hover:bg-red-100 sm:text-sm"
                @click=${() => openModalById(RPS_SURRENDER_DIALOG_ID)}
              >
                Surrender
              </button>
            `
          : nothing}
        ${showRecapButton
          ? html`
              <button
                type="button"
                class="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-800 shadow-sm transition hover:bg-zinc-50 sm:text-sm"
                @click=${() => recap!.onOpen()}
              >
                Game recap
              </button>
            `
          : nothing}
        ${showCompletedActions
          ? imRematchRequester
            ? html`
                <span class="text-center text-xs text-zinc-600"
                  >Waiting for opponent to accept…</span
                >
                <button
                  type="button"
                  class="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-800 shadow-sm transition hover:bg-zinc-50 sm:text-sm"
                  @click=${() => rematch.cancel()}
                >
                  Cancel request
                </button>
                ${newGameBtn}
              `
            : imRematchOpponent
              ? html`
                  <button
                    type="button"
                    class="rounded-md bg-red-700 px-2.5 py-1 text-xs font-semibold text-white shadow-sm transition hover:bg-red-800 sm:text-sm"
                    @click=${() => rematch.accept()}
                  >
                    Accept rematch
                  </button>
                  <button
                    type="button"
                    class="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-800 shadow-sm transition hover:bg-zinc-50 sm:text-sm"
                    @click=${() => rematch.decline()}
                  >
                    Decline
                  </button>
                  ${newGameBtn}
                `
              : html`
                  <button
                    type="button"
                    class="rounded-md bg-red-700 px-2.5 py-1 text-xs font-semibold text-white shadow-sm transition hover:bg-red-800 sm:text-sm"
                    @click=${() => rematch.offer()}
                  >
                    Play again
                  </button>
                  ${newGameBtn}
                `
          : nothing}
      </div>

      ${state.status === 'in_progress' ? throwPanel : nothing}
      ${infoModal(RPS_RULES_DIALOG_ID, 'Rock paper scissors — how to play', rulesBody)}
      ${showSurrender
        ? confirmModal(
            RPS_SURRENDER_DIALOG_ID,
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

export function renderRockPaperScissorsView(
  snapshot: RoomSnapshot,
  state: RockPaperScissorsState,
  onThrow: (t: RpsThrow) => void,
  rematch: RematchControls,
  onChooseAnotherGame: () => void,
  onSurrender: () => void,
  myPlayerId: PlayerId | null,
  recap: { show: boolean; onOpen: () => void } | null = null
) {
  const container = document.getElementById('board')
  if (!container) return

  render(
    boardTemplate(
      snapshot,
      state,
      onThrow,
      rematch,
      onChooseAnotherGame,
      onSurrender,
      myPlayerId,
      recap
    ),
    container
  )
}

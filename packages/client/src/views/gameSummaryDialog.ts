import { type TemplateResult, html } from 'lit'

import type { GameMetricsSummary, PlayerId, TableSeatIndex } from '@gameroom/shared'

import { APP_MODAL_PANEL_WIDE_CLASS, closeModalById } from '@/views/appModal.js'

export function formatDurationMs(ms: number): string {
  const n = Math.max(0, Math.round(ms))
  if (n < 1000) return `${n} ms`
  const sec = Math.floor(n / 1000)
  if (sec < 60) return `${sec}s`
  const min = Math.floor(sec / 60)
  const r = sec % 60
  return r > 0 ? `${min}m ${r}s` : `${min}m`
}

function outcomeDescription(s: GameMetricsSummary): string {
  const { outcome } = s
  const name = (id: PlayerId) => s.byPlayer.find((p) => p.id === id)?.displayName ?? 'Player'
  if (outcome.status === 'abandoned') {
    return 'The game ended early because someone left the table.'
  }
  if (outcome.reason === 'draw') {
    return 'This game ended in a draw.'
  }
  if (outcome.reason === 'surrender' && outcome.winnerId) {
    return `${name(outcome.winnerId)} won by surrender.`
  }
  if (outcome.winnerId) {
    const r = outcome.reason
    const detail =
      r === 'four_in_a_row'
        ? 'four in a row'
        : r === 'three_in_a_row'
          ? 'three in a row'
          : r === 'match_wins'
            ? 'match wins'
            : r === 'forfeit'
              ? 'forfeit'
              : r
    return `${name(outcome.winnerId)} wins (${detail}).`
  }
  return 'Game completed.'
}

function seatLabel(seatIndex: TableSeatIndex | null): string {
  if (seatIndex === 0) return 'Table seat 1'
  if (seatIndex === 1) return 'Table seat 2'
  return '—'
}

/** Optional `onDialogClose` runs when the dialog closes (Escape, Close, or `close()`). */
export function gameSummaryDialog(
  dialogId: string,
  summary: GameMetricsSummary,
  onDialogClose?: () => void
): TemplateResult {
  const opener = summary.roster[0]
  const openerName = summary.byPlayer.find((p) => p.id === opener)?.displayName ?? 'Player'

  return html`
    <dialog
      id=${dialogId}
      class=${APP_MODAL_PANEL_WIDE_CLASS}
      @close=${() => {
        onDialogClose?.()
      }}
    >
      <h3 class="text-lg font-semibold text-zinc-900">Game recap</h3>
      <p class="mt-2 text-sm leading-relaxed text-zinc-600">${outcomeDescription(summary)}</p>
      <dl class="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <dt class="text-zinc-500">Game</dt>
        <dd class="font-medium text-zinc-900">
          ${summary.gameKind === 'connect4'
            ? 'Connect 4'
            : summary.gameKind === 'tic_tac_toe'
              ? 'Tic-tac-toe'
              : 'Rock paper scissors'}
        </dd>
        <dt class="text-zinc-500">Total time</dt>
        <dd class="font-medium text-zinc-900">${formatDurationMs(summary.gameDurationMs)}</dd>
        <dt class="text-zinc-500">Turns played</dt>
        <dd class="font-medium text-zinc-900">${summary.turns.length}</dd>
        <dt class="text-zinc-500">Opened</dt>
        <dd class="font-medium text-zinc-900">${openerName}</dd>
      </dl>

      <div class="mt-5 overflow-x-auto rounded-lg border border-zinc-200">
        <table class="w-full min-w-[20rem] border-collapse text-left text-sm">
          <thead>
            <tr
              class="border-b border-zinc-200 bg-zinc-50 text-xs font-semibold tracking-wide text-zinc-600 uppercase"
            >
              <th class="px-3 py-2">Player</th>
              <th class="px-3 py-2">Table</th>
              <th class="px-3 py-2 text-right">Turns</th>
              <th class="px-3 py-2 text-right">Avg / turn</th>
              <th class="px-3 py-2 text-right">Total think</th>
              <th class="px-3 py-2 text-right">Fastest</th>
              <th class="px-3 py-2 text-right">Slowest</th>
            </tr>
          </thead>
          <tbody>
            ${summary.players.map((row) => {
              const m = summary.byPlayer.find((p) => p.id === row.id)
              if (!m) {
                return html`
                  <tr class="border-b border-zinc-100 last:border-0">
                    <td class="px-3 py-2 font-medium text-zinc-900">${row.displayName}</td>
                    <td class="px-3 py-2 text-zinc-600">${seatLabel(row.seatIndex)}</td>
                    <td colspan="5" class="px-3 py-2 text-zinc-500">—</td>
                  </tr>
                `
              }
              return html`
                <tr class="border-b border-zinc-100 last:border-0">
                  <td class="px-3 py-2 font-medium text-zinc-900">${row.displayName}</td>
                  <td class="px-3 py-2 text-zinc-600">${seatLabel(row.seatIndex)}</td>
                  <td class="px-3 py-2 text-right text-zinc-800 tabular-nums">${m.turnCount}</td>
                  <td class="px-3 py-2 text-right text-zinc-800 tabular-nums">
                    ${formatDurationMs(m.avgThinkMs)}
                  </td>
                  <td class="px-3 py-2 text-right text-zinc-800 tabular-nums">
                    ${formatDurationMs(m.totalThinkMs)}
                  </td>
                  <td class="px-3 py-2 text-right text-zinc-800 tabular-nums">
                    ${m.turnCount > 0 ? formatDurationMs(m.fastestTurnMs) : '—'}
                  </td>
                  <td class="px-3 py-2 text-right text-zinc-800 tabular-nums">
                    ${m.turnCount > 0 ? formatDurationMs(m.slowestTurnMs) : '—'}
                  </td>
                </tr>
              `
            })}
          </tbody>
        </table>
      </div>

      <p class="mt-3 text-xs text-zinc-500">
        “Think time” is measured on the server from the start of your turn until you move or
        surrender. The first player’s first turn includes time until the opening move.
      </p>

      <div class="mt-5 flex justify-end">
        <button
          type="button"
          class="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-zinc-800"
          @click=${() => {
            closeModalById(dialogId)
          }}
        >
          Close
        </button>
      </div>
    </dialog>
  `
}

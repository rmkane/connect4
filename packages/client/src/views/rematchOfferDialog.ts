import { type TemplateResult, html } from 'lit'

import type { PendingRematch, RoomSnapshot } from '@gameroom/shared'

import { APP_MODAL_TOP_LAYER_PANEL_CLASS, closeModalById } from '@/views/appModal.js'
import { displayNameFor } from '@/views/playerLabels.js'

export function rematchOfferDialog(
  dialogId: string,
  snapshot: RoomSnapshot,
  pending: PendingRematch,
  opts: {
    onAccept: () => void
    onDecline: () => void
  }
): TemplateResult {
  const name = displayNameFor(snapshot, pending.requesterId)

  return html`
    <dialog id=${dialogId} class=${APP_MODAL_TOP_LAYER_PANEL_CLASS}>
      <h3 class="text-lg font-semibold text-zinc-900">Play again?</h3>
      <p class="mt-2 text-sm leading-relaxed text-zinc-600">
        <span class="font-medium text-zinc-800">${name}</span> wants another round of this game.
      </p>
      <div class="mt-5 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          class="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-semibold text-zinc-800 shadow-sm hover:bg-zinc-50"
          @click=${() => {
            closeModalById(dialogId)
          }}
        >
          Not now
        </button>
        <button
          type="button"
          class="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-semibold text-zinc-800 shadow-sm hover:bg-zinc-50"
          @click=${() => {
            opts.onDecline()
            closeModalById(dialogId)
          }}
        >
          Decline
        </button>
        <button
          type="button"
          class="rounded-lg bg-red-700 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-red-800"
          @click=${() => {
            opts.onAccept()
            closeModalById(dialogId)
          }}
        >
          Accept
        </button>
      </div>
    </dialog>
  `
}

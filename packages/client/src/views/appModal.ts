import { type TemplateResult, html } from 'lit'

/** Shared panel styles for app `<dialog>` modals (centered, dimmed backdrop). */
export const APP_MODAL_PANEL_CLASS =
  'fixed left-1/2 top-1/2 z-50 max-h-[85vh] w-[min(calc(100vw-2rem),26rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-zinc-200 bg-white p-4 text-zinc-900 shadow-2xl backdrop:bg-zinc-950/40'

/** Wider variant (e.g. post-game stats table). */
export const APP_MODAL_PANEL_WIDE_CLASS =
  'fixed left-1/2 top-1/2 z-50 max-h-[85vh] w-[min(calc(100vw-2rem),36rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-zinc-200 bg-white p-5 text-zinc-900 shadow-2xl backdrop:bg-zinc-950/40'

export function openModalById(id: string): void {
  document.getElementById(id)?.showModal()
}

export function closeModalById(id: string): void {
  document.getElementById(id)?.close()
}

export function modalOpenButton(
  dialogId: string,
  label: string,
  buttonClass?: string
): TemplateResult {
  const cls =
    buttonClass ??
    'rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-800 shadow-sm transition hover:bg-zinc-50 sm:text-sm'
  return html`
    <button type="button" class=${cls} @click=${() => openModalById(dialogId)}>${label}</button>
  `
}

/** Info modal with a single Close control (uses `method="dialog"`). */
export function infoModal(dialogId: string, title: string, body: TemplateResult): TemplateResult {
  return html`
    <dialog id=${dialogId} class=${APP_MODAL_PANEL_CLASS}>
      <h3 class="text-base font-semibold text-zinc-900">${title}</h3>
      <div class="mt-3 text-sm leading-relaxed text-zinc-600">${body}</div>
      <form method="dialog" class="mt-4 flex justify-end">
        <button
          type="submit"
          class="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-zinc-800"
        >
          Close
        </button>
      </form>
    </dialog>
  `
}

/** Confirm / cancel — both actions close the dialog after `onConfirm` runs. */
export function confirmModal(
  dialogId: string,
  title: string,
  body: TemplateResult,
  opts: {
    confirmLabel: string
    onConfirm: () => void
    cancelLabel?: string
    danger?: boolean
  }
): TemplateResult {
  const confirmCls = opts.danger
    ? 'rounded-lg bg-red-700 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-red-800'
    : 'rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-zinc-800'
  return html`
    <dialog id=${dialogId} class=${APP_MODAL_PANEL_CLASS}>
      <h3 class="text-base font-semibold text-zinc-900">${title}</h3>
      <div class="mt-3 text-sm leading-relaxed text-zinc-600">${body}</div>
      <div class="mt-4 flex justify-end gap-2">
        <button
          type="button"
          class="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-semibold text-zinc-800 shadow-sm hover:bg-zinc-50"
          @click=${() => closeModalById(dialogId)}
        >
          ${opts.cancelLabel ?? 'Cancel'}
        </button>
        <button
          type="button"
          class=${confirmCls}
          @click=${() => {
            opts.onConfirm()
            closeModalById(dialogId)
          }}
        >
          ${opts.confirmLabel}
        </button>
      </div>
    </dialog>
  `
}

/** Single OK — replaces `alert()`. */
export function alertModal(
  dialogId: string,
  title: string,
  body: TemplateResult | string,
  opts?: { okLabel?: string; onDismiss?: () => void }
): TemplateResult {
  const inner = typeof body === 'string' ? html`<p>${body}</p>` : body
  const ok = opts?.okLabel ?? 'OK'
  return html`
    <dialog id=${dialogId} class=${APP_MODAL_PANEL_CLASS}>
      <h3 class="text-base font-semibold text-zinc-900">${title}</h3>
      <div class="mt-3 text-sm leading-relaxed text-zinc-600">${inner}</div>
      <div class="mt-4 flex justify-end">
        <button
          type="button"
          class="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-zinc-800"
          @click=${() => {
            opts?.onDismiss?.()
            closeModalById(dialogId)
          }}
        >
          ${ok}
        </button>
      </div>
    </dialog>
  `
}

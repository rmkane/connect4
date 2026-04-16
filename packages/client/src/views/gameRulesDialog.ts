import { type TemplateResult, html } from 'lit'

export function rulesOpenButton(dialogId: string): TemplateResult {
  return html`
    <button
      type="button"
      class="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-800 shadow-sm transition hover:bg-zinc-50 sm:text-sm"
      @click=${() => document.getElementById(dialogId)?.showModal()}
    >
      Rules
    </button>
  `
}

export function rulesDialogMarkup(
  dialogId: string,
  title: string,
  body: TemplateResult
): TemplateResult {
  return html`
    <dialog
      id=${dialogId}
      class="max-h-[85vh] w-[min(100%,24rem)] overflow-y-auto rounded-xl border border-zinc-200 bg-white p-4 text-zinc-900 shadow-2xl backdrop:bg-zinc-950/40"
    >
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

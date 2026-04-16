import { html, nothing, render } from 'lit'

const CONTEXT_HOST_ID = 'session-context-host'

/** Hide the strip under the site header (home, or room name step before play). */
export function clearSessionContext() {
  const bar = document.getElementById('user-context')
  const host = document.getElementById(CONTEXT_HOST_ID)
  if (!bar || !host) return
  bar.classList.add('hidden')
  render(nothing, host)
}

export type RoomSessionChrome = {
  displayName: string
  roomId: string
  shareUrl: string
  inviteFeedback: '' | 'copied' | 'failed'
  onLeave: () => void
  onCopy: () => void
  onShare?: () => void
}

/** Room route, seated / playing: name, room id, leave + invite actions in the header strip. */
export function paintRoomSessionChrome(opts: RoomSessionChrome) {
  const bar = document.getElementById('user-context')
  const host = document.getElementById(CONTEXT_HOST_ID)
  if (!bar || !host) return
  bar.classList.remove('hidden')
  render(
    html`
      <div
        class="flex flex-col gap-3 text-sm text-zinc-800 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
      >
        <div
          class="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-baseline sm:gap-x-4 sm:gap-y-1"
        >
          <p class="shrink-0">
            <span class="text-zinc-500">Playing as</span>
            <span class="ml-1 font-semibold tracking-tight text-zinc-900">${opts.displayName}</span>
          </p>
          <p class="min-w-0 font-mono text-xs leading-snug text-zinc-600">
            <span class="text-zinc-500">Room</span>
            <span class="ml-2 break-all text-zinc-800 select-all">${opts.roomId}</span>
          </p>
        </div>
        <div
          class="flex flex-wrap items-center gap-2 sm:justify-end"
          role="group"
          aria-label="Room actions"
        >
          <button
            type="button"
            class="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 shadow-sm transition hover:bg-zinc-50"
            @click=${opts.onLeave}
          >
            Leave room
          </button>
          <button
            type="button"
            class="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 shadow-sm transition hover:bg-zinc-50"
            @click=${() => void opts.onCopy()}
          >
            Copy link
          </button>
          ${opts.onShare
            ? html`
                <button
                  type="button"
                  class="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 shadow-sm transition hover:bg-zinc-50"
                  @click=${() => void opts.onShare()}
                >
                  Share…
                </button>
              `
            : nothing}
          ${opts.inviteFeedback === 'copied'
            ? html`<span class="text-xs font-medium text-emerald-700">Copied</span>`
            : opts.inviteFeedback === 'failed'
              ? html`<span class="text-xs font-medium text-red-700">Copy failed</span>`
              : nothing}
        </div>
      </div>
    `,
    host
  )
}

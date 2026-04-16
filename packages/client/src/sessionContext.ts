import { html, nothing, render } from 'lit'
import { live } from 'lit/directives/live.js'

import type { PlayerId } from '@gameroom/shared'
import { ROOM_TITLE_MAX_LENGTH } from '@gameroom/shared'

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
  roomTitle: string
  titleDraft: string
  /** Current socket is table host — can rename and pass host. */
  isTableHost: boolean
  /** When host and the other seat is filled — `onPassHost` sends `transfer_leadership`. */
  passHostTarget: { id: PlayerId; displayName: string } | null
  onPassHost: () => void
  shareUrl: string
  inviteFeedback: '' | 'copied' | 'failed'
  onTitleInput: (value: string) => void
  onSaveTitle: () => void
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
        <div class="flex min-w-0 flex-1 flex-col gap-2">
          <div
            class="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-baseline sm:gap-x-4 sm:gap-y-1"
          >
            <p class="shrink-0">
              <span class="text-zinc-500">Playing as</span>
              <span class="ml-1 font-semibold tracking-tight text-zinc-900"
                >${opts.displayName}</span
              >
            </p>
            <p class="min-w-0 font-mono text-xs leading-snug text-zinc-600">
              <span class="text-zinc-500">Room</span>
              <span class="ml-2 break-all text-zinc-800 select-all">${opts.roomId}</span>
            </p>
          </div>
          <div
            class="flex min-w-0 flex-col gap-1 border-t border-zinc-200/80 pt-2 sm:border-t-0 sm:pt-0"
          >
            <label class="text-xs font-medium text-zinc-500" for="table-title-input"
              >Table name</label
            >
            ${opts.isTableHost
              ? html`
                  <div class="flex flex-wrap items-center gap-2">
                    <input
                      id="table-title-input"
                      type="text"
                      maxlength=${ROOM_TITLE_MAX_LENGTH}
                      placeholder="Optional — shown in lobby and here"
                      class="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 placeholder:text-zinc-400"
                      .value=${live(opts.titleDraft)}
                      @input=${(e: Event) =>
                        opts.onTitleInput((e.target as HTMLInputElement).value)}
                    />
                    <button
                      type="button"
                      class="shrink-0 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 shadow-sm transition hover:bg-zinc-50"
                      @click=${() => opts.onSaveTitle()}
                    >
                      Save
                    </button>
                  </div>
                `
              : html`
                  <p class="text-xs text-zinc-500">
                    Only the table host can edit this. The lobby shows this label when set.
                  </p>
                  <input
                    id="table-title-input"
                    type="text"
                    readonly
                    class="min-w-0 flex-1 cursor-not-allowed rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-sm text-zinc-700"
                    .value=${live(opts.roomTitle || opts.titleDraft)}
                  />
                `}
            ${opts.roomTitle.trim()
              ? html`<p class="text-xs text-zinc-500">Current label: “${opts.roomTitle}”</p>`
              : nothing}
            ${opts.passHostTarget
              ? html`
                  <button
                    type="button"
                    class="mt-2 w-fit rounded-lg border border-amber-300/80 bg-amber-50/90 px-3 py-1.5 text-xs font-semibold text-amber-900 shadow-sm transition hover:bg-amber-100"
                    @click=${() => opts.onPassHost()}
                  >
                    Pass table host to ${opts.passHostTarget.displayName}
                  </button>
                `
              : nothing}
          </div>
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
                  @click=${() => {
                    if (opts.onShare) void opts.onShare()
                  }}
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

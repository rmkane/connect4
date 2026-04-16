import { type TemplateResult, html, nothing, render } from 'lit'
import { live } from 'lit/directives/live.js'

import type { PlayerId } from '@gameroom/shared'
import { ROOM_TITLE_MAX_LENGTH } from '@gameroom/shared'

const CONTEXT_HOST_ID = 'session-context-host'

/** 16×16-ish stroke icons (Heroicons-style), `currentColor` for theming. */
const iconLeave = html`
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
    class="h-4 w-4"
    aria-hidden="true"
  >
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
`

const iconLink = html`
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
    class="h-4 w-4"
    aria-hidden="true"
  >
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </svg>
`

const iconShare = html`
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
    class="h-4 w-4"
    aria-hidden="true"
  >
    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
    <polyline points="16 6 12 2 8 6" />
    <line x1="12" y1="2" x2="12" y2="15" />
  </svg>
`

const iconCheck = html`
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    class="h-4 w-4"
    aria-hidden="true"
  >
    <polyline points="20 6 9 17 4 12" />
  </svg>
`

const iconUsers = html`
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
    class="h-4 w-4"
    aria-hidden="true"
  >
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
`

function iconButton(opts: {
  label: string
  onClick: () => void
  icon: TemplateResult
  variant?: 'default' | 'amber'
}): TemplateResult {
  const ring = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300'
  const base =
    'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border shadow-sm transition ' +
    ring +
    (opts.variant === 'amber'
      ? ' border-amber-300/90 bg-amber-50 text-amber-900 hover:bg-amber-100'
      : ' border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50')
  return html`
    <button
      type="button"
      class=${base}
      aria-label=${opts.label}
      title=${opts.label}
      @click=${opts.onClick}
    >
      ${opts.icon}
    </button>
  `
}

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

/** Room route, seated / playing: compact one-line strip with icon actions. */
export function paintRoomSessionChrome(opts: RoomSessionChrome) {
  const bar = document.getElementById('user-context')
  const host = document.getElementById(CONTEXT_HOST_ID)
  if (!bar || !host) return
  bar.classList.remove('hidden')

  const passLabel = opts.passHostTarget
    ? `Pass table host to ${opts.passHostTarget.displayName}`
    : ''

  render(
    html`
      <div
        class="flex min-w-0 flex-nowrap items-center gap-2 text-sm text-zinc-800 sm:gap-3"
        role="region"
        aria-label="Table session"
      >
        <div
          class="flex min-w-0 shrink items-baseline gap-1.5 overflow-hidden whitespace-nowrap sm:gap-2"
        >
          <span
            class="max-w-28 truncate font-medium text-zinc-900 sm:max-w-40"
            title=${opts.displayName}
            >${opts.displayName}</span
          >
          <span class="shrink-0 text-zinc-400" aria-hidden="true">·</span>
          <span
            class="min-w-0 truncate font-mono text-[11px] leading-none text-zinc-600 sm:text-xs"
            title=${opts.roomId}
            >${opts.roomId}</span
          >
        </div>

        <div class="mx-0.5 hidden h-5 w-px shrink-0 bg-zinc-200 sm:block" aria-hidden="true"></div>

        <div class="flex min-w-0 flex-1 items-center gap-1">
          ${opts.isTableHost
            ? html`
                <input
                  id="table-title-input"
                  type="text"
                  maxlength=${ROOM_TITLE_MAX_LENGTH}
                  placeholder="Table name"
                  title="Optional label for lobby and this bar"
                  class="h-8 min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-2 text-xs text-zinc-900 placeholder:text-zinc-400 sm:text-sm"
                  .value=${live(opts.titleDraft)}
                  @input=${(e: Event) => opts.onTitleInput((e.target as HTMLInputElement).value)}
                />
                ${iconButton({
                  label: 'Save table name',
                  onClick: () => opts.onSaveTitle(),
                  icon: iconCheck,
                })}
              `
            : html`
                <input
                  id="table-title-input"
                  type="text"
                  readonly
                  title="Only the table host can change the table name"
                  placeholder="Table name"
                  class="h-8 max-w-40 min-w-0 flex-1 cursor-not-allowed truncate rounded-lg border border-zinc-200 bg-zinc-50 px-2 text-xs text-zinc-600 sm:max-w-56 sm:text-sm"
                  .value=${live(opts.roomTitle || opts.titleDraft)}
                />
              `}
        </div>

        <div
          class="flex shrink-0 items-center gap-0.5 sm:gap-1"
          role="toolbar"
          aria-label="Room actions"
        >
          ${opts.passHostTarget
            ? iconButton({
                label: passLabel,
                onClick: () => opts.onPassHost(),
                icon: iconUsers,
                variant: 'amber',
              })
            : nothing}
          ${iconButton({
            label: 'Leave room',
            onClick: opts.onLeave,
            icon: iconLeave,
          })}
          ${iconButton({
            label: 'Copy room link',
            onClick: () => void opts.onCopy(),
            icon: iconLink,
          })}
          ${opts.onShare
            ? iconButton({
                label: 'Share room link',
                onClick: () => {
                  if (opts.onShare) void opts.onShare()
                },
                icon: iconShare,
              })
            : nothing}
          ${opts.inviteFeedback === 'copied'
            ? html`<span
                class="shrink-0 text-xs font-semibold text-emerald-600"
                title="Copied"
                aria-live="polite"
                >✓</span
              >`
            : opts.inviteFeedback === 'failed'
              ? html`<span
                  class="shrink-0 text-xs font-medium text-red-600"
                  title="Copy failed"
                  aria-live="polite"
                  >!</span
                >`
              : nothing}
        </div>
      </div>
    `,
    host
  )
}

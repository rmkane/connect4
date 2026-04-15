import { html, nothing, render } from 'lit'

import type { PublicRoomSummary, RoomsListResponse } from '@connect4/shared'

import { clientConfig } from '@/config.js'
import { logger } from '@/logger.js'
import { navigateToRoom, parseGameIdInput } from '@/router.js'

export type LandingHandle = { destroy: () => void }

function roomMatchesFilter(room: PublicRoomSummary, q: string): boolean {
  if (!q) return true
  const id = room.gameId.toLowerCase()
  const r = (room.redDisplayName ?? '').toLowerCase()
  const y = (room.yellowDisplayName ?? '').toLowerCase()
  return id.includes(q) || r.includes(q) || y.includes(q)
}

function roomIsJoinable(room: PublicRoomSummary): boolean {
  if (room.status !== 'waiting') return false
  const n = (room.redDisplayName ? 1 : 0) + (room.yellowDisplayName ? 1 : 0)
  return n < 2
}

function waitingSubtitle(room: PublicRoomSummary) {
  const lone = room.redDisplayName ?? room.yellowDisplayName
  if (lone) return html`Waiting · <span class="font-medium">${lone}</span>`
  return html`Empty table — be the first to sit`
}

function inProgressSubtitle(room: PublicRoomSummary) {
  const r = room.redDisplayName ?? 'Red'
  const y = room.yellowDisplayName ?? 'Yellow'
  return html`In progress · <span class="font-medium">${r}</span> vs
    <span class="font-medium">${y}</span>`
}

export function mountLanding(opts: { host: HTMLElement; onCreate: () => void }): LandingHandle {
  const { host, onCreate } = opts
  let rooms: PublicRoomSummary[] = []
  let loadError: string | null = null
  let loading = true
  let filter = ''
  let pollTimer: ReturnType<typeof setInterval> | null = null
  let loadSeq = 0

  function paint() {
    const q = filter.trim().toLowerCase()
    const visible = rooms.filter((r) => roomMatchesFilter(r, q))

    render(
      html`
        <div class="flex w-full max-w-lg flex-col items-center gap-10 text-center">
          <div class="flex flex-col gap-3">
            <h1 class="text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl">
              Start or join a table
            </h1>
            <p class="text-sm leading-relaxed text-pretty text-zinc-600 sm:text-base">
              Create a room, paste an invite link, or browse open and in-progress tables below.
            </p>
          </div>

          <div class="flex w-full flex-col items-stretch gap-3">
            <button
              type="button"
              class="rounded-xl bg-red-700 px-4 py-3.5 text-sm font-semibold text-white shadow-md transition hover:bg-red-800 hover:shadow-lg"
              @click=${onCreate}
            >
              Create room
            </button>
            <p class="text-xs text-zinc-500">
              New rooms get a random id — use <strong>Copy link</strong> on the table screen to
              invite someone.
            </p>
          </div>

          <form
            class="flex w-full flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-5 text-left shadow-sm sm:p-6"
            @submit=${(e: Event) => {
              e.preventDefault()
              const fd = new FormData(e.target as HTMLFormElement)
              const raw = String(fd.get('joinRaw') ?? '')
              const id = parseGameIdInput(raw)
              if (!id) {
                alert('Enter a valid room UUID, or paste the full /room/… or /game/… link.')
                return
              }
              navigateToRoom(id)
            }}
          >
            <label class="text-sm font-medium text-zinc-800" for="joinRaw">Join by id or URL</label>
            <input
              id="joinRaw"
              name="joinRaw"
              type="text"
              autocomplete="off"
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              class="w-full rounded-lg border border-zinc-300 px-3 py-2.5 font-mono text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-red-400 focus:ring-2 focus:ring-red-200 focus:outline-none"
            />
            <button
              type="submit"
              class="rounded-xl border border-zinc-300 bg-zinc-50 px-4 py-2.5 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-100"
            >
              Join
            </button>
          </form>

          <section
            class="w-full rounded-xl border border-zinc-200 bg-white p-5 text-left shadow-sm sm:p-6"
            aria-labelledby="lobby-heading"
          >
            <div class="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 id="lobby-heading" class="text-sm font-semibold text-zinc-900">Lobby</h2>
                <p class="mt-0.5 text-xs text-zinc-500">
                  Open seats and games in progress (refreshes every 15s). Full tables are view-only
                  here — use an invite link to rejoin your room.
                </p>
              </div>
              <button
                type="button"
                class="shrink-0 rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-xs font-semibold text-zinc-800 transition hover:bg-zinc-100 disabled:opacity-50"
                ?disabled=${loading}
                @click=${() => void loadRooms()}
              >
                Refresh
              </button>
            </div>

            <label
              class="mt-4 block text-xs font-medium tracking-wide text-zinc-500 uppercase"
              for="lobby-filter"
              >Search</label
            >
            <input
              id="lobby-filter"
              type="search"
              autocomplete="off"
              placeholder="Room id or player name"
              .value=${filter}
              class="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-red-400 focus:ring-2 focus:ring-red-200 focus:outline-none"
              @input=${(e: Event) => {
                filter = (e.target as HTMLInputElement).value
                paint()
              }}
            />

            ${loadError
              ? html`<p class="mt-3 text-sm text-red-700">${loadError}</p>`
              : loading && rooms.length === 0
                ? html`<p class="mt-3 text-sm text-zinc-500">Loading lobby…</p>`
                : visible.length === 0
                  ? html`<p class="mt-3 text-sm text-zinc-500">
                      ${rooms.length === 0
                        ? 'Nothing in the lobby yet. Create a room or join by id above.'
                        : 'No tables match your search.'}
                    </p>`
                  : html`
                      <ul class="mt-3 flex max-h-56 flex-col gap-2 overflow-y-auto" role="list">
                        ${visible.map((room) => {
                          const joinable = roomIsJoinable(room)
                          return html`
                            <li>
                              ${joinable
                                ? html`
                                    <button
                                      type="button"
                                      class="flex w-full flex-col items-stretch gap-0.5 rounded-lg border border-zinc-200 bg-zinc-50/80 px-3 py-2.5 text-left text-sm transition hover:border-zinc-300 hover:bg-white"
                                      @click=${() => navigateToRoom(room.gameId)}
                                    >
                                      <span class="font-mono text-xs text-zinc-600"
                                        >${room.gameId}</span
                                      >
                                      <span class="text-zinc-900">${waitingSubtitle(room)}</span>
                                    </button>
                                  `
                                : html`
                                    <div
                                      class="flex flex-col gap-0.5 rounded-lg border border-zinc-200 bg-zinc-100/60 px-3 py-2.5 text-left text-sm text-zinc-600"
                                      aria-label="Table in progress, full"
                                    >
                                      <span class="font-mono text-xs text-zinc-500"
                                        >${room.gameId}</span
                                      >
                                      <span>${inProgressSubtitle(room)}</span>
                                    </div>
                                  `}
                            </li>
                          `
                        })}
                      </ul>
                    `}
          </section>
        </div>
      `,
      host
    )
  }

  async function loadRooms() {
    const seq = ++loadSeq
    loadError = null
    loading = true
    paint()
    const url = `${clientConfig.httpBase()}/api/rooms`
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as RoomsListResponse
      if (seq !== loadSeq) return
      rooms = Array.isArray(data.rooms) ? data.rooms : []
    } catch (err) {
      logger.warn({ err, url }, 'lobby list fetch failed')
      if (seq !== loadSeq) return
      loadError = 'Could not load open tables. Is the game server running?'
      rooms = []
    } finally {
      if (seq === loadSeq) loading = false
      paint()
    }
  }

  void loadRooms()
  pollTimer = setInterval(() => void loadRooms(), 15_000)

  function destroy() {
    loadSeq += 1
    if (pollTimer !== null) {
      clearInterval(pollTimer)
      pollTimer = null
    }
    render(nothing, host)
  }

  return { destroy }
}

import { type TemplateResult, html } from 'lit'

import { navigateToGame, parseGameIdInput } from '@/router.js'

export function landingView(opts: { onCreate: () => void }): TemplateResult {
  return html`
    <div class="flex w-full max-w-lg flex-col items-center gap-10 text-center">
      <div class="flex flex-col gap-3">
        <h1 class="text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl">
          Start or join a table
        </h1>
        <p class="text-sm leading-relaxed text-pretty text-zinc-600 sm:text-base">
          Create a room with a new id, or paste a game link / UUID from whoever invited you.
        </p>
      </div>

      <div class="flex w-full flex-col items-stretch gap-3">
        <button
          type="button"
          class="rounded-xl bg-red-700 px-4 py-3.5 text-sm font-semibold text-white shadow-md transition hover:bg-red-800 hover:shadow-lg"
          @click=${opts.onCreate}
        >
          Create game
        </button>
        <p class="text-xs text-zinc-500">
          You’ll go to <span class="font-mono text-zinc-700">/game/&lt;uuid&gt;</span> — copy that
          URL to invite someone.
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
            alert('Enter a valid game UUID, or paste the full /game/... link from your host.')
            return
          }
          navigateToGame(id)
        }}
      >
        <label class="text-sm font-medium text-zinc-800" for="joinRaw">Join a game</label>
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
    </div>
  `
}

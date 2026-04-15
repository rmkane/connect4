/** Loose UUID (any version) for room ids. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(s: string): boolean {
  return UUID_RE.test(s.trim())
}

/** Accept raw UUID or full `/game/<uuid>` URL from the join field. */
export function parseGameIdInput(raw: string): string | null {
  const t = raw.trim()
  const fromPath = t.match(/\/game\/([^/?#\s]+)/i)
  if (fromPath?.[1] && isUuid(fromPath[1])) return fromPath[1].toLowerCase()
  if (isUuid(t)) return t.toLowerCase()
  return null
}

export type AppRoute = { type: 'home' } | { type: 'game'; gameId: string }

export function parseRoute(): AppRoute {
  const m = location.pathname.match(/^\/game\/([^/]+)\/?$/i)
  if (m?.[1]) {
    if (isUuid(m[1])) return { type: 'game', gameId: m[1].toLowerCase() }
    history.replaceState(null, '', '/')
    return { type: 'home' }
  }

  const legacy = new URLSearchParams(location.search).get('gameId')
  if (legacy && isUuid(legacy)) {
    history.replaceState(null, '', `/game/${legacy.toLowerCase()}`)
    return { type: 'game', gameId: legacy.toLowerCase() }
  }

  if (legacy && !isUuid(legacy)) {
    history.replaceState(null, '', '/')
  }

  return { type: 'home' }
}

let rerender: (() => void) | undefined

export function initRouter(onRoute: () => void) {
  rerender = onRoute
}

export function navigateToGame(gameId: string) {
  history.pushState(null, '', `/game/${gameId}`)
  rerender?.()
}

export function navigateHome() {
  history.pushState(null, '', '/')
  rerender?.()
}

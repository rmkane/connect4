/** Loose UUID (any version) for room ids. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(s: string): boolean {
  return UUID_RE.test(s.trim())
}

/** Accept raw UUID or pasted URL with `/room/<uuid>` or legacy `/game/<uuid>`. */
export function parseGameIdInput(raw: string): string | null {
  const t = raw.trim()
  const fromPath = t.match(/\/(?:room|game)\/([^/?#\s]+)/i)
  if (fromPath?.[1] && isUuid(fromPath[1])) return fromPath[1].toLowerCase()
  if (isUuid(t)) return t.toLowerCase()
  return null
}

export type AppRoute = { type: 'home' } | { type: 'room'; roomId: string }

export function parseRoute(): AppRoute {
  const roomPath = location.pathname.match(/^\/room\/([^/]+)\/?$/i)
  if (roomPath?.[1]) {
    if (isUuid(roomPath[1])) return { type: 'room', roomId: roomPath[1].toLowerCase() }
    history.replaceState(null, '', '/')
    return { type: 'home' }
  }

  const oldGamePath = location.pathname.match(/^\/game\/([^/]+)\/?$/i)
  if (oldGamePath?.[1] && isUuid(oldGamePath[1])) {
    const id = oldGamePath[1].toLowerCase()
    history.replaceState(null, '', `/room/${id}`)
    return { type: 'room', roomId: id }
  }
  if (oldGamePath?.[1]) {
    history.replaceState(null, '', '/')
    return { type: 'home' }
  }

  const legacy = new URLSearchParams(location.search).get('gameId')
  if (legacy && isUuid(legacy)) {
    const id = legacy.toLowerCase()
    history.replaceState(null, '', `/room/${id}`)
    return { type: 'room', roomId: id }
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

export function navigateToRoom(roomId: string) {
  history.pushState(null, '', `/room/${roomId}`)
  rerender?.()
}

export function navigateHome() {
  history.pushState(null, '', '/')
  rerender?.()
}

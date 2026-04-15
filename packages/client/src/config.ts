/**
 * Browser client config. Override WebSocket URL at build time with `VITE_WS_URL`
 * (see `packages/client/.env.example`). Keeps static hosting separate from the API host.
 */
function defaultWsUrl(): string {
  if (import.meta.env.VITE_WS_URL) {
    return import.meta.env.VITE_WS_URL
  }
  const wsProto = location.protocol === 'https:' ? 'wss:' : 'ws:'
  const host = location.hostname
  const port = import.meta.env.VITE_WS_PORT ?? '3000'
  return `${wsProto}//${host}:${port}`
}

/** Same host/path as the game WebSocket, with `http(s)` for REST (e.g. lobby list). */
function wsUrlToHttpBase(wsUrl: string): string {
  const u = new URL(wsUrl)
  u.protocol = u.protocol === 'wss:' ? 'https:' : 'http:'
  const base = u.pathname === '/' ? u.origin : `${u.origin}${u.pathname.replace(/\/$/, '')}`
  return base
}

export const clientConfig = {
  wsUrl: defaultWsUrl(),
  httpBase(): string {
    return wsUrlToHttpBase(this.wsUrl)
  },
} as const

/** Server runtime config (set via environment; see `packages/server/.env.example`). */
export const serverConfig = {
  port: Number(process.env.PORT ?? 3000),
  /** Max WebSocket frame size (bytes) — basic abuse guard for templates. */
  maxMessageBytes: Number(process.env.MAX_WS_MESSAGE_BYTES ?? 16_384),
} as const

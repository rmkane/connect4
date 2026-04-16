import type { PlayerId } from '@/core.js'

export const ROWS = 6
export const COLS = 7

/** Sender id for synthetic room chat lines (game start/end); never assigned to a real seat. */
export const SYSTEM_ANNOUNCEMENT_PLAYER_ID: PlayerId = '00000000-0000-4000-8000-000000000001'

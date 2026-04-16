import type { PlayerId } from '@gameroom/shared'

/** Outcome of applying one move in an active session (room uses this for scores + listing). */
export type SessionMoveResult =
  | { kind: 'invalid' }
  | { kind: 'ongoing' }
  | { kind: 'finished'; winner: PlayerId | null }

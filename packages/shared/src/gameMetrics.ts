import type { PlayerId } from '@/core.js'
import type { GameKind } from '@/room.js'

/** How the session stopped (aligned with game `result.reason` where applicable). */
export type GameMetricsEndReason =
  | 'four_in_a_row'
  | 'three_in_a_row'
  | 'draw'
  | 'surrender'
  | 'forfeit'
  | 'abandoned'

export interface GameTurnMetric {
  playerId: PlayerId
  /** Wall time from “your turn started” until this decision (move or surrender). */
  durationMs: number
  /** 1-based index of this decision in the game. */
  moveIndex: number
}

export interface GamePlayerMetricRow {
  id: PlayerId
  displayName: string
  turnCount: number
  totalThinkMs: number
  avgThinkMs: number
  fastestTurnMs: number
  slowestTurnMs: number
}

/** Post-game timing stats sent once when a session leaves `in_progress`. */
export interface GameMetricsSummary {
  roomId: string
  gameSessionId: string
  gameKind: GameKind
  endedAt: number
  /** First move / round start through game end. */
  gameDurationMs: number
  outcome: {
    status: 'completed' | 'abandoned'
    winnerId: PlayerId | null
    reason: GameMetricsEndReason
  }
  /** Physical seats when still known (`null` if that player already left mid-summary). */
  players: readonly [
    { id: PlayerId; displayName: string; seat: 'red' | 'yellow' | null },
    { id: PlayerId; displayName: string; seat: 'red' | 'yellow' | null },
  ]
  /** In-game roster order `[first mover, second]` (same as `state.players`). */
  roster: readonly [PlayerId, PlayerId]
  turns: readonly GameTurnMetric[]
  byPlayer: readonly [GamePlayerMetricRow, GamePlayerMetricRow]
}

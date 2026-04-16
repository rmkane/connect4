import type { PlayerId } from '@/core.js'

export type RpsThrow = 'rock' | 'paper' | 'scissors'

export interface RockPaperScissorsResult {
  winner: PlayerId | null
  reason: 'match_wins' | 'surrender'
}

/** Result of the most recently completed hand (shown to both players after reveal). */
export interface RpsLastResolvedHand {
  throws: readonly [RpsThrow, RpsThrow]
  /** Roster seat that won the hand, or `null` when the hand was a tie. */
  winnerSeat: 0 | 1 | null
}

export interface RockPaperScissorsState {
  game: 'rock_paper_scissors'
  roomId: string
  gameSessionId: string
  players: readonly [PlayerId, PlayerId]
  /** First to this many hand wins takes the match (default best-of-3 → 2). */
  winsToWinMatch: number
  wins: [number, number]
  /**
   * Current in-progress hand (server holds both values). In `room_state`, throws are redacted per
   * viewer until both players have committed this hand.
   */
  roundThrows: [RpsThrow | null, RpsThrow | null]
  /**
   * After each completed hand, both throws and outcome (cleared when the next hand starts).
   * Populated in `room_state` for all viewers.
   */
  lastResolvedHand: RpsLastResolvedHand | null
  /**
   * Whether each roster seat has submitted this hand. Set in `room_state` (does not reveal the
   * throw before both have locked in).
   */
  seatCommittedThisRound: [boolean, boolean]
  /**
   * Count of completed hands (win or tie). Used so “fresh table” detection can tell a rematch
   * start from mid-match between rounds.
   */
  completedRounds: number
  /** Kept for snapshot shape; RPS does not gate moves on this field. */
  currentTurn: PlayerId
  status: 'in_progress' | 'completed' | 'abandoned'
  result: RockPaperScissorsResult | null
}

/**
 * Per-viewer `room_state` shaping: each player only sees their own in-progress throw until both
 * have committed; spectators see throws hidden until both commit.
 */
export function wireRockPaperScissorsForViewer(
  state: RockPaperScissorsState,
  viewerId: PlayerId | undefined
): RockPaperScissorsState {
  const full0 = state.roundThrows[0]
  const full1 = state.roundThrows[1]
  const seatCommittedThisRound: [boolean, boolean] = [full0 !== null, full1 !== null]

  let roundThrows: [RpsThrow | null, RpsThrow | null]
  if (full0 !== null && full1 !== null) {
    roundThrows = [full0, full1]
  } else if (full0 === null && full1 === null) {
    roundThrows = [null, null]
  } else {
    const vi =
      viewerId === undefined
        ? -1
        : state.players[0] === viewerId
          ? 0
          : state.players[1] === viewerId
            ? 1
            : -1
    if (vi === -1) {
      roundThrows = [null, null]
    } else {
      roundThrows = [vi === 0 ? full0 : null, vi === 1 ? full1 : null]
    }
  }

  return { ...state, roundThrows, seatCommittedThisRound }
}

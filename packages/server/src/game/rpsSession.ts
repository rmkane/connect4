import type { PlayerId, RockPaperScissorsState, RpsThrow } from '@gameroom/shared'

import type { SessionMoveResult } from '@/game/sessionTypes.js'

const DEFAULT_WINS_TO_WIN = 2

function handWinner(a: RpsThrow, b: RpsThrow): 0 | 1 | null {
  if (a === b) return null
  if (
    (a === 'rock' && b === 'scissors') ||
    (a === 'scissors' && b === 'paper') ||
    (a === 'paper' && b === 'rock')
  ) {
    return 0
  }
  return 1
}

export function createGame(
  roomId: string,
  gameSessionId: string,
  players: readonly PlayerId[]
): RockPaperScissorsState {
  if (players.length !== 2)
    throw new Error('rock_paper_scissors: roster must have exactly 2 players')
  const pair = players as readonly [PlayerId, PlayerId]
  return {
    game: 'rock_paper_scissors',
    roomId,
    gameSessionId,
    players: pair,
    winsToWinMatch: DEFAULT_WINS_TO_WIN,
    wins: [0, 0],
    roundThrows: [null, null],
    lastResolvedHand: null,
    seatCommittedThisRound: [false, false],
    completedRounds: 0,
    currentTurn: pair[0],
    status: 'in_progress',
    result: null,
  }
}

function syncSeatCommitted(s: RockPaperScissorsState) {
  s.seatCommittedThisRound = [s.roundThrows[0] !== null, s.roundThrows[1] !== null]
}

export function applyMove(
  state: RockPaperScissorsState,
  playerId: PlayerId,
  thrown: RpsThrow
): SessionMoveResult {
  if (state.status !== 'in_progress') return { kind: 'invalid' }
  const idx = state.players[0] === playerId ? 0 : state.players[1] === playerId ? 1 : -1
  if (idx === -1) return { kind: 'invalid' }
  if (state.roundThrows[idx] !== null) return { kind: 'invalid' }

  if (state.roundThrows[0] === null && state.roundThrows[1] === null) {
    state.lastResolvedHand = null
  }

  state.roundThrows[idx] = thrown
  syncSeatCommitted(state)
  const [t0, t1] = state.roundThrows
  if (t0 === null || t1 === null) {
    return { kind: 'ongoing' }
  }

  state.completedRounds += 1
  const w = handWinner(t0, t1)
  if (w === null) {
    state.lastResolvedHand = { throws: [t0, t1], winnerSeat: null }
    state.roundThrows = [null, null]
    syncSeatCommitted(state)
    return { kind: 'ongoing' }
  }
  state.lastResolvedHand = { throws: [t0, t1], winnerSeat: w }
  state.wins[w] += 1
  state.roundThrows = [null, null]
  syncSeatCommitted(state)
  if (state.wins[w] >= state.winsToWinMatch) {
    const winnerId = state.players[w]
    state.status = 'completed'
    state.result = { winner: winnerId, reason: 'match_wins' }
    return { kind: 'finished', winner: winnerId }
  }
  return { kind: 'ongoing' }
}

export function startNewRound(
  state: RockPaperScissorsState,
  nextPlayers: readonly PlayerId[]
): void {
  if (nextPlayers.length !== 2) {
    throw new Error('rock_paper_scissors: roster must have exactly 2 players')
  }
  const pair = nextPlayers as readonly [PlayerId, PlayerId]
  state.players = pair
  state.wins = [0, 0]
  state.roundThrows = [null, null]
  state.lastResolvedHand = null
  state.seatCommittedThisRound = [false, false]
  state.completedRounds = 0
  state.currentTurn = pair[0]
  state.status = 'in_progress'
  state.result = null
}

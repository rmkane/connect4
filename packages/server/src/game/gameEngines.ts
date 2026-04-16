import type { AnyGameState, GameKind, GameMove, PlayerId } from '@gameroom/shared'
import { outcomeDetailPhrase, wireRockPaperScissorsForViewer } from '@gameroom/shared'

import * as connect4Session from '@/game/connect4Session.js'
import * as rpsSession from '@/game/rpsSession.js'
import type { SessionMoveResult } from '@/game/sessionTypes.js'
import { applySurrender } from '@/game/surrender.js'
import * as ticTacToeSession from '@/game/ticTacToeSession.js'

export interface GameAnnouncementContext {
  displayNameFor(playerId: PlayerId): string
}

/**
 * Strategy for one `GameKind`: create state, apply moves, rematch, surrender.
 *
 * **`minPlayers` / `maxPlayers`** bound how many seated humans must be present to start or
 * rematch. The room passes a **roster** — ordered `PlayerId[]` of length `maxPlayers` — built
 * from table seats (shuffled vs join order where games care). Larger titles (Hearts, poker)
 * raise `maxPlayers` and pair with a room whose `ROOM_TABLE_CAPACITY` matches (see
 * `PlayerRoom.createGame`).
 */
export interface RoomGameEngine {
  readonly kind: GameKind
  /** Short label for room system chat (e.g. "Connect 4"). */
  readonly chatLabel: string
  readonly minPlayers: number
  readonly maxPlayers: number
  /**
   * When false, the room does not require `state.currentTurn === playerId` before applying a move
   * (e.g. rock-paper-scissors throws in any order each round).
   */
  readonly requiresTurnOrder?: boolean
  create(roomId: string, gameSessionId: string, players: readonly PlayerId[]): AnyGameState
  applyMove(state: AnyGameState, playerId: PlayerId, move: GameMove): SessionMoveResult
  startNewRound(state: AnyGameState, players: readonly PlayerId[]): void
  surrender(state: AnyGameState, playerId: PlayerId): PlayerId
  announceGameStarted(state: AnyGameState, ctx: GameAnnouncementContext): string
  announceGameFinished(state: AnyGameState, ctx: GameAnnouncementContext): string
  /** Per-viewer snapshot shaping (optional). Default: return `state` unchanged. */
  wireActiveSnapshot?(state: AnyGameState, viewerId: PlayerId | undefined): AnyGameState
}

function defaultAnnounceFinished(
  chatLabel: string,
  g: AnyGameState,
  ctx: GameAnnouncementContext
): string {
  if (g.status !== 'completed' || !g.result) return ''
  const r = g.result
  if (r.winner === null) {
    return `${chatLabel} ended in a draw.`
  }
  const winnerName = ctx.displayNameFor(r.winner)
  if (r.reason === 'surrender') {
    const loserId = g.players[0] === r.winner ? g.players[1] : g.players[0]
    return `${ctx.displayNameFor(loserId)} surrendered — ${winnerName} wins.`
  }
  const detail = outcomeDetailPhrase(r.reason)
  return `${chatLabel} ended — ${winnerName} wins (${detail}).`
}

const connect4Engine: RoomGameEngine = {
  kind: 'connect4',
  chatLabel: 'Connect 4',
  minPlayers: 2,
  maxPlayers: 2,
  create: connect4Session.createGame,
  applyMove: (state, playerId, move) => {
    if (state.game !== 'connect4' || move.game !== 'connect4') return { kind: 'invalid' }
    return connect4Session.applyMove(state, playerId, move.column)
  },
  startNewRound: (state, players) => {
    if (state.game !== 'connect4') return
    connect4Session.startNewRound(state, players)
  },
  surrender: (state, playerId) => {
    if (state.game !== 'connect4') throw new Error('connect4 engine: wrong state')
    return applySurrender(state, playerId)
  },
  announceGameStarted: (g, ctx) => {
    if (g.game !== 'connect4' || g.status !== 'in_progress') return ''
    const opener = ctx.displayNameFor(g.currentTurn)
    return `${connect4Engine.chatLabel} started — ${opener} goes first.`
  },
  announceGameFinished: (g, ctx) => {
    if (g.game !== 'connect4') return ''
    return defaultAnnounceFinished(connect4Engine.chatLabel, g, ctx)
  },
}

const rockPaperScissorsEngine: RoomGameEngine = {
  kind: 'rock_paper_scissors',
  chatLabel: 'Rock paper scissors',
  minPlayers: 2,
  maxPlayers: 2,
  requiresTurnOrder: false,
  create: rpsSession.createGame,
  applyMove: (state, playerId, move) => {
    if (state.game !== 'rock_paper_scissors' || move.game !== 'rock_paper_scissors') {
      return { kind: 'invalid' }
    }
    return rpsSession.applyMove(state, playerId, move.throw)
  },
  startNewRound: (state, players) => {
    if (state.game !== 'rock_paper_scissors') return
    rpsSession.startNewRound(state, players)
  },
  surrender: (state, playerId) => {
    if (state.game !== 'rock_paper_scissors')
      throw new Error('rock_paper_scissors engine: wrong state')
    return applySurrender(state, playerId)
  },
  announceGameStarted: (g) => {
    if (g.game !== 'rock_paper_scissors' || g.status !== 'in_progress') return ''
    return `${rockPaperScissorsEngine.chatLabel} started — first to ${g.winsToWinMatch} hand wins takes the match.`
  },
  announceGameFinished: (g, ctx) => {
    if (g.game !== 'rock_paper_scissors') return ''
    return defaultAnnounceFinished(rockPaperScissorsEngine.chatLabel, g, ctx)
  },
  wireActiveSnapshot: (state, viewerId) => {
    if (state.game !== 'rock_paper_scissors') return state
    return wireRockPaperScissorsForViewer(state, viewerId)
  },
}

const ticTacToeEngine: RoomGameEngine = {
  kind: 'tic_tac_toe',
  chatLabel: 'Tic-tac-toe',
  minPlayers: 2,
  maxPlayers: 2,
  create: ticTacToeSession.createGame,
  applyMove: (state, playerId, move) => {
    if (state.game !== 'tic_tac_toe' || move.game !== 'tic_tac_toe') return { kind: 'invalid' }
    return ticTacToeSession.applyMove(state, playerId, move.row, move.col)
  },
  startNewRound: (state, players) => {
    if (state.game !== 'tic_tac_toe') return
    ticTacToeSession.startNewRound(state, players)
  },
  surrender: (state, playerId) => {
    if (state.game !== 'tic_tac_toe') throw new Error('tic_tac_toe engine: wrong state')
    return applySurrender(state, playerId)
  },
  announceGameStarted: (g, ctx) => {
    if (g.game !== 'tic_tac_toe' || g.status !== 'in_progress') return ''
    const opener = ctx.displayNameFor(g.currentTurn)
    return `${ticTacToeEngine.chatLabel} started — ${opener} goes first (O).`
  },
  announceGameFinished: (g, ctx) => {
    if (g.game !== 'tic_tac_toe') return ''
    return defaultAnnounceFinished(ticTacToeEngine.chatLabel, g, ctx)
  },
}

/**
 * All table engines — add a new game by appending here and extending shared `GameKind` / unions.
 */
export const REGISTERED_TABLE_GAME_ENGINES: readonly RoomGameEngine[] = [
  connect4Engine,
  ticTacToeEngine,
  rockPaperScissorsEngine,
]

const enginesByKind = Object.fromEntries(
  REGISTERED_TABLE_GAME_ENGINES.map((e) => [e.kind, e])
) as Record<GameKind, RoomGameEngine>

export function getEngine(kind: GameKind): RoomGameEngine {
  return enginesByKind[kind]
}

export function getEngineForActiveState(state: AnyGameState): RoomGameEngine {
  return enginesByKind[state.game]
}

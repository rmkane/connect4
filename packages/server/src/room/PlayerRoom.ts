import { randomUUID } from 'node:crypto'

import type { Logger } from 'pino'
import { WebSocket } from 'ws'

import type {
  AnyGameState,
  ChatMessagePayload,
  GameKind,
  GameListing,
  GameMetricsEndReason,
  GameMetricsSummary,
  GameMove,
  GamePlayerMetricRow,
  PendingRematch,
  PlayerId,
  PlayerInfo,
  RoomSeatsTuple,
  RoomSnapshot,
  ServerMessage,
  TableSeatIndex,
} from '@gameroom/shared'
import {
  CHAT_HISTORY_LIMIT,
  ROOM_TABLE_CAPACITY,
  SYSTEM_ANNOUNCEMENT_PLAYER_ID,
  TABLE_SEAT_INDICES,
  firstOpenSeatIndex,
  sanitizeChatText,
  sanitizeRoomTitle,
  seatedPlayerCount,
  tableSeatIndexForPlayer,
  wireRockPaperScissorsForViewer,
} from '@gameroom/shared'

import { getEngine, getEngineForActiveState } from '@/game/gameEngines.js'
import { logger } from '@/logger.js'

interface ActiveGameMetrics {
  gameSessionId: string
  gameStartedAt: number
  turnStartedAt: number
  nextMoveIndex: number
  turns: { playerId: PlayerId; durationMs: number; moveIndex: number }[]
}

export class PlayerRoom {
  /** Custom table label (empty = clients show room id). */
  roomTitle = ''
  /** First joiner is host; reassigned when the host leaves or passes host. */
  leaderId: PlayerId | null = null
  /** Table slots in join order (`0` = first to sit). Mutable tuple length `ROOM_TABLE_CAPACITY`. */
  seats: [PlayerInfo | null, PlayerInfo | null] = [null, null]
  private matchPoints = new Map<PlayerId, number>()
  games: GameListing[] = []
  activeGame: AnyGameState | null = null
  sockets: Map<TableSeatIndex, WebSocket> = new Map()
  private chatHistory: ChatMessagePayload[] = []
  private gameMetrics: ActiveGameMetrics | null = null
  private pendingRematch: PendingRematch | null = null
  private readonly log: Logger

  constructor(public readonly roomId: string) {
    this.log = logger.child({ room: roomId })
  }

  private snapshotScores(): Record<PlayerId, number> {
    const out: Record<PlayerId, number> = {}
    for (const idx of TABLE_SEAT_INDICES) {
      const p = this.seats[idx]
      if (p) out[p.id] = this.matchPoints.get(p.id) ?? 0
    }
    return out
  }

  /**
   * @param forPlayerId When set, rock-paper-scissors `activeGame` hides the opponent’s in-flight
   * throw until both players have committed (per-connection `room_state`).
   */
  getSnapshot(forPlayerId?: PlayerId): RoomSnapshot {
    const activeGame = this.activeGame
      ? (JSON.parse(JSON.stringify(this.activeGame)) as AnyGameState)
      : null
    const activeOut =
      activeGame && activeGame.game === 'rock_paper_scissors'
        ? wireRockPaperScissorsForViewer(activeGame, forPlayerId)
        : activeGame
    return {
      roomId: this.roomId,
      roomTitle: this.roomTitle,
      leaderId: this.leaderId,
      seats: [this.seats[0], this.seats[1]],
      matchScores: this.snapshotScores(),
      games: this.games.map((g) => ({ ...g })),
      activeGame: activeOut,
      pendingRematch: this.pendingRematch ? { ...this.pendingRematch } : null,
    }
  }

  private broadcast() {
    for (const seat of TABLE_SEAT_INDICES) {
      const ws = this.sockets.get(seat)
      if (!ws || ws.readyState !== WebSocket.OPEN) continue
      const pid = this.seats[seat]?.id
      const snapshot = this.getSnapshot(pid)
      const payload = JSON.stringify({ type: 'room_state', snapshot } satisfies {
        type: 'room_state'
        snapshot: RoomSnapshot
      })
      ws.send(payload)
    }
  }

  private appendRoomChatHistory(msg: ChatMessagePayload) {
    this.chatHistory.push(msg)
    if (this.chatHistory.length > CHAT_HISTORY_LIMIT) {
      this.chatHistory.splice(0, this.chatHistory.length - CHAT_HISTORY_LIMIT)
    }
  }

  private broadcastRoomChatLine(msg: ChatMessagePayload) {
    const payload = JSON.stringify({ type: 'chat_message', ...msg } satisfies ServerMessage)
    this.sockets.forEach((ws) => ws.readyState === WebSocket.OPEN && ws.send(payload))
  }

  private broadcastGameSummary(summary: GameMetricsSummary) {
    const payload = JSON.stringify({
      type: 'game_summary',
      summary,
    } satisfies ServerMessage)
    this.sockets.forEach((ws) => ws.readyState === WebSocket.OPEN && ws.send(payload))
  }

  private initGameMetrics(gameSessionId: string): void {
    const now = Date.now()
    this.gameMetrics = {
      gameSessionId,
      gameStartedAt: now,
      turnStartedAt: now,
      nextMoveIndex: 1,
      turns: [],
    }
  }

  private commitTurnTiming(
    playerId: PlayerId,
    gameSessionId: string,
    when: number,
    advanceTurnClock: boolean
  ): void {
    const m = this.gameMetrics
    if (!m || m.gameSessionId !== gameSessionId) return
    const durationMs = Math.max(0, when - m.turnStartedAt)
    m.turns.push({ playerId, durationMs, moveIndex: m.nextMoveIndex++ })
    if (advanceTurnClock) m.turnStartedAt = when
  }

  private perPlayerMetricRows(
    roster: readonly [PlayerId, PlayerId],
    turns: readonly { playerId: PlayerId; durationMs: number; moveIndex: number }[]
  ): readonly [GamePlayerMetricRow, GamePlayerMetricRow] {
    const build = (pid: PlayerId): GamePlayerMetricRow => {
      const mine = turns.filter((t) => t.playerId === pid)
      const totalThinkMs = mine.reduce((s, t) => s + t.durationMs, 0)
      const turnCount = mine.length
      return {
        id: pid,
        displayName: this.displayNameFor(pid),
        turnCount,
        totalThinkMs,
        avgThinkMs: turnCount > 0 ? Math.round(totalThinkMs / turnCount) : 0,
        fastestTurnMs: turnCount > 0 ? Math.min(...mine.map((t) => t.durationMs)) : 0,
        slowestTurnMs: turnCount > 0 ? Math.max(...mine.map((t) => t.durationMs)) : 0,
      }
    }
    return [build(roster[0]), build(roster[1])]
  }

  private buildGameMetricsSummary(
    g: AnyGameState,
    m: ActiveGameMetrics,
    endedAt: number,
    outcome: {
      status: 'completed' | 'abandoned'
      winnerId: PlayerId | null
      reason: GameMetricsEndReason
    }
  ): GameMetricsSummary {
    const roster = g.players
    const gameDurationMs = Math.max(0, endedAt - m.gameStartedAt)
    const p0 = roster[0]
    const p1 = roster[1]
    return {
      roomId: this.roomId,
      gameSessionId: g.gameSessionId,
      gameKind: g.game,
      endedAt,
      gameDurationMs,
      outcome,
      players: [
        {
          id: p0,
          displayName: this.displayNameFor(p0),
          seatIndex: tableSeatIndexForPlayer(this.seats as RoomSeatsTuple, p0),
        },
        {
          id: p1,
          displayName: this.displayNameFor(p1),
          seatIndex: tableSeatIndexForPlayer(this.seats as RoomSeatsTuple, p1),
        },
      ],
      roster,
      turns: m.turns.map((t) => ({ ...t })),
      byPlayer: this.perPlayerMetricRows(roster, m.turns),
    }
  }

  private finalizeGameMetrics(
    g: AnyGameState,
    outcome: {
      status: 'completed' | 'abandoned'
      winnerId: PlayerId | null
      reason: GameMetricsEndReason
    }
  ): void {
    const m = this.gameMetrics
    if (!m || m.gameSessionId !== g.gameSessionId) return
    const endedAt = Date.now()
    const summary = this.buildGameMetricsSummary(g, m, endedAt, outcome)
    this.gameMetrics = null
    this.broadcastGameSummary(summary)
  }

  /** Table host may rename the table (empty title clears the custom label). */
  setRoomTitle(playerId: PlayerId, rawTitle: string): boolean {
    if (!this.isSeatedPlayer(playerId)) return false
    if (playerId !== this.leaderId) return false
    this.roomTitle = sanitizeRoomTitle(rawTitle)
    this.broadcast()
    return true
  }

  /** Current host only — `newLeaderId` must be the other seated player. */
  transferLeadership(fromPlayerId: PlayerId, newLeaderId: PlayerId): boolean {
    if (fromPlayerId !== this.leaderId) return false
    if (!this.isSeatedPlayer(newLeaderId) || newLeaderId === fromPlayerId) return false
    const fromName = this.displayNameFor(fromPlayerId)
    const toName = this.displayNameFor(newLeaderId)
    this.leaderId = newLeaderId
    this.pushRoomSystemChat(`${fromName} passed table host to ${toName}.`)
    this.broadcast()
    return true
  }

  private displayNameFor(playerId: PlayerId): string {
    const idx = tableSeatIndexForPlayer(this.seats as RoomSeatsTuple, playerId)
    if (idx === null) return 'Player'
    return this.seats[idx]!.displayName
  }

  private gameLabel(game: AnyGameState['game']): string {
    if (game === 'connect4') return 'Connect 4'
    if (game === 'tic_tac_toe') return 'Tic-tac-toe'
    return 'Rock paper scissors'
  }

  private announceGameStarted(): void {
    const g = this.activeGame
    if (!g || g.status !== 'in_progress') return
    const opener = this.displayNameFor(g.currentTurn)
    const label = this.gameLabel(g.game)
    const text =
      g.game === 'tic_tac_toe'
        ? `${label} started — ${opener} goes first (O).`
        : g.game === 'rock_paper_scissors'
          ? `${label} started — first to ${g.winsToWinMatch} hand wins takes the match.`
          : `${label} started — ${opener} goes first.`
    this.pushRoomSystemChat(text)
  }

  private announceGameFinished(g: AnyGameState): void {
    if (g.status !== 'completed' || !g.result) return
    const label = this.gameLabel(g.game)
    const r = g.result
    if (r.winner === null) {
      this.pushRoomSystemChat(`${label} ended in a draw.`)
      return
    }
    const winnerName = this.displayNameFor(r.winner)
    if (r.reason === 'surrender') {
      const loserId = g.players[0] === r.winner ? g.players[1] : g.players[0]
      this.pushRoomSystemChat(`${this.displayNameFor(loserId)} surrendered — ${winnerName} wins.`)
      return
    }
    const phrase =
      r.reason === 'four_in_a_row'
        ? 'four in a row'
        : r.reason === 'three_in_row'
          ? 'three in a row'
          : r.reason === 'match_wins'
            ? 'match wins'
            : r.reason === 'forfeit'
              ? 'forfeit'
              : r.reason
    this.pushRoomSystemChat(`${label} ended — ${winnerName} wins (${phrase}).`)
  }

  private pushRoomSystemChat(text: string): void {
    const msg: ChatMessagePayload = {
      scope: 'room',
      roomId: this.roomId,
      senderId: SYSTEM_ANNOUNCEMENT_PLAYER_ID,
      displayName: 'Room',
      text,
      sentAt: Date.now(),
      system: true,
    }
    this.appendRoomChatHistory(msg)
    this.broadcastRoomChatLine(msg)
  }

  /** Recent room chat for a connection that just joined. */
  sendChatHistoryTo(ws: WebSocket) {
    if (this.chatHistory.length === 0) return
    const payload = JSON.stringify({
      type: 'chat_history',
      scope: 'room' as const,
      roomId: this.roomId,
      messages: [...this.chatHistory],
    })
    if (ws.readyState === WebSocket.OPEN) ws.send(payload)
  }

  sendRoomChat(playerId: PlayerId, text: string): boolean {
    if (!this.isSeatedPlayer(playerId)) return false
    const clean = sanitizeChatText(text)
    if (!clean) return false

    const idx = tableSeatIndexForPlayer(this.seats as RoomSeatsTuple, playerId)
    const info = idx !== null ? this.seats[idx] : null
    if (!info) return false

    const msg: ChatMessagePayload = {
      scope: 'room',
      roomId: this.roomId,
      senderId: playerId,
      displayName: info.displayName,
      text: clean,
      sentAt: Date.now(),
    }
    this.appendRoomChatHistory(msg)
    this.broadcastRoomChatLine(msg)
    return true
  }

  private listingFor(sessionId: string): GameListing | undefined {
    return this.games.find((g) => g.gameSessionId === sessionId)
  }

  private setListingStatus(sessionId: string, status: GameListing['status']) {
    const row = this.listingFor(sessionId)
    if (row) row.status = status
  }

  private addWin(playerId: PlayerId) {
    this.matchPoints.set(playerId, (this.matchPoints.get(playerId) ?? 0) + 1)
  }

  private isSeatedPlayer(playerId: PlayerId): boolean {
    return tableSeatIndexForPlayer(this.seats as RoomSeatsTuple, playerId) !== null
  }

  private seatedCount(): number {
    return seatedPlayerCount(this.seats as RoomSeatsTuple)
  }

  /** Whether enough seats are filled and those sockets are open for this engine's roster. */
  private allEnginePlayersConnected(engine: { maxPlayers: number }): boolean {
    if (this.seatedCount() < engine.maxPlayers) return false
    for (const idx of TABLE_SEAT_INDICES) {
      if (!this.seats[idx]) return false
      const ws = this.sockets.get(idx)
      if (!ws || ws.readyState !== WebSocket.OPEN) return false
    }
    return true
  }

  /** Random roster order so game roles are not tied to table join order. */
  private shuffledRoster(): readonly PlayerId[] {
    const a = this.seats[0]!.id
    const b = this.seats[1]!.id
    return Math.random() < 0.5 ? [a, b] : [b, a]
  }

  join(ws: WebSocket, displayName: string): { seat: TableSeatIndex; playerId: PlayerId } | null {
    const seat = firstOpenSeatIndex(this.seats as RoomSeatsTuple)
    if (seat === null) return null

    const playerId = randomUUID() as PlayerId
    this.seats[seat] = { id: playerId, displayName }
    this.sockets.set(seat, ws)

    if (this.leaderId === null) {
      this.leaderId = playerId
    }
    const leaderForJoin = this.leaderId as PlayerId

    const personal: ServerMessage = {
      type: 'joined_room',
      roomId: this.roomId,
      playerId,
      seat,
      leaderId: leaderForJoin,
    }
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(personal))

    this.log.info({ seat, playerId, displayName }, 'player seated')
    this.broadcast()
    return { seat, playerId }
  }

  createGame(kind: GameKind, requesterId: PlayerId): boolean {
    if (this.activeGame?.status === 'in_progress') return false
    if (requesterId !== this.leaderId) return false

    const engine = getEngine(kind)
    const seated = this.seatedCount()
    if (seated < engine.minPlayers || seated > engine.maxPlayers) return false
    if (engine.maxPlayers > ROOM_TABLE_CAPACITY) return false

    this.pendingRematch = null
    const gameSessionId = randomUUID()
    this.games.push({ gameSessionId, kind, status: 'in_progress' })

    const players = this.shuffledRoster()

    this.activeGame = engine.create(this.roomId, gameSessionId, players)
    this.initGameMetrics(gameSessionId)

    this.log.info({ kind, gameSessionId }, 'game created')
    this.announceGameStarted()
    this.broadcast()
    return true
  }

  handleMove(playerId: PlayerId, gameSessionId: string, move: GameMove): void {
    const g = this.activeGame
    if (!g || g.gameSessionId !== gameSessionId) return
    if (g.status !== 'in_progress') return
    if (g.game !== move.game) return
    if (!this.isSeatedPlayer(playerId)) return
    const engine = getEngineForActiveState(g)
    if (engine.requiresTurnOrder !== false && g.currentTurn !== playerId) return
    const r = engine.applyMove(g, playerId, move)
    if (r.kind === 'invalid') {
      this.log.debug({ game: g.game, playerId, move }, 'move ignored')
      return
    }
    const tAfter = Date.now()
    this.commitTurnTiming(playerId, gameSessionId, tAfter, r.kind === 'ongoing')
    if (r.kind === 'finished') {
      if (r.winner) this.addWin(r.winner)
      this.setListingStatus(g.gameSessionId, 'completed')
      this.announceGameFinished(g)
      this.log.info({ game: g.game, playerId, move, winner: r.winner }, 'game finished from move')
      this.broadcast()
      const reason = (g.result?.reason ?? 'draw') as GameMetricsEndReason
      this.finalizeGameMetrics(g, {
        status: 'completed',
        winnerId: r.winner,
        reason,
      })
    } else {
      this.log.debug({ game: g.game, playerId, move, nextTurn: g.currentTurn }, 'move applied')
      this.broadcast()
    }
  }

  /** Seated player asks the opponent to play another round (same `gameSessionId`). */
  offerRematch(playerId: PlayerId, gameSessionId: string): boolean {
    if (!this.isSeatedPlayer(playerId)) return false
    const g = this.activeGame
    if (!g || g.gameSessionId !== gameSessionId || g.status !== 'completed') return false
    if (this.pendingRematch) {
      if (
        this.pendingRematch.gameSessionId === gameSessionId &&
        this.pendingRematch.requesterId === playerId
      ) {
        return true
      }
      return false
    }
    this.pendingRematch = { gameSessionId, requesterId: playerId, offeredAt: Date.now() }
    this.pushRoomSystemChat(`${this.displayNameFor(playerId)} wants to play again.`)
    this.broadcast()
    return true
  }

  /** Opponent agrees; starts the next round if both players are still connected. */
  acceptRematch(playerId: PlayerId, gameSessionId: string): boolean {
    const p = this.pendingRematch
    if (!p || p.gameSessionId !== gameSessionId) return false
    if (playerId === p.requesterId) return false
    if (!this.isSeatedPlayer(playerId)) return false
    return this.executeRematchRound(gameSessionId)
  }

  /** Opponent turns down the pending rematch. */
  declineRematch(playerId: PlayerId, gameSessionId: string): boolean {
    const p = this.pendingRematch
    if (!p || p.gameSessionId !== gameSessionId) return false
    if (playerId === p.requesterId) return false
    if (!this.isSeatedPlayer(playerId)) return false
    this.pendingRematch = null
    this.pushRoomSystemChat(`${this.displayNameFor(playerId)} declined a rematch.`)
    this.broadcast()
    return true
  }

  /** Requester cancels before the opponent responds. */
  cancelRematchOffer(playerId: PlayerId, gameSessionId: string): boolean {
    const p = this.pendingRematch
    if (!p || p.gameSessionId !== gameSessionId || p.requesterId !== playerId) return false
    if (!this.isSeatedPlayer(playerId)) return false
    this.pendingRematch = null
    this.pushRoomSystemChat(`${this.displayNameFor(playerId)} withdrew the rematch request.`)
    this.broadcast()
    return true
  }

  /** Starts the next round after `acceptRematch`; clears `pendingRematch` on success. */
  private executeRematchRound(gameSessionId: string): boolean {
    const g = this.activeGame
    if (!g || g.gameSessionId !== gameSessionId) return false
    if (g.status !== 'completed') return false

    const engine = getEngineForActiveState(g)
    if (this.seatedCount() < engine.maxPlayers) return false
    if (!this.allEnginePlayersConnected(engine)) return false

    this.pendingRematch = null

    const nextPlayers = this.shuffledRoster()

    engine.startNewRound(g, nextPlayers)
    this.initGameMetrics(gameSessionId)

    this.setListingStatus(gameSessionId, 'in_progress')
    this.log.info({ gameSessionId }, 'new round started')
    this.announceGameStarted()
    this.broadcast()
    return true
  }

  surrender(playerId: PlayerId, gameSessionId: string): boolean {
    const g = this.activeGame
    if (!g || g.gameSessionId !== gameSessionId) return false
    if (g.status !== 'in_progress') return false
    if (!this.isSeatedPlayer(playerId)) return false

    const t = Date.now()
    this.commitTurnTiming(playerId, gameSessionId, t, false)
    const opponent = getEngineForActiveState(g).surrender(g, playerId)
    this.addWin(opponent)
    this.setListingStatus(gameSessionId, 'completed')
    this.announceGameFinished(g)
    this.log.info({ loser: playerId, winner: opponent }, 'game ended surrender')
    this.broadcast()
    this.finalizeGameMetrics(g, {
      status: 'completed',
      winnerId: opponent,
      reason: 'surrender',
    })
    return true
  }

  /** Clear a finished game so the room can pick another title. */
  dismissCompletedGame(playerId: PlayerId): boolean {
    if (!this.activeGame || this.activeGame.status !== 'completed') return false
    if (!this.isSeatedPlayer(playerId)) return false

    this.pendingRematch = null
    this.activeGame = null
    this.gameMetrics = null
    this.log.info({ playerId }, 'completed game dismissed')
    this.broadcast()
    return true
  }

  disconnect(seat: TableSeatIndex) {
    const leaving = this.seats[seat]
    const leavingId = leaving?.id ?? null
    const prevLeaderId = this.leaderId

    this.pendingRematch = null

    this.sockets.delete(seat)
    this.seats[seat] = null
    if (leaving) this.matchPoints.delete(leaving.id)

    const remaining = TABLE_SEAT_INDICES.map((i) => this.seats[i]).filter((p): p is PlayerInfo =>
      Boolean(p)
    )
    if (remaining.length === 0) {
      this.leaderId = null
    } else if (leavingId && leavingId === prevLeaderId) {
      const nextLeader = remaining[0]
      this.leaderId = nextLeader.id
      this.pushRoomSystemChat(`${nextLeader.displayName} is now table host (previous host left).`)
    } else if (!this.leaderId || !this.isSeatedPlayer(this.leaderId)) {
      // Repair stale host state so a seated player can always use host actions.
      const nextLeader = remaining[0]
      this.leaderId = nextLeader.id
      if (prevLeaderId !== nextLeader.id) {
        this.pushRoomSystemChat(`${nextLeader.displayName} is now table host.`)
      }
    }

    let abandonedForMetrics: AnyGameState | null = null
    if (this.activeGame?.status === 'in_progress') {
      const g = this.activeGame
      abandonedForMetrics = g
      this.setListingStatus(g.gameSessionId, 'abandoned')
      this.activeGame = null
    } else if (this.activeGame?.status === 'completed') {
      this.activeGame = null
    }

    if (!this.seats[0] && !this.seats[1]) {
      this.matchPoints.clear()
      this.games = []
      this.activeGame = null
      if (!abandonedForMetrics) this.gameMetrics = null
      this.chatHistory = []
      this.roomTitle = ''
      this.leaderId = null
    }

    this.log.info({ seat }, 'player disconnected')
    this.broadcast()
    if (abandonedForMetrics) {
      this.finalizeGameMetrics(abandonedForMetrics, {
        status: 'abandoned',
        winnerId: null,
        reason: 'abandoned',
      })
    }
  }
}

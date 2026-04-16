import type { Connect4State } from '@/connect4.js'
import type { RockPaperScissorsState } from '@/rockPaperScissors.js'
import type { TicTacToeState } from '@/ticTacToe.js'

/**
 * Single place to register table games for **labels and kind literals**.
 * Add a row here, extend **`AnyGameState`** below, and update **`moves.ts`** + your state module.
 */
export const TABLE_GAME_DEFINITIONS = [
  { kind: 'connect4' as const, label: 'Connect 4' },
  { kind: 'tic_tac_toe' as const, label: 'Tic-tac-toe' },
  { kind: 'rock_paper_scissors' as const, label: 'Rock paper scissors' },
] as const

export type GameKind = (typeof TABLE_GAME_DEFINITIONS)[number]['kind']

export const TABLE_GAME_KINDS: readonly GameKind[] = TABLE_GAME_DEFINITIONS.map((d) => d.kind)

export const GAME_KIND_LABELS = Object.fromEntries(
  TABLE_GAME_DEFINITIONS.map((d) => [d.kind, d.label])
) as Record<GameKind, string>

export type AnyGameState = Connect4State | TicTacToeState | RockPaperScissorsState

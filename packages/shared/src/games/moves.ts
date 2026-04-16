/**
 * All legal `game_move` payloads. Extend when you add a `GameKind` (keep in sync with `registry.ts`).
 */
export type GameMove =
  | { game: 'connect4'; column: number }
  | { game: 'tic_tac_toe'; row: number; col: number }
  | { game: 'rock_paper_scissors'; throw: 'rock' | 'paper' | 'scissors' }

import { COLS, ROWS } from '@connect4/shared'
import type { PlayerId } from '@connect4/shared'

export type Connect4Cell = PlayerId | null

export function makeBoard(): Connect4Cell[][] {
  return Array.from({ length: ROWS }, () => Array<Connect4Cell>(COLS).fill(null))
}

/** Returns the row the piece lands on, or -1 if column is full */
export function dropPiece(board: Connect4Cell[][], col: number, playerId: PlayerId): number {
  for (let row = ROWS - 1; row >= 0; row--) {
    if (board[row][col] === null) {
      board[row][col] = playerId
      return row
    }
  }
  return -1
}

export function checkWin(board: Connect4Cell[][], row: number, col: number): boolean {
  const pid = board[row][col]
  if (!pid) return false
  const directions = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ]
  return directions.some(([dr, dc]) => countLine(board, row, col, dr, dc, pid) >= 4)
}

function countLine(
  board: Connect4Cell[][],
  r: number,
  c: number,
  dr: number,
  dc: number,
  playerId: PlayerId
): number {
  let count = 1
  for (const sign of [1, -1]) {
    let nr = r + dr * sign,
      nc = c + dc * sign
    while (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && board[nr][nc] === playerId) {
      count++
      nr += dr * sign
      nc += dc * sign
    }
  }
  return count
}

export function checkDraw(board: Connect4Cell[][]): boolean {
  return board[0].every((cell) => cell !== null)
}

/** Opponent in a two-player `players` tuple. */
export function otherPlayer(players: readonly [PlayerId, PlayerId], playerId: PlayerId): PlayerId {
  return players[0] === playerId ? players[1] : players[0]
}

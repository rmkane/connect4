import type { Color, TicTacToeCell } from '@connect4/shared'

const N = 3

export function makeBoard(): TicTacToeCell[][] {
  return Array.from({ length: N }, () => Array<TicTacToeCell>(N).fill(null))
}

export function placePiece(
  board: TicTacToeCell[][],
  row: number,
  col: number,
  color: Color
): boolean {
  if (row < 0 || row >= N || col < 0 || col >= N) return false
  if (board[row][col] !== null) return false
  board[row][col] = color
  return true
}

export function checkWin(board: TicTacToeCell[][], row: number, col: number): boolean {
  const color = board[row][col]
  if (!color) return false
  const lines: [number, number][][] = [
    // row
    [
      [row, 0],
      [row, 1],
      [row, 2],
    ],
    // col
    [
      [0, col],
      [1, col],
      [2, col],
    ],
  ]
  if (row === col) {
    lines.push([
      [0, 0],
      [1, 1],
      [2, 2],
    ])
  }
  if (row + col === 2) {
    lines.push([
      [0, 2],
      [1, 1],
      [2, 0],
    ])
  }
  return lines.some((cells) => cells.every(([r, c]) => board[r][c] === color))
}

export function checkDraw(board: TicTacToeCell[][]): boolean {
  return board.every((row) => row.every((c) => c !== null))
}

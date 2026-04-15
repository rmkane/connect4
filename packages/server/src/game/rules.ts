import { COLS, Cell, Color, ROWS } from '@connect4/shared'

export function makeBoard(): Cell[][] {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null))
}

// Returns the row the piece lands on, or -1 if column is full
export function dropPiece(board: Cell[][], col: number, color: Color): number {
  for (let row = ROWS - 1; row >= 0; row--) {
    if (board[row][col] === null) {
      board[row][col] = color
      return row
    }
  }
  return -1
}

export function checkWin(board: Cell[][], row: number, col: number): boolean {
  const color = board[row][col]
  if (!color) return false
  const directions = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ]
  return directions.some(([dr, dc]) => countLine(board, row, col, dr, dc, color) >= 4)
}

function countLine(
  board: Cell[][],
  r: number,
  c: number,
  dr: number,
  dc: number,
  color: Color
): number {
  let count = 1
  for (const sign of [1, -1]) {
    let nr = r + dr * sign,
      nc = c + dc * sign
    while (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && board[nr][nc] === color) {
      count++
      nr += dr * sign
      nc += dc * sign
    }
  }
  return count
}

export function checkDraw(board: Cell[][]): boolean {
  return board[0].every((cell) => cell !== null)
}

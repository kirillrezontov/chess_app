/**
 * Minimal FEN parser — returns an 8×8 grid.
 * Empty squares are '' (empty string).
 * Piece characters: K Q R B N P k q r b n p.
 */
export type BoardGrid = string[][]; // [row][col], row 0 = rank 8

export function parseFEN(fen: string): BoardGrid {
  if (!fen) return Array.from({ length: 8 }, () => Array(8).fill(''));
  const rows = fen.split(' ')[0].split('/');
  const grid: BoardGrid = [];
  for (let r = 0; r < 8; r++) {
    grid[r] = [];
    let col = 0;
    for (const ch of rows[r]) {
      if (ch >= '1' && ch <= '8') {
        const count = parseInt(ch, 10);
        for (let i = 0; i < count; i++) grid[r][col++] = '';
      } else {
        grid[r][col++] = ch;
      }
    }
  }
  return grid;
}

/** Convert (row, col) to algebraic square name like "e4". */
export function toSquareName(row: number, col: number): string {
  return String.fromCharCode(97 + col) + (8 - row);
}

/** Convert algebraic name like "e4" to (row, col). */
export function fromSquareName(name: string): [number, number] {
  const col = name.charCodeAt(0) - 97;
  const row = 8 - parseInt(name[1], 10);
  return [row, col];
}

/** True if the piece character belongs to white. */
export function isWhitePiece(piece: string): boolean {
  return piece !== '' && piece === piece.toUpperCase();
}
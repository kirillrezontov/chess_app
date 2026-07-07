import { useMemo } from 'react';
import { parseFEN, toSquareName, type BoardGrid } from '@/utils/fen';
import type { Color, LastMove } from '@/types';

// Map FEN piece characters to SVG file names.
// To use custom textures, replace these SVG files in public/pieces/
// (you can also swap the extension — just update the path here).
const PIECE_IMAGE: Record<string, string> = {
  K: '/pieces/wK.svg',
  Q: '/pieces/wQ.svg',
  R: '/pieces/wR.svg',
  B: '/pieces/wB.svg',
  N: '/pieces/wN.svg',
  P: '/pieces/wP.svg',
  k: '/pieces/bK.svg',
  q: '/pieces/bQ.svg',
  r: '/pieces/bR.svg',
  b: '/pieces/bB.svg',
  n: '/pieces/bN.svg',
  p: '/pieces/bP.svg',
};

export interface BoardProps {
  fen: string;
  turn: Color;
  inCheck: boolean;
  lastMove: LastMove | null;
  selectedSquare: string | null;
  myColor: Color | null;
  gameOver: boolean;
  onSquareClick: (square: string, piece: string) => void;
}

export function Board({
  fen,
  turn,
  inCheck,
  lastMove,
  selectedSquare,
  myColor,
  gameOver,
  onSquareClick,
}: BoardProps) {
  const grid: BoardGrid = useMemo(() => parseFEN(fen), [fen]);
  const flipped = myColor === 'black';

  // Find king position for check highlight
  const kingPos = useMemo(() => {
    if (!inCheck || !myColor) return null;
    const king = myColor === 'white' ? 'K' : 'k';
    for (let r = 0; r < 8; r++)
      for (let c = 0; c < 8; c++)
        if (grid[r][c] === king) return `${r},${c}`;
    return null;
  }, [grid, inCheck, myColor]);

  const squares: JSX.Element[] = [];
  for (let ri = 0; ri < 8; ri++) {
    for (let ci = 0; ci < 8; ci++) {
      // Map visual position to actual board coordinates.
      // When flipped, row 0 visually shows rank 1 (board row 7).
      const r = flipped ? 7 - ri : ri;
      const c = flipped ? 7 - ci : ci;

      const isLight = (r + c) % 2 === 0;
      const name = toSquareName(r, c);
      const piece = grid[r][c];
      const isKingCheck = kingPos === `${r},${c}`;
      const isSelected = selectedSquare === name;
      const isLastMove =
        lastMove && (name === lastMove.from || name === lastMove.to);

      let className = `sq ${isLight ? 'sq-light' : 'sq-dark'}`;
      if (isSelected) className += ' sq-selected';
      if (isLastMove) className += ' sq-lastmove';
      if (isKingCheck) className += ' sq-check';

      // Only allow clicking if it's our turn and game isn't over
      const clickable = myColor && turn === myColor && !gameOver;

      squares.push(
        <button
          key={`${ri}-${ci}`}
          className={className}
          data-square={name}
          onClick={() => clickable && onSquareClick(name, piece)}
          type="button"
        >
          {piece && (
            <img
              className="piece-img"
              src={PIECE_IMAGE[piece] || `/pieces/${piece}.svg`}
              alt={piece}
              draggable={false}
            />
          )}
          {/* Rank label: show on the visually leftmost column */}
          {ci === 0 && (
            <span className={`coord coord-rank ${isLight ? 'coord-on-light' : 'coord-on-dark'}`}>
              {8 - r}
            </span>
          )}
          {/* File label: show on the visually bottom row */}
          {ri === 7 && (
            <span className={`coord coord-file ${isLight ? 'coord-on-light' : 'coord-on-dark'}`}>
              {String.fromCharCode(97 + c)}
            </span>
          )}
        </button>,
      );
    }
  }

  return <div className="board">{squares}</div>;
}
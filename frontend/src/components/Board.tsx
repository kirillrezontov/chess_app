import { useMemo } from 'react';
import { parseFEN, toSquareName, type BoardGrid } from '@/utils/fen';
import type { Color, LastMove } from '@/types';

const PIECE_CHAR: Record<string, string> = {
  K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙',
  k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟',
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
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
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
          key={name}
          className={className}
          data-square={name}
          onClick={() => clickable && onSquareClick(name, piece)}
          type="button"
        >
          {piece && <span className="piece">{PIECE_CHAR[piece] || piece}</span>}
          {c === 0 && <span className="coord coord-rank">{8 - r}</span>}
          {r === 7 && <span className="coord coord-file">{String.fromCharCode(97 + c)}</span>}
        </button>,
      );
    }
  }

  return <div className="board">{squares}</div>;
}
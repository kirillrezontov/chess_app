import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { parseFEN, toSquareName, type BoardGrid } from '@/utils/fen';
import type { Color, LastMove } from '@/types';

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
  loserKingSq: string | null;
  legalTargets: string[];
  legalCaptures: string[];
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
  loserKingSq,
  legalTargets,
  legalCaptures,
  onSquareClick,
}: BoardProps) {
  const grid: BoardGrid = useMemo(() => parseFEN(fen), [fen]);
  const flipped = myColor === 'black';

  const kingPos = useMemo(() => {
    if (!inCheck || !myColor) return null;
    const king = myColor === 'white' ? 'K' : 'k';
    for (let r = 0; r < 8; r++)
      for (let c = 0; c < 8; c++)
        if (grid[r][c] === king) return `${r},${c}`;
    return null;
  }, [grid, inCheck, myColor]);

  const isLegalTarget = (name: string) => legalTargets.includes(name);
  const isLegalCapture = (name: string) => legalCaptures.includes(name);
  const isLoserKing = (name: string) => loserKingSq === name;

  const squares: JSX.Element[] = [];
  for (let ri = 0; ri < 8; ri++) {
    for (let ci = 0; ci < 8; ci++) {
      const r = flipped ? 7 - ri : ri;
      const c = flipped ? 7 - ci : ci;

      const isLight = (r + c) % 2 === 0;
      const name = toSquareName(r, c);
      const piece = grid[r][c];
      const isKingCheck = kingPos === `${r},${c}`;
      const isSelected = selectedSquare === name;
      const isLastMove =
        lastMove && (name === lastMove.from || name === lastMove.to);
      const showDot = isLegalTarget(name);
      const showCaptureRing = isLegalCapture(name);
      const showCheckmateGlow = gameOver && isLoserKing(name);

      let className = `sq ${isLight ? 'sq-light' : 'sq-dark'}`;
      if (isSelected) className += ' sq-selected';
      if (isLastMove) className += ' sq-lastmove';
      if (isKingCheck) className += ' sq-check';

      const clickable = myColor && turn === myColor && !gameOver;

      squares.push(
        <button
          key={`${ri}-${ci}`}
          className={className}
          data-square={name}
          onClick={() => clickable && onSquareClick(name, piece)}
          type="button"
        >
          {piece && !showCaptureRing && (
            <motion.img
              className={`piece-img ${showCheckmateGlow ? 'piece-checkmate-glow' : ''}`}
              src={PIECE_IMAGE[piece] || `/pieces/${piece}.svg`}
              alt={piece}
              draggable={false}
              initial={false}
              animate={showCheckmateGlow
                ? { scale: [1, 1.15, 1, 1.15, 1], filter: ['brightness(1)', 'brightness(2) drop-shadow(0 0 12px rgba(255,0,0,0.9))', 'brightness(1)', 'brightness(2) drop-shadow(0 0 12px rgba(255,0,0,0.9))', 'brightness(1)'] }
                : { scale: 1, filter: 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.35))' }
              }
              transition={showCheckmateGlow
                ? { duration: 1.5, repeat: Infinity, ease: 'easeInOut' }
                : { duration: 0.15 }
              }
            />
          )}
          {/* Capture ring — piece shown inside ring */}
          {piece && showCaptureRing && (
            <>
              <motion.div
                className="capture-ring"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              />
              <motion.img
                className="piece-img"
                src={PIECE_IMAGE[piece] || `/pieces/${piece}.svg`}
                alt={piece}
                draggable={false}
                style={{ position: 'relative', zIndex: 1 }}
              />
            </>
          )}
          {/* Legal move dot (empty square) */}
          {showDot && !piece && (
            <motion.div
              className="legal-dot"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            />
          )}
          {/* Legal move dot (occupied square = capture) shown above */}
          {showDot && piece && !showCaptureRing && (
            <motion.div
              className="legal-dot"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            />
          )}
          {/* Rank label */}
          {ci === 0 && (
            <span className={`coord coord-rank ${isLight ? 'coord-on-light' : 'coord-on-dark'}`}>
              {8 - r}
            </span>
          )}
          {/* File label */}
          {ri === 7 && (
            <span className={`coord coord-file ${isLight ? 'coord-on-light' : 'coord-on-dark'}`}>
              {String.fromCharCode(97 + c)}
            </span>
          )}
          {/* Checkmate glow overlay on the king square */}
          {showCheckmateGlow && (
            <motion.div
              className="checkmate-glow"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0.3, 0.8, 0.3] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
            />
          )}
        </button>,
      );
    }
  }

  return <div className="board">{squares}</div>;
}
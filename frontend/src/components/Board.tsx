import { useMemo, useState, useEffect, useCallback } from 'react';
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
  status: string;
  lastMove: LastMove | null;
  selectedSquare: string | null;
  myColor: Color | null;
  gameOver: boolean;
  loserKingSq: string | null;
  legalTargets: string[];
  legalCaptures: string[];
  onSquareClick: (square: string, piece: string) => void;
}

/* ── Animation presets ── */

const NORMAL_ANIMATE = { scale: 1, filter: 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.35))' };
const NORMAL_TRANSITION = { duration: 0.15 };

const CHECK_ANIMATE = {
  scale: [1, 1.12, 1, 1.12, 1] as number[],
  filter: [
    'brightness(1)',
    'brightness(1.8) drop-shadow(0 0 10px rgba(255, 80, 0, 0.85))',
    'brightness(1)',
    'brightness(1.8) drop-shadow(0 0 10px rgba(255, 80, 0, 0.85))',
    'brightness(1)',
  ] as string[],
};
const CHECK_TRANSITION = { duration: 1.5, repeat: Infinity, ease: 'easeInOut' as const };

// Checkmate phase 1: jump up → fall sideways → rotate 90°
const MATE_FALL_ANIMATE = {
  y: [0, -35, -35, 0],
  rotate: [0, -8, 15, 90],
  x: [0, 0, 5, 15],
  scale: [1, 1.12, 1.08, 0.85],
  filter: [
    'brightness(1) drop-shadow(0 1px 2px rgba(0,0,0,0.35))',
    'brightness(1) drop-shadow(0 1px 2px rgba(0,0,0,0.35))',
    'brightness(1.3) drop-shadow(0 0 8px rgba(255,0,0,0.5))',
    'brightness(1) drop-shadow(0 0 5px rgba(255,0,0,0.5))',
  ],
};
const MATE_FALL_TRANSITION = {
  duration: 0.8,
  times: [0, 0.25, 0.5, 1] as number[],
  ease: [0.22, 1, 0.36, 1] as number[],
};

// Checkmate phase 2: stay fallen + pulsing red glow
const MATE_GLOW_ANIMATE = {
  y: 0,
  rotate: 90,
  x: 15,
  scale: [0.85, 1.05, 0.85, 1.05, 0.85] as number[],
  filter: [
    'brightness(1) drop-shadow(0 0 5px rgba(255,0,0,0.5))',
    'brightness(2.2) drop-shadow(0 0 16px rgba(255,0,0,0.95))',
    'brightness(1) drop-shadow(0 0 5px rgba(255,0,0,0.5))',
    'brightness(2.2) drop-shadow(0 0 16px rgba(255,0,0,0.95))',
    'brightness(1) drop-shadow(0 0 5px rgba(255,0,0,0.5))',
  ] as string[],
};
const MATE_GLOW_TRANSITION = { duration: 1.2, repeat: Infinity, ease: 'easeInOut' as const };

/* ── Component ── */

export function Board({
  fen,
  turn,
  inCheck,
  status,
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

  // Checkmate two-phase animation state
  const [matePhase, setMatePhase] = useState<'fall' | 'glow'>('fall');

  // When a new checkmate is detected, restart from the fall phase
  useEffect(() => {
    if (loserKingSq && gameOver && status === 'checkmate') {
      setMatePhase('fall');
    }
  }, [loserKingSq, gameOver, status]);

  // After the fall animation completes, switch to glow
  useEffect(() => {
    if (gameOver && status === 'checkmate' && loserKingSq && matePhase === 'fall') {
      const timer = setTimeout(() => setMatePhase('glow'), 900);
      return () => clearTimeout(timer);
    }
  }, [gameOver, status, loserKingSq, matePhase]);

  // Find the king that is in check — use `turn` (the side to move),
  // NOT `myColor`, because `inCheck` means the side to move is in check.
  const checkedKingSq = useMemo(() => {
    if (!inCheck || gameOver) return null;
    const king = turn === 'white' ? 'K' : 'k';
    for (let r = 0; r < 8; r++)
      for (let c = 0; c < 8; c++)
        if (grid[r][c] === king) return toSquareName(r, c);
    return null;
  }, [grid, inCheck, turn, gameOver]);

  const isCheckmate = gameOver && status === 'checkmate';

  const isLegalTarget = (name: string) => legalTargets.includes(name);
  const isLegalCapture = (name: string) => legalCaptures.includes(name);

  // Per-square animation state
  const getKingState = useCallback(
    (name: string): 'none' | 'check' | 'mate-fall' | 'mate-glow' => {
      if (isCheckmate && loserKingSq === name) {
        return matePhase === 'fall' ? 'mate-fall' : 'mate-glow';
      }
      if (!gameOver && inCheck && checkedKingSq === name) {
        return 'check';
      }
      return 'none';
    },
    [isCheckmate, loserKingSq, matePhase, gameOver, inCheck, checkedKingSq],
  );

  const getAnimate = useCallback(
    (name: string) => {
      const ks = getKingState(name);
      if (ks === 'check') return CHECK_ANIMATE;
      if (ks === 'mate-fall') return MATE_FALL_ANIMATE;
      if (ks === 'mate-glow') return MATE_GLOW_ANIMATE;
      return NORMAL_ANIMATE;
    },
    [getKingState],
  );

  const getTransition = useCallback(
    (name: string) => {
      const ks = getKingState(name);
      if (ks === 'check') return CHECK_TRANSITION;
      if (ks === 'mate-fall') return MATE_FALL_TRANSITION;
      if (ks === 'mate-glow') return MATE_GLOW_TRANSITION;
      return NORMAL_TRANSITION;
    },
    [getKingState],
  );

  const squares: JSX.Element[] = [];
  for (let ri = 0; ri < 8; ri++) {
    for (let ci = 0; ci < 8; ci++) {
      const r = flipped ? 7 - ri : ri;
      const c = flipped ? 7 - ci : ci;

      const isLight = (r + c) % 2 === 0;
      const name = toSquareName(r, c);
      const piece = grid[r][c];
      const isSelected = selectedSquare === name;
      const isLastMove =
        lastMove && (name === lastMove.from || name === lastMove.to);
      const showDot = isLegalTarget(name);
      const showCaptureRing = isLegalCapture(name);
      const showCheckGlow = !gameOver && inCheck && checkedKingSq === name;
      const showCheckmateGlow = isCheckmate && loserKingSq === name;

      let className = `sq ${isLight ? 'sq-light' : 'sq-dark'}`;
      if (isSelected) className += ' sq-selected';
      if (isLastMove) className += ' sq-lastmove';

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
              className="piece-img"
              src={PIECE_IMAGE[piece] || `/pieces/${piece}.svg`}
              alt={piece}
              draggable={false}
              initial={false}
              animate={getAnimate(name)}
              transition={getTransition(name)}
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
          {/* Check glow overlay on the checked king's square */}
          {showCheckGlow && (
            <motion.div
              className="check-glow"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0.3, 0.7, 0.3] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
            />
          )}
          {/* Checkmate glow overlay on the mated king's square */}
          {showCheckmateGlow && (
            <motion.div
              className="checkmate-glow"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0.3, 0.8, 0.3] }}
              transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
            />
          )}
        </button>,
      );
    }
  }

  return <div className="board">{squares}</div>;
}
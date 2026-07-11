import { useEffect, useState, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { games } from '@/api/client';
import { Board } from './Board';
import { MoveList } from './MoveList';
import type { GameReviewData } from '@/types';
import '@/styles/game.css';

const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export function GameReviewScreen() {
  const { reviewGameId, setScreen } = useAuth();
  const [data, setData] = useState<GameReviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [step, setStep] = useState(0); // 0 = starting position, 1..N = after move N

  useEffect(() => {
    if (!reviewGameId) return;
    setLoading(true);
    setError('');
    games.getMoves(reviewGameId)
      .then((d) => {
        setData(d);
        // Jump to the end by default
        setStep(d.moves.length);
      })
      .catch((e) => {
        console.error('[Review] failed to load game:', e);
        setError('Failed to load game');
      })
      .finally(() => setLoading(false));
  }, [reviewGameId]);

  const handleLeave = () => setScreen('lobby');

  // Build an array of FENs: index 0 = starting, index i = after move i
  const fens = useMemo(() => {
    if (!data) return [STARTING_FEN];
    const arr = [STARTING_FEN];
    for (const m of data.moves) {
      arr.push(m.fen_after || STARTING_FEN);
    }
    return arr;
  }, [data]);

  // Current FEN and turn at the selected step
  const currentFen = fens[step] || STARTING_FEN;
  const turn = currentFen.includes(' w ') ? 'white' as const : 'black' as const;

  // Determine if the previous move was a capture for last-move highlighting
  const lastMoveForStep = useMemo((): { from: string; to: string } | null => {
    if (step === 0 || !data) return null;
    const m = data.moves[step - 1];
    if (!m) return null;
    // We need to reconstruct from/to from the FEN diff.
    // Since we only have notation, we can't easily do that.
    // The board just won't show last-move highlight in review — that's fine.
    return null;
  }, [step, data]);

  // Move strings for MoveList
  const moveStrings = useMemo(() => {
    if (!data) return [];
    return data.moves.map(m => m.ply);
  }, [data]);

  const goStart = useCallback(() => setStep(0), []);
  const goPrev = useCallback(() => setStep(s => Math.max(0, s - 1)), []);
  const goNext = useCallback(() => setStep(s => Math.min(data?.moves.length ?? 0, s + 1)), [data]);
  const goEnd = useCallback(() => setStep(data?.moves.length ?? 0), [data]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); goPrev(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); goNext(); }
      else if (e.key === 'Home') { e.preventDefault(); goStart(); }
      else if (e.key === 'End') { e.preventDefault(); goEnd(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [goPrev, goNext, goStart, goEnd]);

  // Outcome text
  let outcomeText = '';
  if (data?.outcome === 'draw') outcomeText = 'Draw';
  else if (data?.outcome === 'white_win') outcomeText = data.your_color === 'white' ? 'You won!' : 'You lost.';
  else if (data?.outcome === 'black_win') outcomeText = data.your_color === 'black' ? 'You won!' : 'You lost.';

  return (
    <div className="game-screen">
      <header className="game-header">
        <h1>Game #{reviewGameId} — Review</h1>
        <button className="btn btn-ghost btn-sm" onClick={handleLeave} type="button">
          &larr; Lobby
        </button>
      </header>

      <div className="game-layout">
        <Board
          fen={currentFen}
          turn={turn}
          inCheck={false}
          status=""
          lastMove={lastMoveForStep}
          selectedSquare={null}
          myColor={data?.your_color || null}
          gameOver={true}
          loserKingSq={null}
          legalTargets={[]}
          legalCaptures={[]}
          onSquareClick={() => {}}
        />

        <div className="game-sidebar">
          {/* Opponent info */}
          <div className="player-bar">
            <div className="player-info">
              <span className="color-dot" data-color={data?.your_color === 'white' ? 'black' : 'white'} />
              <span className="player-name">{data?.opponent || 'Opponent'}</span>
            </div>
            <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
              {data?.your_color === 'white' ? '⬛' : '⬜'}
            </span>
          </div>

          {outcomeText && step === (data?.moves.length ?? 0) && (
            <motion.div
              className="status-bar status-over"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
            >
              {outcomeText}
            </motion.div>
          )}

          {/* Player info */}
          <div className="player-bar">
            <div className="player-info">
              <span className="color-dot" data-color={data?.your_color || 'white'} />
              <span className="player-name">You</span>
            </div>
          </div>

          <MoveList moves={moveStrings} activeMoveIndex={step} onMoveClick={setStep} />

          {/* Navigation bar */}
          {data && data.moves.length > 0 && (
            <div className="review-nav">
              <button
                className="btn btn-ghost btn-sm"
                onClick={goStart}
                disabled={step === 0}
                title="Start (Home)"
                type="button"
              >
                ⏮
              </button>
              <button
                className="btn btn-ghost btn-sm"
                onClick={goPrev}
                disabled={step === 0}
                title="Previous (←)"
                type="button"
              >
                ◀
              </button>
              <span className="review-step-label">
                {step} / {data.moves.length}
              </span>
              <button
                className="btn btn-ghost btn-sm"
                onClick={goNext}
                disabled={step === data.moves.length}
                title="Next (→)"
                type="button"
              >
                ▶
              </button>
              <button
                className="btn btn-ghost btn-sm"
                onClick={goEnd}
                disabled={step === data.moves.length}
                title="End (End)"
                type="button"
              >
                ⏭
              </button>
            </div>
          )}
        </div>
      </div>

      {(loading || error) && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          background: 'rgba(10,15,26,0.8)', zIndex: 50,
        }}>
          {loading && <div className="spinner" />}
          {error && <p className="field-error">{error}</p>}
        </div>
      )}
    </div>
  );
}
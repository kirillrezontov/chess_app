import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { useGameWebSocket } from '@/hooks/useGameWebSocket';
import { games } from '@/api/client';
import { Board } from './Board';
import { ClockBar } from './ClockBar';
import { MoveList } from './MoveList';
import { PromotionDialog } from './PromotionDialog';
import { DrawOfferDialog } from './DrawOfferDialog';
import { isWhitePiece } from '@/utils/fen';
import type { GameInfo } from '@/types';
import '@/styles/game.css';

interface PendingPromo {
  from: string;
  to: string;
}

export function GameScreen() {
  const { token, username, myColor, setMyColor, gameId, setScreen } = useAuth();
  const { state, displayClocks, legalTargets, send } = useGameWebSocket(gameId, token);

  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [selectedPiece, setSelectedPiece] = useState<string>('');
  const [pendingPromo, setPendingPromo] = useState<PendingPromo | null>(null);
  const [opponentName, setOpponentName] = useState('Opponent');

  // Fetch game info
  useEffect(() => {
    if (!gameId) return;
    setMyColor(null);
    games.get(gameId).then((g: GameInfo) => {
      console.log('[Game] fetched game info:', JSON.stringify(g));
      if (g.your_color === 'white' || g.your_color === 'black') {
        setMyColor(g.your_color);
      }
      setOpponentName(g.opponent_username || 'Opponent');
    }).catch((err) => {
      console.error('[Game] failed to fetch game info:', err);
    });
  }, [gameId, setMyColor]);

  const isPawnPromotion = useCallback(
    (piece: string, to: string): boolean => {
      if (!myColor) return false;
      if (piece.toLowerCase() !== 'p') return false;
      const toRow = 8 - parseInt(to[1], 10);
      if (myColor === 'white' && toRow === 0) return true;
      if (myColor === 'black' && toRow === 7) return true;
      return false;
    },
    [myColor],
  );

  const handleSquareClick = useCallback(
    (square: string, piece: string) => {
      if (pendingPromo) return;
      if (!myColor || state.turn !== myColor || state.outcome) return;

      if (selectedSquare) {
        if (square === selectedSquare) {
          setSelectedSquare(null);
          setSelectedPiece('');
          return;
        }
        if (isPawnPromotion(selectedPiece, square)) {
          setPendingPromo({ from: selectedSquare, to: square });
          setSelectedSquare(null);
          setSelectedPiece('');
          return;
        }
        send({ type: 'move', from: selectedSquare, to: square, promotion: '' });
        setSelectedSquare(null);
        setSelectedPiece('');
      } else {
        if (!piece) return;
        const pieceIsWhite = isWhitePiece(piece);
        if (
          (myColor === 'white' && pieceIsWhite) ||
          (myColor === 'black' && !pieceIsWhite)
        ) {
          setSelectedSquare(square);
          setSelectedPiece(piece);
          // Request legal targets from server
          send({ type: 'legal_targets', from: square });
        }
      }
    },
    [selectedSquare, selectedPiece, myColor, state.turn, state.outcome, pendingPromo, send, isPawnPromotion],
  );

  const handlePromotion = useCallback(
    (piece: 'q' | 'r' | 'b' | 'n') => {
      if (!pendingPromo) return;
      send({
        type: 'move',
        from: pendingPromo.from,
        to: pendingPromo.to,
        promotion: piece,
      });
      setPendingPromo(null);
    },
    [pendingPromo, send],
  );

  const handleResign = useCallback(() => {
    send({ type: 'resign' });
  }, [send]);

  const handleDraw = useCallback(() => {
    send({ type: 'offer_draw' });
  }, [send]);

  const handleDrawResponse = useCallback((accept: boolean) => {
    send({ type: 'draw_response', accept });
  }, [send]);

  const handleLeave = useCallback(() => {
    setScreen('lobby');
  }, [setScreen]);

  const gameOver = state.outcome !== '';

  // Determine if opponent offered a draw (draw_offered is the opponent's color)
  const opponentOfferedDraw = state.drawOffered && state.drawOffered !== myColor;
  const iOfferedDraw = state.drawOffered === myColor;

  // Status text
  let statusText: string;
  if (state.error) {
    statusText = state.error;
  } else if (state.outcome === 'white_win') {
    statusText = myColor === 'white' ? 'You won!' : 'You lost.';
  } else if (state.outcome === 'black_win') {
    statusText = myColor === 'black' ? 'You won!' : 'You lost.';
  } else if (state.outcome === 'draw') {
    statusText = 'Draw.';
  } else if (state.outcome) {
    statusText = `Game over: ${state.outcome}`;
  } else if (state.status === 'checkmate') {
    statusText = 'Checkmate!';
  } else if (state.status === 'stalemate') {
    statusText = 'Stalemate — Draw';
  } else if (state.inCheck) {
    statusText = state.turn === myColor ? 'Check — Your turn' : 'Check — Opponent thinking';
  } else if (iOfferedDraw) {
    statusText = 'Waiting for opponent to accept draw…';
  } else if (!state.connected) {
    statusText = 'Connecting…';
  } else {
    statusText = state.turn === myColor ? 'Your turn' : 'Opponent thinking';
  }

  const topIsBlack = myColor === 'white';

  return (
    <div className="game-screen">
      <header className="game-header">
        <h1>Game #{gameId}</h1>
        <button className="btn btn-ghost btn-sm" onClick={handleLeave} type="button">
          &larr; Lobby
        </button>
      </header>

      <div className="game-layout">
        <Board
          fen={state.fen}
          turn={state.turn}
          inCheck={state.inCheck}
          lastMove={state.lastMove}
          selectedSquare={selectedSquare}
          myColor={myColor}
          gameOver={gameOver}
          loserKingSq={state.loserKingSq}
          legalTargets={legalTargets?.targets || []}
          legalCaptures={legalTargets?.captures || []}
          onSquareClick={handleSquareClick}
        />

        <div className="game-sidebar">
          <ClockBar
            name={opponentName}
            clockMs={topIsBlack ? displayClocks.black : displayClocks.white}
            color={topIsBlack ? 'black' : 'white'}
            isActive={state.turn === (topIsBlack ? 'black' : 'white') && !gameOver}
            position="top"
          />

          <motion.div
            className={`status-bar ${gameOver ? 'status-over' : ''} ${state.error ? 'status-error' : ''}`}
            key={statusText}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            {statusText}
          </motion.div>

          <ClockBar
            name={username || 'You'}
            clockMs={topIsBlack ? displayClocks.white : displayClocks.black}
            color={topIsBlack ? 'white' : 'black'}
            isActive={state.turn === (topIsBlack ? 'white' : 'black') && !gameOver}
            position="bottom"
          />

          {!gameOver && (
            <div className="game-controls">
              <button className="btn btn-outline" onClick={handleDraw} type="button" disabled={iOfferedDraw}>
                {iOfferedDraw ? 'Draw Sent' : 'Offer Draw'}
              </button>
              <button className="btn btn-danger" onClick={handleResign} type="button">
                Resign
              </button>
            </div>
          )}

          <MoveList moves={state.moveList} />
        </div>
      </div>

      <AnimatePresence>
        {pendingPromo && myColor && (
          <PromotionDialog color={myColor} onSelect={handlePromotion} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {opponentOfferedDraw && !gameOver && (
          <DrawOfferDialog
            onAccept={() => handleDrawResponse(true)}
            onDecline={() => handleDrawResponse(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useGameWebSocket } from '@/hooks/useGameWebSocket';
import { games } from '@/api/client';
import { Board } from './Board';
import { ClockBar } from './ClockBar';
import { MoveList } from './MoveList';
import { PromotionDialog } from './PromotionDialog';
import { isWhitePiece } from '@/utils/fen';
import type { GameInfo } from '@/types';
import '@/styles/game.css';

interface PendingPromo {
  from: string;
  to: string;
}

export function GameScreen() {
  const { token, username, myColor, setMyColor, gameId, setScreen } = useAuth();
  const { state, send } = useGameWebSocket(gameId, token);

  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [pendingPromo, setPendingPromo] = useState<PendingPromo | null>(null);
  const [opponentName, setOpponentName] = useState('Opponent');

  // Fetch game info — backend returns your_color and opponent_username
  // based on the JWT token, so no user IDs are needed on the frontend.
  useEffect(() => {
    if (!gameId) return;

    // Clear stale color from a previous game
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
    (_from: string, to: string): boolean => {
      if (!myColor) return false;
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
          return;
        }
        if (isPawnPromotion(selectedSquare, square)) {
          setPendingPromo({ from: selectedSquare, to: square });
          setSelectedSquare(null);
          return;
        }
        send({ type: 'move', from: selectedSquare, to: square, promotion: '' });
        setSelectedSquare(null);
      } else {
        if (!piece) return;
        const pieceIsWhite = isWhitePiece(piece);
        if (
          (myColor === 'white' && pieceIsWhite) ||
          (myColor === 'black' && !pieceIsWhite)
        ) {
          setSelectedSquare(square);
        }
      }
    },
    [selectedSquare, myColor, state.turn, state.outcome, pendingPromo, send, isPawnPromotion],
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

  const handleLeave = useCallback(() => {
    setScreen('lobby');
  }, [setScreen]);

  const gameOver = state.outcome !== '';

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
          onSquareClick={handleSquareClick}
        />

        <div className="game-sidebar">
          <ClockBar
            name={opponentName}
            clockMs={topIsBlack ? state.blackClockMs : state.whiteClockMs}
            color={topIsBlack ? 'black' : 'white'}
            isActive={state.turn === (topIsBlack ? 'black' : 'white') && !gameOver}
            position="top"
          />

          <div className={`status-bar ${gameOver ? 'status-over' : ''} ${state.error ? 'status-error' : ''}`}>
            {statusText}
          </div>

          <ClockBar
            name={username || 'You'}
            clockMs={topIsBlack ? state.whiteClockMs : state.blackClockMs}
            color={topIsBlack ? 'white' : 'black'}
            isActive={state.turn === (topIsBlack ? 'white' : 'black') && !gameOver}
            position="bottom"
          />

          {!gameOver && (
            <div className="game-controls">
              <button className="btn btn-outline" onClick={handleDraw} type="button">
                Offer Draw
              </button>
              <button className="btn btn-danger" onClick={handleResign} type="button">
                Resign
              </button>
            </div>
          )}

          <MoveList moves={state.moveList} />
        </div>
      </div>

      {pendingPromo && myColor && (
        <PromotionDialog color={myColor} onSelect={handlePromotion} />
      )}
    </div>
  );
}
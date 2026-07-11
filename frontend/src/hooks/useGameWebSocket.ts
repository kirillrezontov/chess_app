import { useEffect, useRef, useCallback, useState } from 'react';
import { buildGameWsUrl } from '@/api/client';
import type {
  ServerSnapshot,
  ClientMessage,
  Outcome,
  LastMove,
} from '@/types';

export interface GameState {
  fen: string;
  turn: 'white' | 'black';
  status: string;
  outcome: Outcome;
  lastMove: LastMove | null;
  whiteClockMs: number;
  blackClockMs: number;
  moveList: string[];
  inCheck: boolean;
  connected: boolean;
  error: string | null;
  drawOffered: string | null;
  loserKingSq: string | null;
  gameEndedOnServer: boolean; // true when WS fails because game is no longer in registry
}

export interface LegalTargets {
  from: string;
  targets: string[];
  captures: string[];
}

const INITIAL: GameState = {
  fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  turn: 'white',
  status: '',
  outcome: '',
  lastMove: null,
  whiteClockMs: 300000,
  blackClockMs: 300000,
  moveList: [],
  inCheck: false,
  connected: false,
  error: null,
  drawOffered: null,
  loserKingSq: null,
  gameEndedOnServer: false,
};

function snapshotToState(snap: ServerSnapshot): GameState {
  return {
    fen: snap.fen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    turn: snap.turn || 'white',
    status: snap.status || '',
    outcome: snap.outcome || '',
    lastMove: snap.last_move ?? null,
    whiteClockMs: snap.white_clock_ms ?? 300000,
    blackClockMs: snap.black_clock_ms ?? 300000,
    moveList: snap.move_list ?? [],
    inCheck: snap.in_check ?? false,
    connected: true,
    error: null,
    drawOffered: snap.draw_offered ?? null,
    loserKingSq: snap.loser_king_sq ?? null,
    gameEndedOnServer: false,
  };
}

export function useGameWebSocket(gameId: number | null, token: string | null) {
  const wsRef = useRef<WebSocket | null>(null);
  const [state, setState] = useState<GameState>(INITIAL);
  const [legalTargets, setLegalTargets] = useState<LegalTargets | null>(null);
  const hasConnected = useRef(false);

  // Clock interpolation state
  const clockRef = useRef<{
    white: number;
    black: number;
    turn: 'white' | 'black';
    timestamp: number;
    outcome: Outcome;
  } | null>(null);

  const [displayClocks, setDisplayClocks] = useState({ white: 300000, black: 300000 });

  // Local clock ticker — updates display every 100ms for smooth countdown
  useEffect(() => {
    const interval = setInterval(() => {
      const c = clockRef.current;
      if (!c || c.outcome) {
        // Game over — use server values
        setDisplayClocks({ white: c?.white ?? 0, black: c?.black ?? 0 });
        return;
      }
      const elapsed = Date.now() - c.timestamp;
      const isWhiteTurn = c.turn === 'white';
      const white = isWhiteTurn ? Math.max(0, c.white - elapsed) : c.white;
      const black = isWhiteTurn ? c.black : Math.max(0, c.black - elapsed);
      setDisplayClocks({ white, black });
    }, 100);
    return () => clearInterval(interval);
  }, []);

  const send = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }, []);

  useEffect(() => {
    if (!gameId || !token) return;

    hasConnected.current = false;
    setState(prev => ({ ...prev, connected: false, error: null, gameEndedOnServer: false }));
    setLegalTargets(null);
    clockRef.current = null;

    const url = buildGameWsUrl(gameId, token);
    console.log('[WS] connecting to', url);
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[WS] connected to game', gameId);
      hasConnected.current = true;
      setState(prev => ({ ...prev, connected: true, error: null }));
    };

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        console.log('[WS] message:', msg.type, msg.error || '');
        if (msg.type === 'snapshot' && msg.state) {
          const newState = snapshotToState(msg.state);
          setState(newState);
          // Update clock interpolation base
          clockRef.current = {
            white: msg.state.white_clock_ms ?? 0,
            black: msg.state.black_clock_ms ?? 0,
            turn: msg.state.turn || 'white',
            timestamp: Date.now(),
            outcome: msg.state.outcome || '',
          };
          setDisplayClocks({
            white: msg.state.white_clock_ms ?? 0,
            black: msg.state.black_clock_ms ?? 0,
          });
          // Clear legal targets when board changes
          setLegalTargets(null);
        } else if (msg.type === 'legal_targets') {
          setLegalTargets({
            from: msg.from || '',
            targets: msg.targets || [],
            captures: msg.captures || [],
          });
        } else if (msg.type === 'error') {
          setState(prev => ({ ...prev, error: msg.error || 'Unknown error' }));
        }
      } catch {
        // ignore malformed
      }
    };

    ws.onerror = (e) => {
      console.error('[WS] error', e);
      setState(prev => ({
        ...prev,
        connected: false,
        error: hasConnected.current
          ? 'Connection lost'
          : 'Failed to connect — game may not exist',
        // If we never connected, the game session likely doesn't exist (finished or server restarted)
        gameEndedOnServer: !hasConnected.current,
      }));
    };

    ws.onclose = (e) => {
      console.log('[WS] closed:', e.code, e.reason);
      if (!hasConnected.current) {
        setState(prev => ({
          ...prev,
          connected: false,
          error: `Connection refused (code ${e.code}). The game may have ended.`,
          gameEndedOnServer: true,
        }));
      } else {
        setState(prev => ({ ...prev, connected: false }));
      }
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [gameId, token]);

  return { state, displayClocks, legalTargets, send };
}
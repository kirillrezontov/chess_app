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
  };
}

export function useGameWebSocket(gameId: number | null, token: string | null) {
  const wsRef = useRef<WebSocket | null>(null);
  const [state, setState] = useState<GameState>(INITIAL);
  const hasConnected = useRef(false);

  const send = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }, []);

  useEffect(() => {
    if (!gameId || !token) return;

    hasConnected.current = false;
    setState(prev => ({ ...prev, connected: false, error: null }));

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
          setState(snapshotToState(msg.state));
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
      }));
    };

    ws.onclose = (e) => {
      console.log('[WS] closed:', e.code, e.reason);
      if (!hasConnected.current) {
        setState(prev => ({
          ...prev,
          connected: false,
          error: `Connection refused (code ${e.code}). Check that the game was created successfully.`,
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

  return { state, send };
}
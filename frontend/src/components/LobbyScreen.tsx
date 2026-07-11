import { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { queue, games } from '@/api/client';
import { TIME_CONTROLS, type TimeControl, type HistoryEntry, type LeaderboardEntry } from '@/types';
import '@/styles/lobby.css';

export function LobbyScreen() {
  const { username, rating, setScreen, setGameId, logout, refreshMe } = useAuth();

  const [selectedTC, setSelectedTC] = useState<TimeControl>(TIME_CONTROLS[2]);
  const [searching, setSearching] = useState(false);
  const [queueError, setQueueError] = useState('');
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const searchStartRef = useRef<number>(0);
  const consecutiveErrorsRef = useRef<number>(0);

  const SEARCH_TIMEOUT_MS = 120_000; // 2 minutes
  const MAX_CONSECUTIVE_ERRORS = 5;

  const loadHistory = useCallback(async () => {
    try {
      const data = await games.history();
      setHistory(data || []);
    } catch (e) {
      console.error('[Lobby] failed to load history:', e);
    }
  }, []);

  const loadLeaderboard = useCallback(async () => {
    try {
      const data = await games.leaderboard();
      setLeaderboard(data || []);
    } catch (e) {
      console.error('[Lobby] failed to load leaderboard:', e);
    }
  }, []);

  useEffect(() => {
    refreshMe();
    loadHistory();
    loadLeaderboard();
  }, []);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const startSearch = useCallback(async () => {
    setSearching(true);
    setQueueError('');
    searchStartRef.current = Date.now();
    consecutiveErrorsRef.current = 0;

    try {
      const data = await queue.join({
        initial_time_sec: selectedTC.initialSec,
        increment_sec: selectedTC.incrementSec,
      });

      pollRef.current = setInterval(async () => {
        // --- Safety: search timeout ---
        if (Date.now() - searchStartRef.current > SEARCH_TIMEOUT_MS) {
          console.warn('[Lobby] search timed out after', SEARCH_TIMEOUT_MS / 1000, 's');
          stopPolling();
          setSearching(false);
          setQueueError('Search timed out — no opponent found. Please try again.');
          return;
        }

        try {
          const status = await queue.status(data.ticket_id);
          consecutiveErrorsRef.current = 0; // reset on success

          if (status.status === 'matched') {
            const gid = status.game_id;
            if (typeof gid === 'number' && gid > 0) {
              stopPolling();
              setGameId(gid);
              setSearching(false);
              setScreen('game');
            } else {
              // Matched but game_id missing — server-side issue
              console.error('[Lobby] matched but invalid game_id:', gid);
              stopPolling();
              setSearching(false);
              setQueueError('Match found but game failed to create. Please try again.');
            }
          }
        } catch (err: unknown) {
          consecutiveErrorsRef.current++;
          const isApiErr = err && typeof err === 'object' && 'status' in err;
          const httpStatus = isApiErr ? (err as { status: number }).status : 0;

          // 404 = ticket lost (server restart), stop immediately
          if (httpStatus === 404) {
            console.error('[Lobby] ticket not found (server may have restarted)');
            stopPolling();
            setSearching(false);
            setQueueError('Search ticket lost — server may have restarted. Please try again.');
            return;
          }

          console.warn('[Lobby] poll error:', consecutiveErrorsRef.current, err);

          // Too many consecutive failures — give up
          if (consecutiveErrorsRef.current >= MAX_CONSECUTIVE_ERRORS) {
            console.error('[Lobby] too many consecutive poll errors, stopping search');
            stopPolling();
            setSearching(false);
            setQueueError('Connection issues — could not reach server. Please try again.');
          }
        }
      }, 800);
    } catch (err) {
      setQueueError(err instanceof Error ? err.message : 'Failed to join queue');
      setSearching(false);
    }
  }, [selectedTC, stopPolling, setGameId, setScreen]);

  const cancelSearch = useCallback(() => {
    stopPolling();
    setSearching(false);
    setQueueError('');
  }, [stopPolling]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const renderGameResult = (g: HistoryEntry) => {
    if (g.outcome === 'draw') return <span className="result draw">Draw</span>;

    const winnerColor = g.outcome === 'white_win' ? 'white' : 'black';
    const isWin = g.your_color === winnerColor;

    if (!g.outcome) return <span className="result">In progress</span>;

    return (
      <span className={`result ${isWin ? 'win' : 'loss'}`}>
        {isWin ? 'Won' : 'Lost'}
      </span>
    );
  };

  const formatTimeControl = (initial: number, increment: number) => {
    const inc = increment > 0 ? `+${increment}` : '+0';
    return `${Math.floor(initial / 60)}${inc}`;
  };

  return (
    <div className="lobby-screen">
      <header className="lobby-header">
        <motion.h1
          className="lobby-brand"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3 }}
        >
          Chess
        </motion.h1>
        <motion.div
          className="lobby-user"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3 }}
        >
          <span className="lobby-username">{username}</span>
          <span className="lobby-rating">{rating} rating</span>
          <button className="btn btn-ghost btn-sm" onClick={logout}>Logout</button>
        </motion.div>
      </header>

      <div className="lobby-body">
        <motion.section
          className="card find-card"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <h2 className="card-title">Find a Game</h2>

          <div className="time-controls">
            {TIME_CONTROLS.map(tc => (
              <motion.button
                key={tc.label}
                className={`tc-btn ${selectedTC.label === tc.label ? 'active' : ''}`}
                onClick={() => setSelectedTC(tc)}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                type="button"
              >
                {tc.label}
              </motion.button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            {searching ? (
              <motion.div
                key="searching"
                className="searching"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
              >
                <div className="spinner" />
                <span>Searching for opponent…</span>
                <button className="btn btn-outline" onClick={cancelSearch} type="button">
                  Cancel
                </button>
              </motion.div>
            ) : (
              <motion.button
                key="find"
                className="btn btn-primary btn-lg"
                onClick={startSearch}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                type="button"
              >
                Find Opponent
              </motion.button>
            )}
          </AnimatePresence>

          {queueError && <p className="field-error">{queueError}</p>}
        </motion.section>

        <aside className="lobby-sidebar">
          <motion.section
            className="card"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.2 }}
          >
            <h2 className="card-title">Recent Games</h2>
            {history.length === 0 ? (
              <p className="empty-text">No games yet</p>
            ) : (
              <div className="history-list">
                {history.slice(0, 15).map(g => (
                  <div key={g.id} className="history-row">
                    <span className="history-opponents">
                      {g.opponent_username || '?'} ({g.your_color === 'white' ? '⬜' : '⬛'})
                    </span>
                    <span className="history-tc">
                      {formatTimeControl(g.initial_time_sec, g.increment_sec)}
                    </span>
                    {renderGameResult(g)}
                  </div>
                ))}
              </div>
            )}
          </motion.section>

          <motion.section
            className="card"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.3 }}
          >
            <h2 className="card-title">Leaderboard</h2>
            {leaderboard.length === 0 ? (
              <p className="empty-text">No players yet</p>
            ) : (
              <table className="lb-table">
                <thead>
                  <tr>
                    <th>#</th><th>Player</th><th>W</th><th>L</th><th>D</th><th>Rating</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.slice(0, 15).map((p, i) => (
                    <tr key={p.username}>
                      <td>{i + 1}</td>
                      <td>{p.username}</td>
                      <td>{p.wins}</td>
                      <td>{p.losses}</td>
                      <td>{p.draws}</td>
                      <td className="rating-cell">{p.rating}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </motion.section>
        </aside>
      </div>
    </div>
  );
}
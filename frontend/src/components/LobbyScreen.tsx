import { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { queue, games, friends } from '@/api/client';
import { TIME_CONTROLS, type TimeControl, type HistoryEntry, type LeaderboardEntry, type FriendEntry } from '@/types';
import '@/styles/lobby.css';

export function LobbyScreen() {
  const { username, rating, setScreen, setGameId, setReviewGameId, logout, refreshMe } = useAuth();

  const [selectedTC, setSelectedTC] = useState<TimeControl>(TIME_CONTROLS[2]);
  const [searching, setSearching] = useState(false);
  const [queueError, setQueueError] = useState('');
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const searchStartRef = useRef<number>(0);
  const consecutiveErrorsRef = useRef<number>(0);

  // Friends state
  const [friendList, setFriendList] = useState<FriendEntry[]>([]);
  const [friendSearch, setFriendSearch] = useState('');
  const [searchResults, setSearchResults] = useState<FriendEntry[]>([]);
  const [showFriendSearch, setShowFriendSearch] = useState(false);
  const [showFriends, setShowFriends] = useState(false);
  const [inviteFriend, setInviteFriend] = useState<string | null>(null);
  const [inviteTC, setInviteTC] = useState<TimeControl>(TIME_CONTROLS[2]);
  const [friendError, setFriendError] = useState('');
  const [showInviteDialog, setShowInviteDialog] = useState(false);

  const SEARCH_TIMEOUT_MS = 120_000;
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

  const loadFriends = useCallback(async () => {
    try {
      const data = await friends.list();
      setFriendList(data || []);
    } catch (e) {
      console.error('[Lobby] failed to load friends:', e);
    }
  }, []);

  useEffect(() => {
    refreshMe();
    loadHistory();
    loadLeaderboard();
    loadFriends();
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
        if (Date.now() - searchStartRef.current > SEARCH_TIMEOUT_MS) {
          console.warn('[Lobby] search timed out after', SEARCH_TIMEOUT_MS / 1000, 's');
          stopPolling();
          setSearching(false);
          setQueueError('Search timed out — no opponent found. Please try again.');
          return;
        }

        try {
          const status = await queue.status(data.ticket_id);
          consecutiveErrorsRef.current = 0;

          if (status.status === 'matched') {
            const gid = status.game_id;
            if (typeof gid === 'number' && gid > 0) {
              stopPolling();
              setGameId(gid);
              setSearching(false);
              setScreen('game');
            } else {
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

          if (httpStatus === 404) {
            console.error('[Lobby] ticket not found (server may have restarted)');
            stopPolling();
            setSearching(false);
            setQueueError('Search ticket lost — server may have restarted. Please try again.');
            return;
          }

          console.warn('[Lobby] poll error:', consecutiveErrorsRef.current, err);

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

  // Friend search with debounce
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (!friendSearch || friendSearch.length < 2) {
      setSearchResults([]);
      return;
    }
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const res = await friends.search(friendSearch);
        // Filter out existing friends
        const friendNames = new Set(friendList.map(f => f.username));
        setSearchResults((res || []).filter(r => !friendNames.has(r.username)));
      } catch { /* ignore */ }
    }, 300);
    return () => { if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current); };
  }, [friendSearch, friendList]);

  const handleAddFriend = async (name: string) => {
    try {
      await friends.add(name);
      setFriendSearch('');
      setSearchResults([]);
      loadFriends();
    } catch (e: unknown) {
      const msg = (e as { message?: string }).message || 'Failed to add friend';
      setFriendError(msg);
      setTimeout(() => setFriendError(''), 3000);
    }
  };

  const handleRemoveFriend = async (name: string) => {
    try {
      await friends.remove(name);
      loadFriends();
    } catch (e) {
      console.error('[Lobby] remove friend error:', e);
    }
  };

  const handleInviteFriend = async (friendName: string) => {
    try {
      const res = await friends.invite(friendName, inviteTC.initialSec, inviteTC.incrementSec);
      setShowInviteDialog(false);
      setInviteFriend(null);
      setGameId(res.game_id);
      setScreen('game');
    } catch (e: unknown) {
      const msg = (e as { message?: string }).message || 'Failed to invite friend';
      setFriendError(msg);
      setTimeout(() => setFriendError(''), 3000);
    }
  };

  const handleHistoryClick = (g: HistoryEntry) => {
    if (g.status === 'in_progress') {
      setGameId(g.id);
      setScreen('game');
    } else {
      setReviewGameId(g.id);
    }
  };

  const renderGameResult = (g: HistoryEntry) => {
    if (g.status === 'in_progress') return <span className="result in-progress">In progress</span>;
    if (g.outcome === 'draw') return <span className="result draw">Draw</span>;

    const winnerColor = g.outcome === 'white_win' ? 'white' : 'black';
    const isWin = g.your_color === winnerColor;

    if (!g.outcome) return <span className="result">—</span>;

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
          {/* Friends */}
          <motion.section
            className="card"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.15 }}
          >
            <div className="card-title-row">
              <h2 className="card-title" style={{ marginBottom: 0 }}>Friends ({friendList.length})</h2>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => { setShowFriends(!showFriends); setShowFriendSearch(false); }}
                type="button"
              >
                {showFriends ? '▲' : '▼'}
              </button>
            </div>

            <AnimatePresence>
              {showFriends && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  style={{ overflow: 'hidden' }}
                >
                  {friendError && <p className="field-error" style={{ marginTop: 8, marginBottom: 8 }}>{friendError}</p>}

                  {/* Add friend search */}
                  <div className="friend-search-row">
                    <input
                      className="friend-search-input"
                      type="text"
                      placeholder="Search username…"
                      value={friendSearch}
                      onChange={e => { setFriendSearch(e.target.value); setShowFriendSearch(true); }}
                      onFocus={() => setShowFriendSearch(true)}
                    />
                  </div>

                  {/* Search results dropdown */}
                  <AnimatePresence>
                    {showFriendSearch && searchResults.length > 0 && (
                      <motion.div
                        className="friend-search-dropdown"
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                      >
                        {searchResults.map(r => (
                          <button
                            key={r.username}
                            className="friend-search-item"
                            onClick={() => handleAddFriend(r.username)}
                            type="button"
                          >
                            <span>{r.username}</span>
                            <span className="friend-search-rating">{r.rating}</span>
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Friends list */}
                  {friendList.length === 0 ? (
                    <p className="empty-text" style={{ marginTop: 8 }}>No friends yet. Search above to add.</p>
                  ) : (
                    <div className="friends-list">
                      {friendList.map(f => (
                        <div key={f.username} className="friend-row">
                          <span className="friend-name">{f.username} <span className="friend-rating">{f.rating}</span></span>
                          <div className="friend-actions">
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => { setInviteFriend(f.username); setShowInviteDialog(true); }}
                              type="button"
                              title="Invite to game"
                            >
                              ⚔
                            </button>
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => handleRemoveFriend(f.username)}
                              type="button"
                              title="Remove friend"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.section>

          {/* Invite dialog */}
          <AnimatePresence>
            {showInviteDialog && inviteFriend && (
              <div className="invite-overlay" onClick={() => setShowInviteDialog(false)}>
                <motion.div
                  className="invite-dialog card"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  onClick={e => e.stopPropagation()}
                >
                  <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-bright)', marginBottom: 12 }}>
                    Invite {inviteFriend}
                  </h3>
                  <div className="time-controls" style={{ marginBottom: 16 }}>
                    {TIME_CONTROLS.map(tc => (
                      <button
                        key={tc.label}
                        className={`tc-btn ${inviteTC.label === tc.label ? 'active' : ''}`}
                        onClick={() => setInviteTC(tc)}
                        type="button"
                      >
                        {tc.label}
                      </button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      className="btn btn-primary"
                      style={{ flex: 1 }}
                      onClick={() => handleInviteFriend(inviteFriend)}
                      type="button"
                    >
                      Invite
                    </button>
                    <button
                      className="btn btn-outline"
                      style={{ flex: 1 }}
                      onClick={() => setShowInviteDialog(false)}
                      type="button"
                    >
                      Cancel
                    </button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          {/* Recent Games */}
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
                  <button
                    key={g.id}
                    className={`history-row ${g.status === 'in_progress' ? 'history-row-clickable' : ''}`}
                    onClick={() => handleHistoryClick(g)}
                    type="button"
                  >
                    <span className="history-opponents">
                      {g.opponent_username || '?'} ({g.your_color === 'white' ? '⬜' : '⬛'})
                    </span>
                    <span className="history-tc">
                      {formatTimeControl(g.initial_time_sec, g.increment_sec)}
                    </span>
                    {renderGameResult(g)}
                  </button>
                ))}
              </div>
            )}
          </motion.section>

          {/* Leaderboard */}
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
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import { auth as apiAuth } from '@/api/client';
import type { AppScreen, Color } from '@/types';

/* ────────── Context shape ────────── */

interface AuthContextValue {
  token: string | null;
  userId: number | null;
  username: string | null;
  rating: number;
  screen: AppScreen;
  setScreen: (s: AppScreen) => void;
  myColor: Color | null;
  setMyColor: (c: Color | null) => void;
  gameId: number | null;
  setGameId: (id: number) => void;
  reviewGameId: number | null;
  setReviewGameId: (id: number) => void;
  login: (username: string, password: string) => Promise<void>;
  register: (
    username: string,
    email: string,
    password: string,
  ) => Promise<void>;
  logout: () => void;
  refreshMe: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const P = 'chess_';
const load = (k: string) => sessionStorage.getItem(P + k);
const save = (k: string, v: string) => sessionStorage.setItem(P + k, v);
const remove = (k: string) => sessionStorage.removeItem(P + k);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => load('token'));
  const [userId, setUserId] = useState<number | null>(() =>
    load('user_id') ? Number(load('user_id')) : null,
  );
  const [username, setUsername] = useState<string | null>(() => load('username'));
  const [rating, setRating] = useState(0);

  // Persist game state across reloads
  const [gameId, setGameIdRaw] = useState<number | null>(() =>
    load('game_id') ? Number(load('game_id')) : null,
  );
  const [myColor, setMyColorRaw] = useState<Color | null>(() =>
    (load('my_color') as Color) || null,
  );

  // Determine initial screen: if we have a game in progress, go there
  const [screen, setScreenRaw] = useState<AppScreen>(() => {
    if (!load('token')) return 'auth';
    if (load('game_id')) return 'game';
    return 'lobby';
  });

  const persistAuth = (t: string, uid: number, name: string) => {
    save('token', t);
    save('user_id', String(uid));
    save('username', name);
    setToken(t);
    setUserId(uid);
    setUsername(name);
  };

  const clear = useCallback(() => {
    ['token', 'user_id', 'username', 'game_id', 'my_color'].forEach(remove);
    setToken(null);
    setUserId(null);
    setUsername(null);
    setRating(0);
    setMyColorRaw(null);
    setGameIdRaw(null);
    setScreenRaw('auth');
  }, []);

  const login = useCallback(
    async (u: string, p: string) => {
      const data = await apiAuth.login({ username: u, password: p });
      persistAuth(data.token, data.user_id, data.username || u);
      setRating(data.rating || 0);
      setScreenRaw('lobby');
    },
    [],
  );

  const register = useCallback(
    async (u: string, em: string, p: string) => {
      const data = await apiAuth.register({ username: u, email: em, password: p });
      persistAuth(data.token, data.user_id, u);
      setRating(0);
      setScreenRaw('lobby');
    },
    [],
  );

  const logout = useCallback(() => {
    clear();
  }, [clear]);

  // Review game state (not persisted — only for viewing finished games)
  const [reviewGameId, setReviewGameIdRaw] = useState<number | null>(null);

  // setGameId also persists, clears old color, and switches screen
  const setGameId = useCallback((id: number) => {
    save('game_id', String(id));
    remove('my_color');
    setGameIdRaw(id);
    setMyColorRaw(null);
    setReviewGameIdRaw(null);
    setScreenRaw('game');
  }, []);

  // setMyColor also persists (null clears it)
  const setMyColor = useCallback((c: Color | null) => {
    if (c) {
      save('my_color', c);
    } else {
      remove('my_color');
    }
    setMyColorRaw(c);
  }, []);

  // setScreen clears game state when leaving game
  const setScreen = useCallback((s: AppScreen) => {
    if (s !== 'game') {
      remove('game_id');
      remove('my_color');
      setGameIdRaw(null);
      setMyColorRaw(null);
    }
    if (s !== 'review') {
      setReviewGameIdRaw(null);
    }
    setScreenRaw(s);
  }, []);

  const setReviewGameId = useCallback((id: number) => {
    setReviewGameIdRaw(id);
    setGameIdRaw(null);
    setMyColorRaw(null);
    setScreenRaw('review');
  }, []);

  const refreshMe = useCallback(async () => {
    if (!token) return;
    try {
      const data = await apiAuth.me();
      setRating(data.rating || 0);
      if (data.username) setUsername(data.username);
      if (data.user_id) setUserId(data.user_id);
    } catch {
      clear();
    }
  }, [token, clear]);

  useEffect(() => {
    if (token) refreshMe();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AuthContext.Provider
      value={{
        token,
        userId,
        username,
        rating,
        screen,
        setScreen,
        myColor,
        setMyColor,
        gameId,
        setGameId,
        reviewGameId,
        setReviewGameId,
        login,
        register,
        logout,
        refreshMe,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
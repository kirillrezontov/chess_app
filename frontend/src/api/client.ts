import type {
  LoginRequest,
  RegisterRequest,
  AuthResponse,
  MeResponse,
  JoinQueueRequest,
  QueueResponse,
  QueueStatusResponse,
  GameInfo,
  HistoryEntry,
  LeaderboardEntry,
  FriendEntry,
  GameReviewData,
} from '@/types';

const BASE_URL = '';

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function getToken(): string | null {
  return sessionStorage.getItem('chess_token');
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const data = await res.json();

  if (!res.ok || (data as Record<string, unknown>).error) {
    throw new ApiError(
      res.status,
      (data as { error?: string }).error || `HTTP ${res.status}`,
    );
  }

  return data as T;
}

/* ────────── Auth ────────── */

export const auth = {
  login(req: LoginRequest): Promise<AuthResponse> {
    return request<AuthResponse>('POST', '/api/login', req);
  },
  register(req: RegisterRequest): Promise<AuthResponse> {
    return request<AuthResponse>('POST', '/api/register', req);
  },
  me(): Promise<MeResponse> {
    return request<MeResponse>('GET', '/api/me');
  },
};

/* ────────── Queue / Matchmaking ────────── */

export const queue = {
  join(req: JoinQueueRequest): Promise<QueueResponse> {
    return request<QueueResponse>('POST', '/api/queue', req);
  },
  status(ticketId: string): Promise<QueueStatusResponse> {
    return request<QueueStatusResponse>('GET', `/api/queue/${ticketId}`);
  },
};

/* ────────── Games ────────── */

export const games = {
  get(id: number): Promise<GameInfo> {
    return request<GameInfo>('GET', `/api/games/${id}`);
  },
  getMoves(id: number): Promise<GameReviewData> {
    return request<GameReviewData>('GET', `/api/games/${id}/moves`);
  },
  history(): Promise<HistoryEntry[]> {
    return request<HistoryEntry[]>('GET', '/api/history');
  },
  leaderboard(): Promise<LeaderboardEntry[]> {
    return request<LeaderboardEntry[]>('GET', '/api/leaderboard');
  },
};

/* ────────── Friends ────────── */

export const friends = {
  list(): Promise<FriendEntry[]> {
    return request<FriendEntry[]>('GET', '/api/friends');
  },
  add(username: string): Promise<void> {
    return request<void>('POST', '/api/friends', { username });
  },
  remove(username: string): Promise<void> {
    return request<void>('DELETE', '/api/friends', { username });
  },
  search(query: string): Promise<FriendEntry[]> {
    return request<FriendEntry[]>('GET', `/api/friends/search?q=${encodeURIComponent(query)}`);
  },
  invite(username: string, initialTimeSec: number, incrementSec: number): Promise<{ game_id: number; your_color: string }> {
    return request<{ game_id: number; your_color: string }>('POST', '/api/friends/invite', { username, initial_time_sec: initialTimeSec, increment_sec: incrementSec });
  },
};

/* ────────── WebSocket ────────── */

export function buildGameWsUrl(gameId: number, token: string): string {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${location.host}/ws/games/${gameId}?token=${encodeURIComponent(token)}`;
}
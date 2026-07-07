/* ────────── Backend DTOs ────────── */

export interface LoginRequest {
  username: string;
  password: string;
}

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  user_id: number;
  username?: string;
  rating?: number;
}

export interface MeResponse {
  user_id: number;
  username: string;
  rating: number;
}

export interface JoinQueueRequest {
  initial_time_sec: number;
  increment_sec: number;
}

export interface QueueResponse {
  ticket_id: string;
}

export interface QueueStatusResponse {
  status: 'waiting' | 'matched';
  game_id?: number;
}

/* ────────── Game API responses (no other player IDs) ────────── */

export interface GameInfo {
  id: number;
  your_color: 'white' | 'black';
  opponent_username: string;
  outcome: string;
  initial_time_sec: number;
  increment_sec: number;
  created_at?: string;
}

export interface HistoryEntry {
  id: number;
  your_color: 'white' | 'black';
  opponent_username: string;
  outcome: string;
  initial_time_sec: number;
  increment_sec: number;
  created_at?: string;
}

export interface LeaderboardEntry {
  username: string;
  rating: number;
  wins: number;
  losses: number;
  draws: number;
}

/* ────────── WebSocket messages ────────── */

export interface ServerSnapshot {
  game_id: number;
  fen: string;
  turn: 'white' | 'black';
  status: string;
  outcome: Outcome;
  last_move?: LastMove | null;
  white_clock_ms: number;
  black_clock_ms: number;
  move_list: string[];
  in_check: boolean;
}

export type Outcome = '' | 'white_win' | 'black_win' | 'draw' | 'abandoned';

export interface LastMove {
  from: string;
  to: string;
}

export interface ServerMessage {
  type: 'snapshot' | 'error';
  state?: ServerSnapshot;
  error?: string;
}

export interface ClientMoveMessage {
  type: 'move';
  from: string;
  to: string;
  promotion: string;
}

export interface ClientActionMessage {
  type: 'resign' | 'offer_draw';
}

export type ClientMessage = ClientMoveMessage | ClientActionMessage;

/* ────────── Frontend-only types ────────── */

export type Color = 'white' | 'black';

export type AppScreen = 'auth' | 'lobby' | 'game';

export type TimeControl = {
  label: string;
  initialSec: number;
  incrementSec: number;
};

export const TIME_CONTROLS: TimeControl[] = [
  { label: '1+0', initialSec: 60, incrementSec: 0 },
  { label: '3+0', initialSec: 180, incrementSec: 0 },
  { label: '5+0', initialSec: 300, incrementSec: 0 },
  { label: '10+0', initialSec: 600, incrementSec: 0 },
  { label: '5+3', initialSec: 300, incrementSec: 3 },
  { label: '10+5', initialSec: 600, incrementSec: 5 },
];
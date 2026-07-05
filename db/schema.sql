-- Chess application schema. Target: PostgreSQL 14+.
-- Applied automatically by docker/init on first container start.

CREATE TABLE IF NOT EXISTS users (
    id              BIGSERIAL PRIMARY KEY,
    username        VARCHAR(32) UNIQUE NOT NULL,
    email           VARCHAR(255) UNIQUE NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    rating          INTEGER NOT NULL DEFAULT 1200,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_login_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_users_rating ON users (rating DESC);

CREATE TABLE IF NOT EXISTS games (
    id                BIGSERIAL PRIMARY KEY,
    white_id          BIGINT NOT NULL REFERENCES users(id),
    black_id          BIGINT NOT NULL REFERENCES users(id),
    status            VARCHAR(16) NOT NULL DEFAULT 'in_progress'
                        CHECK (status IN ('in_progress', 'finished', 'aborted')),
    outcome           VARCHAR(16)
                        CHECK (outcome IN ('white_win', 'black_win', 'draw', 'abandoned')),
    final_fen         TEXT,
    initial_time_sec  INTEGER NOT NULL DEFAULT 300,
    increment_sec     INTEGER NOT NULL DEFAULT 0,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_games_white ON games (white_id);
CREATE INDEX IF NOT EXISTS idx_games_black ON games (black_id);
CREATE INDEX IF NOT EXISTS idx_games_status ON games (status);
CREATE INDEX IF NOT EXISTS idx_games_created_at ON games (created_at DESC);

-- Every ply, recorded as it happens. fen_after lets the frontend (or any
-- viewer/replay tool) reconstruct the game position-by-position without any
-- client-side rules engine — it just requests move N and gets the FEN.
CREATE TABLE IF NOT EXISTS moves (
    id            BIGSERIAL PRIMARY KEY,
    game_id       BIGINT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    move_number   INTEGER NOT NULL,       -- fullmove number
    ply           VARCHAR(16) NOT NULL,   -- long algebraic, e.g. "e2e4" or "e7e8q"
    fen_after     TEXT NOT NULL,
    played_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_moves_game_id ON moves (game_id, move_number);

-- Rating snapshot after each finished game, for rating-over-time charts.
CREATE TABLE IF NOT EXISTS rating_history (
    id            BIGSERIAL PRIMARY KEY,
    user_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    game_id       BIGINT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    rating_before INTEGER NOT NULL,
    rating_after  INTEGER NOT NULL,
    recorded_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rating_history_user ON rating_history (user_id, recorded_at);

-- Optional persisted refresh/session tracking, if you extend beyond
-- stateless short-lived JWTs (e.g. to support explicit logout/revocation).
CREATE TABLE IF NOT EXISTS sessions (
    id            BIGSERIAL PRIMARY KEY,
    user_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash    VARCHAR(255) NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at    TIMESTAMPTZ NOT NULL,
    revoked       BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions (token_hash);

-- Matchmaking queue as durable state, useful if the matcher needs to survive
-- a process restart, or if you later split matchmaking into its own service.
CREATE TABLE IF NOT EXISTS queue_tickets (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id            BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    initial_time_sec   INTEGER NOT NULL,
    increment_sec      INTEGER NOT NULL,
    status             VARCHAR(16) NOT NULL DEFAULT 'waiting'
                         CHECK (status IN ('waiting', 'matched', 'cancelled')),
    matched_game_id    BIGINT REFERENCES games(id),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_queue_status ON queue_tickets (status);

// Package store is the only code allowed to talk SQL. Handlers and game
// sessions call these methods; nobody else touches *sql.DB directly.
package store

import (
	"database/sql"
	"errors"
	"time"

	_ "github.com/lib/pq"
)

var ErrNotFound = errors.New("not found")

type Store struct {
	db *sql.DB
}

func Open(dsn string) (*Store, error) {
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(10)
	db.SetConnMaxLifetime(30 * time.Minute)
	if err := db.Ping(); err != nil {
		return nil, err
	}
	return &Store{db: db}, nil
}

func (s *Store) Close() error { return s.db.Close() }

// ---- Users ----

type User struct {
	ID           int64
	Username     string
	Email        string
	PasswordHash string
	Rating       int
	CreatedAt    time.Time
}

func (s *Store) CreateUser(username, email, passwordHash string) (int64, error) {
	var id int64
	err := s.db.QueryRow(
		`INSERT INTO users (username, email, password_hash, rating, created_at)
		 VALUES ($1, $2, $3, 1200, now()) RETURNING id`,
		username, email, passwordHash,
	).Scan(&id)
	return id, err
}

func (s *Store) GetUserByUsername(username string) (*User, error) {
	u := &User{}
	err := s.db.QueryRow(
		`SELECT id, username, email, password_hash, rating, created_at
		 FROM users WHERE username = $1`, username,
	).Scan(&u.ID, &u.Username, &u.Email, &u.PasswordHash, &u.Rating, &u.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, ErrNotFound
	}
	return u, err
}

func (s *Store) GetUserByID(id int64) (*User, error) {
	u := &User{}
	err := s.db.QueryRow(
		`SELECT id, username, email, password_hash, rating, created_at
		 FROM users WHERE id = $1`, id,
	).Scan(&u.ID, &u.Username, &u.Email, &u.PasswordHash, &u.Rating, &u.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, ErrNotFound
	}
	return u, err
}

func (s *Store) UpdateRating(userID int64, newRating int) error {
	_, err := s.db.Exec(`UPDATE users SET rating = $1 WHERE id = $2`, newRating, userID)
	return err
}

// ---- Games (internal, used by game sessions) ----

type GameRecord struct {
	ID          int64
	WhiteID     int64
	BlackID     int64
	Status      string
	Outcome     string
	FinalFEN    string
	InitialTime int
	Increment   int
	CreatedAt   time.Time
	FinishedAt  *time.Time
}

func (s *Store) CreateGame(whiteID, blackID int64, initialTimeSec, incrementSec int) (int64, error) {
	var id int64
	err := s.db.QueryRow(
		`INSERT INTO games (white_id, black_id, status, initial_time_sec, increment_sec, created_at)
		 VALUES ($1, $2, 'in_progress', $3, $4, now()) RETURNING id`,
		whiteID, blackID, initialTimeSec, incrementSec,
	).Scan(&id)
	return id, err
}

func (s *Store) FinishGame(gameID int64, outcome, finalFEN string) error {
	_, err := s.db.Exec(
		`UPDATE games SET status = 'finished', outcome = $1, final_fen = $2, finished_at = now()
		 WHERE id = $3`, outcome, finalFEN, gameID)
	return err
}

func (s *Store) RecordMove(gameID int64, moveNumber int, ply string, fenAfter string) error {
	_, err := s.db.Exec(
		`INSERT INTO moves (game_id, move_number, ply, fen_after, played_at)
		 VALUES ($1, $2, $3, $4, now())`,
		gameID, moveNumber, ply, fenAfter)
	return err
}

func (s *Store) GetGame(gameID int64) (*GameRecord, error) {
	g := &GameRecord{}
	err := s.db.QueryRow(
		`SELECT id, white_id, black_id, status, coalesce(outcome, ''), coalesce(final_fen, ''),
				initial_time_sec, increment_sec, created_at, finished_at
		 FROM games WHERE id = $1`, gameID,
	).Scan(&g.ID, &g.WhiteID, &g.BlackID, &g.Status, &g.Outcome, &g.FinalFEN,
		&g.InitialTime, &g.Increment, &g.CreatedAt, &g.FinishedAt)
	if err == sql.ErrNoRows {
		return nil, ErrNotFound
	}
	return g, err
}

// ---- API response types (no user IDs exposed) ----

// GameInfo is returned by GET /api/games/{id}. Contains only the
// information the authenticated player needs — their colour and the
// opponent's username. No other player's ID is ever leaked.
type GameInfo struct {
	ID             int64      `json:"id"`
	YourColor      string     `json:"your_color"`       // "white" | "black"
	OpponentName   string     `json:"opponent_username"`
	Outcome        string     `json:"outcome"`
	InitialTimeSec int        `json:"initial_time_sec"`
	IncrementSec   int        `json:"increment_sec"`
	CreatedAt      *time.Time `json:"created_at"`
}

// GetGameInfo returns a GameInfo for the given player. It computes
// your_color from the JWT user_id and fetches the opponent's username
// via a single query with JOINs — no user IDs are exposed.
func (s *Store) GetGameInfo(gameID, userID int64) (*GameInfo, error) {
	g := &GameInfo{}
	err := s.db.QueryRow(`
		SELECT
			g.id,
			CASE WHEN g.white_id = $2 THEN 'white' ELSE 'black' END,
			coalesce(CASE WHEN g.white_id = $2 THEN ub.username ELSE uw.username END, 'Opponent'),
			coalesce(g.outcome, ''),
			g.initial_time_sec,
			g.increment_sec,
			g.created_at
		FROM games g
		LEFT JOIN users uw ON uw.id = g.white_id
		LEFT JOIN users ub ON ub.id = g.black_id
		WHERE g.id = $1`, gameID, userID,
	).Scan(&g.ID, &g.YourColor, &g.OpponentName, &g.Outcome,
		&g.InitialTimeSec, &g.IncrementSec, &g.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, ErrNotFound
	}
	return g, err
}

// HistoryEntry is one row in the game-history list. No IDs are exposed.
type HistoryEntry struct {
	ID             int64      `json:"id"`
	YourColor      string     `json:"your_color"`
	OpponentName   string     `json:"opponent_username"`
	Outcome        string     `json:"outcome"`
	InitialTimeSec int        `json:"initial_time_sec"`
	IncrementSec   int        `json:"increment_sec"`
	CreatedAt      *time.Time `json:"created_at"`
}

// UserGameHistory returns the recent games for a player with opponent
// usernames and the player's colour in each game. No other player IDs.
func (s *Store) UserGameHistory(userID int64, limit int) ([]HistoryEntry, error) {
	rows, err := s.db.Query(`
		SELECT
			g.id,
			CASE WHEN g.white_id = $1 THEN 'white' ELSE 'black' END,
			coalesce(CASE WHEN g.white_id = $1 THEN ub.username ELSE uw.username END, 'Opponent'),
			coalesce(g.outcome, ''),
			g.initial_time_sec,
			g.increment_sec,
			g.created_at
		FROM games g
		LEFT JOIN users uw ON uw.id = g.white_id
		LEFT JOIN users ub ON ub.id = g.black_id
		WHERE g.white_id = $1 OR g.black_id = $1
		ORDER BY g.created_at DESC
		LIMIT $2`, userID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]HistoryEntry, 0, 16)
	for rows.Next() {
		var e HistoryEntry
		if err := rows.Scan(&e.ID, &e.YourColor, &e.OpponentName, &e.Outcome,
			&e.InitialTimeSec, &e.IncrementSec, &e.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

// ---- Leaderboard ----

type LeaderboardEntry struct {
	Username string `json:"username"`
	Rating   int    `json:"rating"`
	Wins     int    `json:"wins"`
	Losses   int    `json:"losses"`
	Draws    int    `json:"draws"`
}

func (s *Store) Leaderboard(limit int) ([]LeaderboardEntry, error) {
	rows, err := s.db.Query(
		`SELECT u.username, u.rating,
				count(*) FILTER (WHERE (g.white_id = u.id AND g.outcome = 'white_win')
				                  OR (g.black_id = u.id AND g.outcome = 'black_win')) AS wins,
				count(*) FILTER (WHERE (g.white_id = u.id AND g.outcome = 'black_win')
				                  OR (g.black_id = u.id AND g.outcome = 'white_win')) AS losses,
				count(*) FILTER (WHERE g.outcome = 'draw'
				                  AND (g.white_id = u.id OR g.black_id = u.id)) AS draws
		 FROM users u
		 LEFT JOIN games g ON g.white_id = u.id OR g.black_id = u.id
		 GROUP BY u.id, u.username, u.rating
		 HAVING count(g.id) > 0
		 ORDER BY u.rating DESC
		 LIMIT $1`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]LeaderboardEntry, 0, 16)
	for rows.Next() {
		var e LeaderboardEntry
		if err := rows.Scan(&e.Username, &e.Rating, &e.Wins, &e.Losses, &e.Draws); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}
// Package api implements the plain REST surface: register/login, creating/
// finding a game, fetching history and the leaderboard. Live gameplay is WS
// only (see internal/ws); this package never touches board state directly,
// it only creates Sessions via the registry and reads/writes through store.
package api

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"

	"chess-backend/internal/auth"
	"chess-backend/internal/game"
	"chess-backend/internal/store"

	"github.com/gorilla/mux"
)

type Server struct {
	Store    *store.Store
	Registry *game.Registry
	Matcher  *Matchmaker
}

func NewServer(s *store.Store, r *game.Registry) *Server {
	return &Server{Store: s, Registry: r, Matcher: NewMatchmaker(s, r)}
}

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

// ---- Auth ----

type registerReq struct {
	Username string `json:"username"`
	Email    string `json:"email"`
	Password string `json:"password"`
}

func (s *Server) Register(w http.ResponseWriter, r *http.Request) {
	var req registerReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "malformed request body")
		return
	}
	if len(req.Username) < 3 || len(req.Password) < 8 {
		writeErr(w, http.StatusBadRequest, "username must be 3+ chars, password 8+ chars")
		return
	}
	hash, err := auth.HashPassword(req.Password)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not hash password")
		return
	}
	id, err := s.Store.CreateUser(req.Username, req.Email, hash)
	if err != nil {
		writeErr(w, http.StatusConflict, "username or email already taken")
		return
	}
	token, err := auth.IssueToken(id, req.Username)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not issue token")
		return
	}
	writeJSON(w, http.StatusCreated, map[string]interface{}{"token": token, "user_id": id})
}

type loginReq struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

func (s *Server) Login(w http.ResponseWriter, r *http.Request) {
	var req loginReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "malformed request body")
		return
	}
	u, err := s.Store.GetUserByUsername(req.Username)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, "invalid credentials")
		return
	}
	if !auth.CheckPassword(u.PasswordHash, req.Password) {
		writeErr(w, http.StatusUnauthorized, "invalid credentials")
		return
	}
	token, err := auth.IssueToken(u.ID, u.Username)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not issue token")
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"token": token, "user_id": u.ID, "username": u.Username, "rating": u.Rating,
	})
}

// ---- Matchmaking ----

type joinQueueReq struct {
	InitialTimeSec int `json:"initial_time_sec"`
	IncrementSec   int `json:"increment_sec"`
}

func (s *Server) JoinQueue(w http.ResponseWriter, r *http.Request) {
	claims := claimsFromContext(r)
	var req joinQueueReq
	json.NewDecoder(r.Body).Decode(&req)
	if req.InitialTimeSec == 0 {
		req.InitialTimeSec = 300 // default 5+0 blitz
	}
	ticket := s.Matcher.Enqueue(claims.UserID, req.InitialTimeSec, req.IncrementSec)
	writeJSON(w, http.StatusAccepted, map[string]interface{}{"ticket_id": ticket.ID})
}

func (s *Server) QueueStatus(w http.ResponseWriter, r *http.Request) {
	ticketID := mux.Vars(r)["ticketId"]
	status, gameID, found := s.Matcher.Status(ticketID)
	if !found {
		writeErr(w, http.StatusNotFound, "ticket not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"status": status, "game_id": gameID})
}

// ---- Games ----

// GetGame returns the game info for the authenticated player.
// It uses the JWT to determine the player's colour and only exposes
// the opponent's username — no other player's ID is ever sent.
func (s *Server) GetGame(w http.ResponseWriter, r *http.Request) {
	claims := claimsFromContext(r)
	idStr := mux.Vars(r)["id"]
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid game id")
		return
	}
	g, err := s.Store.GetGameInfo(id, claims.UserID)
	if err != nil {
		writeErr(w, http.StatusNotFound, "game not found")
		return
	}
	writeJSON(w, http.StatusOK, g)
}

// GameHistory returns the authenticated player's recent games.
// Each entry includes the opponent's username and the player's colour
// in that game — no other player IDs are exposed.
func (s *Server) GameHistory(w http.ResponseWriter, r *http.Request) {
	claims := claimsFromContext(r)
	games, err := s.Store.UserGameHistory(claims.UserID, 50)
	if err != nil {
		log.Printf("history error: %v", err)
		writeErr(w, http.StatusInternalServerError, "could not load history")
		return
	}
	if games == nil {
		games = make([]store.HistoryEntry, 0)
	}
	writeJSON(w, http.StatusOK, games)
}

func (s *Server) Leaderboard(w http.ResponseWriter, r *http.Request) {
	entries, err := s.Store.Leaderboard(100)
	if err != nil {
		log.Printf("leaderboard error: %v", err)
		writeErr(w, http.StatusInternalServerError, "could not load leaderboard")
		return
	}
	if entries == nil {
		entries = make([]store.LeaderboardEntry, 0)
	}
	writeJSON(w, http.StatusOK, entries)
}

func (s *Server) Me(w http.ResponseWriter, r *http.Request) {
	claims := claimsFromContext(r)
	u, err := s.Store.GetUserByID(claims.UserID)
	if err != nil {
		writeErr(w, http.StatusNotFound, "user not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"user_id": u.ID, "username": u.Username, "rating": u.Rating,
	})
}
// Package ws bridges WebSocket connections to game sessions. Each connection
// gets its own read-pump goroutine; each subscription gets its own
// write-pump goroutine draining a Session's Broadcast channel. No chess
// logic lives here — this package only moves bytes between the socket and
// internal/game.
package ws

import (
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/gorilla/websocket"

	"chess-backend/internal/auth"
	"chess-backend/internal/game"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin:     func(r *http.Request) bool { return true }, // tighten via env allowlist in production
}

// ClientMessage is the only shape the frontend ever sends over the socket.
type ClientMessage struct {
	Type      string `json:"type"` // "move" | "resign" | "offer_draw"
	From      string `json:"from,omitempty"`
	To        string `json:"to,omitempty"`
	Promotion string `json:"promotion,omitempty"`
}

// ServerMessage wraps every payload pushed to the frontend so it can switch
// on `type` without any game-rule inference.
type ServerMessage struct {
	Type  string         `json:"type"` // "snapshot" | "error"
	Error string         `json:"error,omitempty"`
	State *game.Snapshot `json:"state,omitempty"`
}

type Hub struct {
	registry *game.Registry
}

func NewHub(registry *game.Registry) *Hub {
	return &Hub{registry: registry}
}

// ServeGame upgrades the connection and attaches it to the game identified
// by the URL path. Auth token is validated before upgrade.
func (h *Hub) ServeGame(w http.ResponseWriter, r *http.Request, gameID int64) {
	tokenStr := r.URL.Query().Get("token")
	claims, err := auth.ParseToken(tokenStr)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	sess, err := h.registry.Get(gameID)
	if err != nil {
		http.Error(w, "game not found or already finished", http.StatusNotFound)
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("ws upgrade error: %v", err)
		return
	}
	defer conn.Close()

	snap := sess.CurrentSnapshot()
	initMsg := ServerMessage{Type: "snapshot", State: &snap}
	initBytes, _ := json.Marshal(initMsg)
	conn.WriteMessage(websocket.TextMessage, initBytes)

	stopWriter := make(chan struct{})
	go h.writePump(conn, sess, stopWriter)
	h.readPump(conn, sess, claims.UserID, stopWriter)
}

func (h *Hub) writePump(conn *websocket.Conn, sess *game.Session, stop chan struct{}) {
	ticker := time.NewTicker(30 * time.Second) // keepalive ping
	defer ticker.Stop()
	for {
		select {
		case snap, ok := <-sess.Broadcast:
			if !ok {
				return
			}
			msg := ServerMessage{Type: "snapshot", State: &snap}
			b, _ := json.Marshal(msg)
			if err := conn.WriteMessage(websocket.TextMessage, b); err != nil {
				return
			}
		case <-ticker.C:
			if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		case <-stop:
			return
		}
	}
}

func (h *Hub) readPump(conn *websocket.Conn, sess *game.Session, playerID int64, stop chan struct{}) {
	defer close(stop)
	for {
		_, raw, err := conn.ReadMessage()
		if err != nil {
			return // client disconnected; session keeps running for reconnect
		}
		var msg ClientMessage
		if err := json.Unmarshal(raw, &msg); err != nil {
			h.sendError(conn, "malformed message")
			continue
		}

		var result game.MoveResult
		switch msg.Type {
		case "move":
			result = sess.SubmitMove(game.MoveRequest{
				PlayerID:  playerID,
				From:      msg.From,
				To:        msg.To,
				Promotion: msg.Promotion,
			})
		case "resign":
			result = sess.Resign(playerID)
		case "offer_draw":
			result = sess.OfferDraw(playerID)
		default:
			h.sendError(conn, "unknown message type")
			continue
		}

		if !result.OK {
			h.sendError(conn, result.Error)
			continue
		}
		// Successful moves are also delivered via Broadcast to all
		// subscribers (including this connection) — no need to double-send.
	}
}

func (h *Hub) sendError(conn *websocket.Conn, errMsg string) {
	msg := ServerMessage{Type: "error", Error: errMsg}
	b, _ := json.Marshal(msg)
	conn.WriteMessage(websocket.TextMessage, b)
}

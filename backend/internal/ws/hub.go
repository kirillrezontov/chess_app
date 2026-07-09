// Package ws bridges WebSocket connections to game sessions. Each connection
// gets its own read-pump goroutine; each subscription gets its own
// write-pump goroutine draining a per-connection Subscriber channel.
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
	CheckOrigin:     func(r *http.Request) bool { return true },
}

// ClientMessage is the only shape the frontend ever sends over the socket.
type ClientMessage struct {
	Type      string `json:"type"` // "move" | "resign" | "offer_draw" | "draw_response" | "legal_targets"
	From      string `json:"from,omitempty"`
	To        string `json:"to,omitempty"`
	Promotion string `json:"promotion,omitempty"`
	Accept    bool   `json:"accept,omitempty"`
}

// ServerMessage wraps every payload pushed to the frontend.
type ServerMessage struct {
	Type    string         `json:"type"` // "snapshot" | "error" | "legal_targets"
	Error   string         `json:"error,omitempty"`
	State   *game.Snapshot `json:"state,omitempty"`
	From    string         `json:"from,omitempty"`
	Targets []string       `json:"targets,omitempty"`
	Captures []string      `json:"captures,omitempty"`
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

	sub := sess.Subscribe()
	defer sess.Unsubscribe(sub)

	// Send initial snapshot
	snap := sess.CurrentSnapshot()
	initMsg := ServerMessage{Type: "snapshot", State: &snap}
	initBytes, _ := json.Marshal(initMsg)
	conn.WriteMessage(websocket.TextMessage, initBytes)

	stopWriter := make(chan struct{})
	go h.writePump(conn, sub, stopWriter)
	h.readPump(conn, sess, claims.UserID, stopWriter)
}

func (h *Hub) writePump(conn *websocket.Conn, sub game.Subscriber, stop chan struct{}) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case snap, ok := <-sub:
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
			return
		}
		var msg ClientMessage
		if err := json.Unmarshal(raw, &msg); err != nil {
			h.sendError(conn, "malformed message")
			continue
		}

		switch msg.Type {
		case "move":
			result := sess.SubmitMove(game.MoveRequest{
				PlayerID:  playerID,
				From:      msg.From,
				To:        msg.To,
				Promotion: msg.Promotion,
			})
			if !result.OK {
				h.sendError(conn, result.Error)
			}
		case "resign":
			result := sess.Resign(playerID)
			if !result.OK {
				h.sendError(conn, result.Error)
			}
		case "offer_draw":
			result := sess.OfferDraw(playerID)
			if !result.OK {
				h.sendError(conn, result.Error)
			}
		case "draw_response":
			result := sess.RespondDraw(playerID, msg.Accept)
			if !result.OK {
				h.sendError(conn, result.Error)
			}
		case "legal_targets":
			result := sess.SubmitLegalTargets(msg.From, playerID)
			if result.Error != "" {
				h.sendError(conn, result.Error)
			} else {
				h.sendJSON(conn, ServerMessage{
					Type:     "legal_targets",
					From:     result.From,
					Targets:  result.Targets,
					Captures: result.Captures,
				})
			}
		default:
			h.sendError(conn, "unknown message type")
		}
	}
}

func (h *Hub) sendError(conn *websocket.Conn, errMsg string) {
	msg := ServerMessage{Type: "error", Error: errMsg}
	b, _ := json.Marshal(msg)
	conn.WriteMessage(websocket.TextMessage, b)
}

func (h *Hub) sendJSON(conn *websocket.Conn, msg ServerMessage) {
	b, _ := json.Marshal(msg)
	conn.WriteMessage(websocket.TextMessage, b)
}
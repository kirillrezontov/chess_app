package api

import (
	"crypto/rand"
	"encoding/hex"
	"log"
	"sync"
	"time"

	"chess-backend/internal/game"
	"chess-backend/internal/store"
)

type ticketStatus string

const (
	ticketWaiting ticketStatus = "waiting"
	ticketMatched ticketStatus = "matched"
)

type ticket struct {
	ID             string
	UserID         int64
	InitialTimeSec int
	IncrementSec   int
	Status         ticketStatus
	GameID         int64
	CreatedAt      time.Time
}

// Matchmaker runs its own goroutine that periodically pairs waiting tickets
// with compatible time controls. One background loop, not one per request.
type Matchmaker struct {
	mu       sync.Mutex
	waiting  []*ticket
	byID     map[string]*ticket
	store    *store.Store
	registry *game.Registry
}

func NewMatchmaker(s *store.Store, r *game.Registry) *Matchmaker {
	m := &Matchmaker{
		byID:     make(map[string]*ticket),
		store:    s,
		registry: r,
	}
	go m.loop()
	go m.cleanupLoop()
	return m
}

func (m *Matchmaker) Enqueue(userID int64, initialSec, incSec int) *ticket {
	t := &ticket{
		ID:             randomID(),
		UserID:         userID,
		InitialTimeSec: initialSec,
		IncrementSec:   incSec,
		Status:         ticketWaiting,
		CreatedAt:      time.Now(),
	}
	m.mu.Lock()
	m.waiting = append(m.waiting, t)
	m.byID[t.ID] = t
	m.mu.Unlock()
	return t
}

func (m *Matchmaker) Status(ticketID string) (ticketStatus, int64, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	t, ok := m.byID[ticketID]
	if !ok {
		return "", 0, false
	}
	return t.Status, t.GameID, true
}

func (m *Matchmaker) loop() {
	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()
	for range ticker.C {
		m.tryMatch()
	}
}

// cleanupLoop removes stale tickets (waiting >5 min, matched >30 s) from byID
// to prevent unbounded memory growth.
func (m *Matchmaker) cleanupLoop() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for range ticker.C {
		m.mu.Lock()
		for id, t := range m.byID {
			age := time.Since(t.CreatedAt)
			if t.Status == ticketMatched && age > 30*time.Second {
				delete(m.byID, id)
			} else if t.Status == ticketWaiting && age > 5*time.Minute {
				delete(m.byID, id)
			}
		}
		m.mu.Unlock()
	}
}

func (m *Matchmaker) tryMatch() {
	m.mu.Lock()
	defer m.mu.Unlock()
	matchedIdx := map[int]bool{}
	for i := 0; i < len(m.waiting); i++ {
		if matchedIdx[i] {
			continue
		}
		a := m.waiting[i]
		for j := i + 1; j < len(m.waiting); j++ {
			if matchedIdx[j] {
				continue
			}
			b := m.waiting[j]
			if a.UserID == b.UserID {
				continue
			}
			if a.InitialTimeSec != b.InitialTimeSec || a.IncrementSec != b.IncrementSec {
				continue
			}

			var coin [1]byte
			rand.Read(coin[:])
			whiteTicket, blackTicket := a, b
			if coin[0]%2 == 1 {
				whiteTicket, blackTicket = b, a
			}
			gameID, err := m.store.CreateGame(whiteTicket.UserID, blackTicket.UserID, whiteTicket.InitialTimeSec, whiteTicket.IncrementSec)
			if err != nil {
				log.Printf("[matchmaker] CreateGame failed for users %d/%d: %v", whiteTicket.UserID, blackTicket.UserID, err)
				continue
			}
			if gameID <= 0 {
				log.Printf("[matchmaker] CreateGame returned invalid gameID=%d for users %d/%d", gameID, whiteTicket.UserID, blackTicket.UserID)
				continue
			}
			m.registry.Start(gameID, whiteTicket.UserID, blackTicket.UserID,
				time.Duration(whiteTicket.InitialTimeSec)*time.Second,
				time.Duration(whiteTicket.IncrementSec)*time.Second,
				m.store,
			)
			a.Status, a.GameID = ticketMatched, gameID
			b.Status, b.GameID = ticketMatched, gameID
			matchedIdx[i], matchedIdx[j] = true, true
			break
		}
	}

	if len(matchedIdx) > 0 {
		remaining := m.waiting[:0]
		for i, t := range m.waiting {
			if !matchedIdx[i] {
				remaining = append(remaining, t)
			}
		}
		m.waiting = remaining
	}
}

func randomID() string {
	b := make([]byte, 16)
	rand.Read(b)
	return hex.EncodeToString(b)
}

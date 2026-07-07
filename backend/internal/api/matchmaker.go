package api

import (
	"crypto/rand"
	"encoding/hex"
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
	return m
}

func (m *Matchmaker) Enqueue(userID int64, initialSec, incSec int) *ticket {
	t := &ticket{
		ID:             randomID(),
		UserID:         userID,
		InitialTimeSec: initialSec,
		IncrementSec:   incSec,
		Status:         ticketWaiting,
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
			gameID, err := m.store.CreateGame(a.UserID, b.UserID, a.InitialTimeSec, a.IncrementSec)
			if err != nil {
				continue
			}
			m.registry.Start(gameID, a.UserID, b.UserID,
				time.Duration(a.InitialTimeSec)*time.Second,
				time.Duration(a.IncrementSec)*time.Second,
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

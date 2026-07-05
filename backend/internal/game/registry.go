package game

import (
	"fmt"
	"sync"
	"time"

	"chess-backend/internal/store"
)

// Registry tracks every live Session. One process can host many concurrent
// games; each got its own goroutine via Start. Lookups are protected by a
// RWMutex since many WS read-pumps hit this concurrently.
type Registry struct {
	mu       sync.RWMutex
	sessions map[int64]*Session
}

func NewRegistry() *Registry {
	return &Registry{sessions: make(map[int64]*Session)}
}

// Start creates a session, launches its goroutine, and registers it.
// This is the "distinct thread per game" requirement realized with Go's
// scheduler — goroutines are cheap (KB-scale stacks), so thousands of
// concurrent games are fine on one process. For true process/container
// isolation per game (e.g. to hard-cap CPU per match, or to allow
// independent restarts), wrap this same Session behind a gRPC/HTTP shim
// and run it in its own container — see docker/README.md.
func (r *Registry) Start(id int64, whiteID, blackID int64, initial, increment time.Duration, st *store.Store) *Session {
	s := NewSession(id, whiteID, blackID, initial, increment, st)
	r.mu.Lock()
	r.sessions[id] = s
	r.mu.Unlock()
	go s.Run()
	return s
}

func (r *Registry) Get(id int64) (*Session, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	s, ok := r.sessions[id]
	if !ok {
		return nil, fmt.Errorf("no active session for game %d", id)
	}
	return s, nil
}

func (r *Registry) Remove(id int64) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if s, ok := r.sessions[id]; ok {
		s.Stop()
		delete(r.sessions, id)
	}
}

func (r *Registry) Count() int {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return len(r.sessions)
}

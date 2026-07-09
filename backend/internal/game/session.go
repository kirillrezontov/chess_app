// Package game hosts live game sessions. Each active game runs on its own
// goroutine (session.Run) reading from a buffered command channel — this is
// the "separate thread per game" model. For horizontal scaling beyond a
// single process, the same Session type can be lifted into its own
// container/process behind the ws hub; see docker/README for that variant.
package game

import (
        "log"
        "sync"
        "time"

        "chess-backend/internal/engine"
        "chess-backend/internal/store"
)

type Outcome string

const (
        OutcomeNone      Outcome = ""
        OutcomeWhiteWin  Outcome = "white_win"
        OutcomeBlackWin  Outcome = "black_win"
        OutcomeDraw      Outcome = "draw"
        OutcomeAbandoned Outcome = "abandoned"
)

type MoveRequest struct {
        PlayerID  int64
        From      string // algebraic e.g. "e2"
        To        string
        Promotion string // "", "q", "r", "b", "n"
        ReplyCh   chan MoveResult
}

type MoveResult struct {
        OK       bool
        Error    string
        Snapshot Snapshot
}

// Snapshot is the wire-format state pushed to clients after every mutation.
// This — and only this — is what the frontend ever sees.
type Snapshot struct {
        GameID          int64     `json:"game_id"`
        FEN             string    `json:"fen"`
        Turn            string    `json:"turn"`
        Status          string    `json:"status"`
        Outcome         Outcome   `json:"outcome"`
        LastMove        *LastMove `json:"last_move,omitempty"`
        WhiteClockMs    int64     `json:"white_clock_ms"`
        BlackClockMs    int64     `json:"black_clock_ms"`
        MoveList        []string  `json:"move_list"`
        InCheck         bool      `json:"in_check"`
        DrawOfferedBy   string    `json:"draw_offered,omitempty"` // "white" or "black" when a draw is pending
        LoserKingSquare string    `json:"loser_king_sq,omitempty"` // algebraic square of the mated king
}

type LastMove struct {
        From string `json:"from"`
        To   string `json:"to"`
}

type Player struct {
        ID    int64
        Color engine.Color
}

// Subscriber is a per-connection channel for fan-out delivery.
// Exported so the ws package can use it.
type Subscriber chan Snapshot

// Session owns one game's authoritative state. All access goes through the
// cmds channel so there is exactly one goroutine ever touching Board.
type Session struct {
        ID      int64
        White   Player
        Black   Player
        board   *engine.Board
        moveLog []string
        store   *store.Store

        whiteClock time.Duration
        blackClock time.Duration
        lastTick   time.Time
        increment  time.Duration

        cmds chan interface{}
        done chan struct{}

        // Subscriber fan-out (replaces single Broadcast channel).
        subscribers   map[Subscriber]struct{}
        subscribeCh   chan Subscriber
        unsubscribeCh chan Subscriber

        // lastMove persists the most recent move so that reconnecting clients
        // get the highlight via CurrentSnapshot().
        lastMove *LastMove

        mu      sync.Mutex // guards outcome, pendingDrawOffer, drawOfferedColor
        outcome Outcome

        // Draw offer state — only the session goroutine writes, mu for reads from CurrentSnapshot
        pendingDrawOffer int64  // 0 = none, otherwise playerID who offered
        drawOfferedColor string // "white" or "black"
}

type resignCmd struct {
        PlayerID int64
        ReplyCh  chan MoveResult
}

type drawOfferCmd struct {
        PlayerID int64
        ReplyCh  chan MoveResult
}

type drawResponseCmd struct {
        PlayerID int64
        Accept   bool
        ReplyCh  chan MoveResult
}

// ---- Legal targets command ----

type legalTargetsResult struct {
        From    string
        Targets []string
        Captures []string
        Error   string
}

type legalTargetsCmd struct {
        From     string
        PlayerID int64
        ReplyCh  chan legalTargetsResult
}

func NewSession(id int64, whiteID, blackID int64, initial time.Duration, increment time.Duration, st *store.Store) *Session {
        return &Session{
                ID:             id,
                White:          Player{ID: whiteID, Color: engine.White},
                Black:          Player{ID: blackID, Color: engine.Black},
                board:          engine.NewBoard(),
                whiteClock:     initial,
                blackClock:     initial,
                increment:      increment,
                cmds:           make(chan interface{}, 16),
                done:           make(chan struct{}),
                store:          st,
                subscribers:    make(map[Subscriber]struct{}),
                subscribeCh:    make(chan Subscriber, 4),
                unsubscribeCh:  make(chan Subscriber, 4),
        }
}

// Run is the single goroutine that owns this game's state for its entire
// lifetime. Launch with `go session.Run()` from the matchmaker/hub.
func (s *Session) Run() {
        s.lastTick = time.Now()
        clockTicker := time.NewTicker(200 * time.Millisecond)
        defer clockTicker.Stop()

        for {
                select {
                case cmd := <-s.cmds:
                        switch c := cmd.(type) {
                        case MoveRequest:
                                s.handleMove(c)
                        case resignCmd:
                                s.handleResign(c)
                        case drawOfferCmd:
                                s.handleDrawOffer(c)
                        case drawResponseCmd:
                                s.handleDrawResponse(c)
                        case legalTargetsCmd:
                                s.handleLegalTargets(c)
                        }
                case sub := <-s.subscribeCh:
                        s.subscribers[sub] = struct{}{}
                case sub := <-s.unsubscribeCh:
                        delete(s.subscribers, sub)
                        close(sub)
                case <-clockTicker.C:
                        s.tickClock()
                case <-s.done:
                        for sub := range s.subscribers {
                                close(sub)
                        }
                        return
                }
        }
}

func (s *Session) Stop() { close(s.done) }

func (s *Session) Subscribe() Subscriber {
        ch := make(Subscriber, 16)
        s.subscribeCh <- ch
        return ch
}

func (s *Session) Unsubscribe(ch Subscriber) {
        s.unsubscribeCh <- ch
}

// SubmitMove is the external, concurrency-safe entry point other goroutines
// (WS read pumps) use to propose a move.
func (s *Session) SubmitMove(req MoveRequest) MoveResult {
        req.ReplyCh = make(chan MoveResult, 1)
        s.cmds <- req
        return <-req.ReplyCh
}

func (s *Session) Resign(playerID int64) MoveResult {
        reply := make(chan MoveResult, 1)
        s.cmds <- resignCmd{PlayerID: playerID, ReplyCh: reply}
        return <-reply
}

func (s *Session) OfferDraw(playerID int64) MoveResult {
        reply := make(chan MoveResult, 1)
        s.cmds <- drawOfferCmd{PlayerID: playerID, ReplyCh: reply}
        return <-reply
}

// RespondDraw lets a player accept or reject a pending draw offer.
func (s *Session) RespondDraw(playerID int64, accept bool) MoveResult {
        reply := make(chan MoveResult, 1)
        s.cmds <- drawResponseCmd{PlayerID: playerID, Accept: accept, ReplyCh: reply}
        return <-reply
}

// SubmitLegalTargets asks the session for legal target squares from a given square.
func (s *Session) SubmitLegalTargets(from string, playerID int64) legalTargetsResult {
        reply := make(chan legalTargetsResult, 1)
        s.cmds <- legalTargetsCmd{From: from, PlayerID: playerID, ReplyCh: reply}
        return <-reply
}

func (s *Session) handleMove(req MoveRequest) {
        expectedColor := s.board.Turn
        mover := s.White
        if expectedColor == engine.Black {
                mover = s.Black
        }
        if req.PlayerID != mover.ID {
                req.ReplyCh <- MoveResult{OK: false, Error: "not your turn"}
                return
        }

        from, err := engine.ParseSquare(req.From)
        if err != nil {
                req.ReplyCh <- MoveResult{OK: false, Error: err.Error()}
                return
        }
        to, err := engine.ParseSquare(req.To)
        if err != nil {
                req.ReplyCh <- MoveResult{OK: false, Error: err.Error()}
                return
        }
        promo := parsePromotion(req.Promotion)

        if err := s.board.ApplyMove(engine.Move{From: from, To: to, Promotion: promo}); err != nil {
                req.ReplyCh <- MoveResult{OK: false, Error: err.Error()}
                return
        }

        // Clear any pending draw offer on move
        s.mu.Lock()
        s.pendingDrawOffer = 0
        s.drawOfferedColor = ""
        s.mu.Unlock()

        s.moveLog = append(s.moveLog, req.From+req.To)
        s.store.RecordMove(s.ID, s.board.FullmoveNum, req.From+req.To, s.board.FEN())

        s.lastMove = &LastMove{From: req.From, To: req.To}

        s.applyClockIncrement(expectedColor)
        status := s.board.Status()
        s.updateOutcomeFromStatus(status, expectedColor)

        snap := s.snapshot(s.lastMove)
        req.ReplyCh <- MoveResult{OK: true, Snapshot: snap}
        s.publish(snap)

        if s.outcome != OutcomeNone {
                log.Printf("game %d finished: %s", s.ID, s.outcome)
                s.store.FinishGame(s.ID, string(s.outcome), s.board.FEN())
        }
}

func (s *Session) handleResign(c resignCmd) {
        s.mu.Lock()
        if c.PlayerID == s.White.ID {
                s.outcome = OutcomeBlackWin
        } else if c.PlayerID == s.Black.ID {
                s.outcome = OutcomeWhiteWin
        }
        s.mu.Unlock()
        s.store.FinishGame(s.ID, string(s.outcome), s.board.FEN())
        snap := s.snapshot(s.lastMove)
        c.ReplyCh <- MoveResult{OK: true, Snapshot: snap}
        s.publish(snap)
}

// handleDrawOffer implements two-sided draw offer logic:
// - If no pending offer → store it and notify both players via snapshot
// - If the OTHER player already offered → accept the draw
// - If same player offers again → return error
func (s *Session) handleDrawOffer(c drawOfferCmd) {
        s.mu.Lock()
        if s.outcome != OutcomeNone {
                s.mu.Unlock()
                c.ReplyCh <- MoveResult{OK: false, Error: "game is already over"}
                return
        }
        if s.pendingDrawOffer == c.PlayerID {
                s.mu.Unlock()
                c.ReplyCh <- MoveResult{OK: false, Error: "you already offered a draw"}
                return
        }
        if s.pendingDrawOffer != 0 && s.pendingDrawOffer != c.PlayerID {
                // The other player already offered — accept the draw
                s.outcome = OutcomeDraw
                s.pendingDrawOffer = 0
                s.drawOfferedColor = ""
                s.mu.Unlock()
                s.store.FinishGame(s.ID, string(s.outcome), s.board.FEN())
                snap := s.snapshot(s.lastMove)
                c.ReplyCh <- MoveResult{OK: true, Snapshot: snap}
                s.publish(snap)
                return
        }
        // First offer — store and notify
        offererColor := "white"
        if c.PlayerID == s.Black.ID {
                offererColor = "black"
        }
        s.pendingDrawOffer = c.PlayerID
        s.drawOfferedColor = offererColor
        s.mu.Unlock()

        snap := s.snapshot(s.lastMove)
        c.ReplyCh <- MoveResult{OK: true, Snapshot: snap}
        s.publish(snap)
}

// handleDrawResponse handles accept/reject of a pending draw offer.
func (s *Session) handleDrawResponse(c drawResponseCmd) {
        s.mu.Lock()
        if s.pendingDrawOffer == 0 {
                s.mu.Unlock()
                c.ReplyCh <- MoveResult{OK: false, Error: "no pending draw offer"}
                return
        }
        if c.Accept {
                s.outcome = OutcomeDraw
                s.pendingDrawOffer = 0
                s.drawOfferedColor = ""
                s.mu.Unlock()
                s.store.FinishGame(s.ID, string(s.outcome), s.board.FEN())
                snap := s.snapshot(s.lastMove)
                c.ReplyCh <- MoveResult{OK: true, Snapshot: snap}
                s.publish(snap)
        } else {
                s.pendingDrawOffer = 0
                s.drawOfferedColor = ""
                s.mu.Unlock()
                snap := s.snapshot(s.lastMove)
                c.ReplyCh <- MoveResult{OK: true, Snapshot: snap}
                s.publish(snap)
        }
}

// handleLegalTargets returns legal target squares from a given square.
// Separates empty targets (moves) from capture targets for different dot rendering.
func (s *Session) handleLegalTargets(c legalTargetsCmd) {
        sq, err := engine.ParseSquare(c.From)
        if err != nil {
                c.ReplyCh <- legalTargetsResult{Error: "invalid square"}
                return
        }
        p := s.board.At(sq)
        if p.Type == engine.Empty {
                c.ReplyCh <- legalTargetsResult{Error: "no piece on that square"}
                return
        }
        // Verify it's the player's piece
        if p.Color == engine.White && c.PlayerID != s.White.ID {
                c.ReplyCh <- legalTargetsResult{Error: "not your piece"}
                return
        }
        if p.Color == engine.Black && c.PlayerID != s.Black.ID {
                c.ReplyCh <- legalTargetsResult{Error: "not your piece"}
                return
        }
        // Only allow querying on your turn
        if p.Color != s.board.Turn {
                c.ReplyCh <- legalTargetsResult{Error: "not your turn"}
                return
        }

        moves := s.board.LegalMovesFrom(sq)
        targets := make([]string, 0, len(moves))
        captures := make([]string, 0, len(moves))
        for _, m := range moves {
                if m.Captured != engine.Empty || m.IsEnPassant {
                        captures = append(captures, m.To.String())
                } else {
                        targets = append(targets, m.To.String())
                }
        }
        c.ReplyCh <- legalTargetsResult{
                From:     c.From,
                Targets:  targets,
                Captures: captures,
        }
}

func (s *Session) updateOutcomeFromStatus(status engine.GameStatus, justMoved engine.Color) {
        s.mu.Lock()
        defer s.mu.Unlock()
        switch status {
        case engine.Checkmate:
                if justMoved == engine.White {
                        s.outcome = OutcomeWhiteWin
                } else {
                        s.outcome = OutcomeBlackWin
                }
        case engine.Stalemate, engine.DrawFiftyMove, engine.DrawInsufficientMaterial, engine.DrawByRepetition:
                s.outcome = OutcomeDraw
        }
}

func (s *Session) tickClock() {
        now := time.Now()
        elapsed := now.Sub(s.lastTick)
        s.lastTick = now
        if s.board.Turn == engine.White {
                s.whiteClock -= elapsed
        } else {
                s.blackClock -= elapsed
        }
        s.mu.Lock()
        if s.whiteClock <= 0 {
                s.outcome = OutcomeBlackWin
        } else if s.blackClock <= 0 {
                s.outcome = OutcomeWhiteWin
        }
        outcomeSet := s.outcome != OutcomeNone
        s.mu.Unlock()
        if outcomeSet {
                s.store.FinishGame(s.ID, string(s.outcome), s.board.FEN())
                s.publish(s.snapshot(s.lastMove))
        }
}

func (s *Session) applyClockIncrement(mover engine.Color) {
        if mover == engine.White {
                s.whiteClock += s.increment
        } else {
                s.blackClock += s.increment
        }
}

func (s *Session) snapshot(last *LastMove) Snapshot {
        s.mu.Lock()
        outcome := s.outcome
        drawOffered := s.drawOfferedColor
        s.mu.Unlock()

        // Compute loser king square for checkmate animation
        var loserKingSq string
        if outcome == OutcomeWhiteWin || outcome == OutcomeBlackWin {
                // board.Turn is already flipped after the last move, so
                // the side to move is the one that just got mated.
                if sq, ok := s.board.KingSquare(s.board.Turn); ok {
                        loserKingSq = sq.String()
                }
        }

        return Snapshot{
                GameID:          s.ID,
                FEN:             s.board.FEN(),
                Turn:            s.board.Turn.String(),
                Status:          s.board.Status().String(),
                Outcome:         outcome,
                LastMove:        last,
                WhiteClockMs:    s.whiteClock.Milliseconds(),
                BlackClockMs:    s.blackClock.Milliseconds(),
                MoveList:        s.moveLog,
                InCheck:         s.board.IsInCheck(s.board.Turn),
                DrawOfferedBy:   drawOffered,
                LoserKingSquare: loserKingSq,
        }
}

// publish fans out the snapshot to ALL subscribed connections.
func (s *Session) publish(snap Snapshot) {
        for sub := range s.subscribers {
                select {
                case sub <- snap:
                default:
                }
        }
}

func parsePromotion(p string) engine.PieceType {
        switch p {
        case "q":
                return engine.Queen
        case "r":
                return engine.Rook
        case "b":
                return engine.Bishop
        case "n":
                return engine.Knight
        default:
                return engine.Empty
        }
}

// CurrentSnapshot returns the current game state including the persisted
// lastMove, so reconnecting clients see the move highlight.
func (s *Session) CurrentSnapshot() Snapshot {
        return s.snapshot(s.lastMove)
}
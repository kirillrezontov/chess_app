package engine

import "fmt"

type GameStatus int

const (
	InProgress GameStatus = iota
	Checkmate
	Stalemate
	DrawFiftyMove
	DrawInsufficientMaterial
	DrawByRepetition
)

func (s GameStatus) String() string {
	switch s {
	case InProgress:
		return "in_progress"
	case Checkmate:
		return "checkmate"
	case Stalemate:
		return "stalemate"
	case DrawFiftyMove:
		return "draw_fifty_move"
	case DrawInsufficientMaterial:
		return "draw_insufficient_material"
	case DrawByRepetition:
		return "draw_repetition"
	default:
		return "unknown"
	}
}

// ApplyMove validates that m is legal (recomputing legality server-side —
// never trust the caller) and mutates the board if so. Returns an error
// for illegal moves; the caller (game session) must not apply on error.
func (b *Board) ApplyMove(m Move) error {
	legal := b.LegalMoves()
	found := false
	var chosen Move
	for _, lm := range legal {
		if lm.From == m.From && lm.To == m.To && lm.Promotion == m.Promotion {
			found = true
			chosen = lm
			break
		}
	}
	if !found {
		return fmt.Errorf("illegal move %s-%s", m.From, m.To)
	}
	b.applyMoveUnchecked(chosen)
	return nil
}

func (b *Board) applyMoveUnchecked(m Move) {
	mover := b.Squares[m.From]
	isPawnMove := mover.Type == Pawn
	isCapture := m.Captured != Empty || m.IsEnPassant

	// clear old en passant target; recompute below if this move creates one
	b.EnPassant = nil

	if m.IsEnPassant {
		capRank := m.To.Rank() - 1
		if mover.Color == Black {
			capRank = m.To.Rank() + 1
		}
		b.Squares[SquareFromFileRank(m.To.File(), capRank)] = NoPiece
	}

	b.Squares[m.To] = mover
	b.Squares[m.From] = NoPiece

	if m.Promotion != Empty {
		b.Squares[m.To] = Piece{Type: m.Promotion, Color: mover.Color}
	}

	if m.IsCastle {
		rank := m.From.Rank()
		if m.To.File() == 6 { // kingside
			rookFrom := SquareFromFileRank(7, rank)
			rookTo := SquareFromFileRank(5, rank)
			b.Squares[rookTo] = b.Squares[rookFrom]
			b.Squares[rookFrom] = NoPiece
		} else { // queenside
			rookFrom := SquareFromFileRank(0, rank)
			rookTo := SquareFromFileRank(3, rank)
			b.Squares[rookTo] = b.Squares[rookFrom]
			b.Squares[rookFrom] = NoPiece
		}
	}

	// update castle rights
	if mover.Type == King {
		if mover.Color == White {
			b.Castle.WhiteKingside = false
			b.Castle.WhiteQueenside = false
		} else {
			b.Castle.BlackKingside = false
			b.Castle.BlackQueenside = false
		}
	}
	clearRightsIfRookMoved := func(sq Square) {
		switch sq {
		case SquareFromFileRank(0, 0):
			b.Castle.WhiteQueenside = false
		case SquareFromFileRank(7, 0):
			b.Castle.WhiteKingside = false
		case SquareFromFileRank(0, 7):
			b.Castle.BlackQueenside = false
		case SquareFromFileRank(7, 7):
			b.Castle.BlackKingside = false
		}
	}
	clearRightsIfRookMoved(m.From)
	clearRightsIfRookMoved(m.To)

	// set en passant target for a double pawn push
	if isPawnMove {
		diff := m.To.Rank() - m.From.Rank()
		if diff == 2 || diff == -2 {
			midRank := (m.To.Rank() + m.From.Rank()) / 2
			ep := SquareFromFileRank(m.From.File(), midRank)
			b.EnPassant = &ep
		}
	}

	if isPawnMove || isCapture {
		b.HalfmoveClk = 0
	} else {
		b.HalfmoveClk++
	}
	if mover.Color == Black {
		b.FullmoveNum++
	}
	b.Turn = b.Turn.Opposite()
}

// Status evaluates the board AFTER a move has been applied (i.e. from the
// perspective of the side now to move) and returns the resulting game status.
func (b *Board) Status() GameStatus {
	legal := b.LegalMoves()
	inCheck := b.IsInCheck(b.Turn)
	if len(legal) == 0 {
		if inCheck {
			return Checkmate
		}
		return Stalemate
	}
	if b.HalfmoveClk >= 100 { // 50 full moves = 100 halfmoves
		return DrawFiftyMove
	}
	if b.hasInsufficientMaterial() {
		return DrawInsufficientMaterial
	}
	return InProgress
}

// hasInsufficientMaterial covers the common forced-draw cases: K v K,
// K+minor v K, and K+B v K+B. Rarer theoretical draws (e.g. K+2N v K) are
// intentionally left for the fifty-move/repetition rules to catch instead.
func (b *Board) hasInsufficientMaterial() bool {
	var minorCount int
	for s := Square(0); s < 64; s++ {
		p := b.Squares[s]
		switch p.Type {
		case Pawn, Rook, Queen:
			return false
		case Bishop, Knight:
			minorCount++
		}
	}
	return minorCount <= 2
}

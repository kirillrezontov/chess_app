package engine

type Move struct {
	From      Square
	To        Square
	Promotion PieceType // Empty if not a promotion
	IsCastle  bool
	IsEnPassant bool
	Captured  PieceType // Empty if no capture, informational
}

var knightOffsets = [8][2]int{{1, 2}, {2, 1}, {2, -1}, {1, -2}, {-1, -2}, {-2, -1}, {-2, 1}, {-1, 2}}
var kingOffsets = [8][2]int{{1, 0}, {1, 1}, {0, 1}, {-1, 1}, {-1, 0}, {-1, -1}, {0, -1}, {1, -1}}
var bishopDirs = [4][2]int{{1, 1}, {1, -1}, {-1, 1}, {-1, -1}}
var rookDirs = [4][2]int{{1, 0}, {-1, 0}, {0, 1}, {0, -1}}

func inBounds(f, r int) bool { return f >= 0 && f < 8 && r >= 0 && r < 8 }

// LegalMoves returns all fully legal moves for the side to move: pseudo-legal
// moves filtered to exclude any that leave the mover's own king in check.
func (b *Board) LegalMoves() []Move {
	pseudo := b.pseudoLegalMoves(b.Turn)
	legal := make([]Move, 0, len(pseudo))
	for _, m := range pseudo {
		nb := b.Clone()
		nb.applyMoveUnchecked(m)
		if !nb.IsInCheck(b.Turn) {
			legal = append(legal, m)
		}
	}
	return legal
}

// LegalMovesFrom filters LegalMoves to those starting at a given square —
// what the frontend requests when a user picks up a piece, to highlight targets.
func (b *Board) LegalMovesFrom(from Square) []Move {
	all := b.LegalMoves()
	out := make([]Move, 0, 8)
	for _, m := range all {
		if m.From == from {
			out = append(out, m)
		}
	}
	return out
}

func (b *Board) IsInCheck(c Color) bool {
	kingSq, ok := b.KingSquare(c)
	if !ok {
		return false
	}
	return b.isSquareAttacked(kingSq, c.Opposite())
}

func (b *Board) isSquareAttacked(sq Square, by Color) bool {
	// Pawns
	dir := 1
	if by == Black {
		dir = -1
	}
	for _, df := range []int{-1, 1} {
		f, r := sq.File()-df, sq.Rank()-dir
		if inBounds(f, r) {
			p := b.At(SquareFromFileRank(f, r))
			if p.Type == Pawn && p.Color == by {
				return true
			}
		}
	}
	// Knights
	for _, o := range knightOffsets {
		f, r := sq.File()+o[0], sq.Rank()+o[1]
		if inBounds(f, r) {
			p := b.At(SquareFromFileRank(f, r))
			if p.Type == Knight && p.Color == by {
				return true
			}
		}
	}
	// King
	for _, o := range kingOffsets {
		f, r := sq.File()+o[0], sq.Rank()+o[1]
		if inBounds(f, r) {
			p := b.At(SquareFromFileRank(f, r))
			if p.Type == King && p.Color == by {
				return true
			}
		}
	}
	// Sliding: bishops/queens on diagonals
	for _, d := range bishopDirs {
		f, r := sq.File()+d[0], sq.Rank()+d[1]
		for inBounds(f, r) {
			p := b.At(SquareFromFileRank(f, r))
			if p.Type != Empty {
				if p.Color == by && (p.Type == Bishop || p.Type == Queen) {
					return true
				}
				break
			}
			f += d[0]
			r += d[1]
		}
	}
	// Sliding: rooks/queens on files/ranks
	for _, d := range rookDirs {
		f, r := sq.File()+d[0], sq.Rank()+d[1]
		for inBounds(f, r) {
			p := b.At(SquareFromFileRank(f, r))
			if p.Type != Empty {
				if p.Color == by && (p.Type == Rook || p.Type == Queen) {
					return true
				}
				break
			}
			f += d[0]
			r += d[1]
		}
	}
	return false
}

func (b *Board) pseudoLegalMoves(c Color) []Move {
	var moves []Move
	for s := Square(0); s < 64; s++ {
		p := b.Squares[s]
		if p.Type == Empty || p.Color != c {
			continue
		}
		switch p.Type {
		case Pawn:
			moves = append(moves, b.pawnMoves(s, c)...)
		case Knight:
			moves = append(moves, b.stepMoves(s, c, knightOffsets[:])...)
		case King:
			moves = append(moves, b.stepMoves(s, c, kingOffsets[:])...)
			moves = append(moves, b.castleMoves(s, c)...)
		case Bishop:
			moves = append(moves, b.slideMoves(s, c, bishopDirs[:])...)
		case Rook:
			moves = append(moves, b.slideMoves(s, c, rookDirs[:])...)
		case Queen:
			moves = append(moves, b.slideMoves(s, c, bishopDirs[:])...)
			moves = append(moves, b.slideMoves(s, c, rookDirs[:])...)
		}
	}
	return moves
}

func (b *Board) stepMoves(from Square, c Color, offsets [][2]int) []Move {
	var moves []Move
	for _, o := range offsets {
		f, r := from.File()+o[0], from.Rank()+o[1]
		if !inBounds(f, r) {
			continue
		}
		to := SquareFromFileRank(f, r)
		target := b.At(to)
		if target.Type == Empty || target.Color != c {
			moves = append(moves, Move{From: from, To: to, Captured: target.Type})
		}
	}
	return moves
}

func (b *Board) slideMoves(from Square, c Color, dirs [][2]int) []Move {
	var moves []Move
	for _, d := range dirs {
		f, r := from.File()+d[0], from.Rank()+d[1]
		for inBounds(f, r) {
			to := SquareFromFileRank(f, r)
			target := b.At(to)
			if target.Type == Empty {
				moves = append(moves, Move{From: from, To: to})
			} else {
				if target.Color != c {
					moves = append(moves, Move{From: from, To: to, Captured: target.Type})
				}
				break
			}
			f += d[0]
			r += d[1]
		}
	}
	return moves
}

func (b *Board) pawnMoves(from Square, c Color) []Move {
	var moves []Move
	dir := 1
	startRank, promoRank := 1, 7
	if c == Black {
		dir = -1
		startRank, promoRank = 6, 0
	}
	f, r := from.File(), from.Rank()+dir

	addWithPromotion := func(to Square, captured PieceType) {
		if to.Rank() == promoRank {
			for _, pt := range []PieceType{Queen, Rook, Bishop, Knight} {
				moves = append(moves, Move{From: from, To: to, Promotion: pt, Captured: captured})
			}
		} else {
			moves = append(moves, Move{From: from, To: to, Captured: captured})
		}
	}

	if inBounds(f, r) {
		to := SquareFromFileRank(f, r)
		if b.At(to).Type == Empty {
			addWithPromotion(to, Empty)
			if from.Rank() == startRank {
				r2 := r + dir
				to2 := SquareFromFileRank(f, r2)
				if b.At(to2).Type == Empty {
					moves = append(moves, Move{From: from, To: to2})
				}
			}
		}
	}
	for _, df := range []int{-1, 1} {
		cf, cr := from.File()+df, from.Rank()+dir
		if !inBounds(cf, cr) {
			continue
		}
		to := SquareFromFileRank(cf, cr)
		target := b.At(to)
		if target.Type != Empty && target.Color != c {
			addWithPromotion(to, target.Type)
		} else if b.EnPassant != nil && *b.EnPassant == to {
			moves = append(moves, Move{From: from, To: to, IsEnPassant: true, Captured: Pawn})
		}
	}
	return moves
}

func (b *Board) castleMoves(kingSq Square, c Color) []Move {
	var moves []Move
	rank := 0
	if c == Black {
		rank = 7
	}
	kingHome := SquareFromFileRank(4, rank)
	if kingSq != kingHome || b.IsInCheck(c) {
		return moves
	}
	canKingside, canQueenside := false, false
	if c == White {
		canKingside, canQueenside = b.Castle.WhiteKingside, b.Castle.WhiteQueenside
	} else {
		canKingside, canQueenside = b.Castle.BlackKingside, b.Castle.BlackQueenside
	}
	opp := c.Opposite()
	if canKingside {
		f5, f6 := SquareFromFileRank(5, rank), SquareFromFileRank(6, rank)
		rookSq := SquareFromFileRank(7, rank)
		if b.At(f5).Type == Empty && b.At(f6).Type == Empty && b.At(rookSq) == (Piece{Type: Rook, Color: c}) {
			if !b.isSquareAttacked(f5, opp) && !b.isSquareAttacked(f6, opp) {
				moves = append(moves, Move{From: kingSq, To: f6, IsCastle: true})
			}
		}
	}
	if canQueenside {
		f1, f2, f3 := SquareFromFileRank(1, rank), SquareFromFileRank(2, rank), SquareFromFileRank(3, rank)
		rookSq := SquareFromFileRank(0, rank)
		if b.At(f1).Type == Empty && b.At(f2).Type == Empty && b.At(f3).Type == Empty && b.At(rookSq) == (Piece{Type: Rook, Color: c}) {
			if !b.isSquareAttacked(f3, opp) && !b.isSquareAttacked(f2, opp) {
				moves = append(moves, Move{From: kingSq, To: f2, IsCastle: true})
			}
		}
	}
	return moves
}

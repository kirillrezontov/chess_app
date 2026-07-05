// Package engine implements chess rules: board representation, legal move
// generation, check/checkmate/stalemate detection, and FEN/PGN helpers.
// This is the ONLY place game business logic lives. The frontend never
// duplicates any of this — it just renders whatever state this package
// (via internal/game) decides is authoritative.
package engine

import "fmt"

type Color int

const (
	White Color = iota
	Black
)

func (c Color) Opposite() Color {
	if c == White {
		return Black
	}
	return White
}

func (c Color) String() string {
	if c == White {
		return "white"
	}
	return "black"
}

type PieceType int

const (
	Empty PieceType = iota
	Pawn
	Knight
	Bishop
	Rook
	Queen
	King
)

type Piece struct {
	Type  PieceType
	Color Color
}

var NoPiece = Piece{Type: Empty}

// Square is a 0..63 index, a1=0, h1=7, a8=56, h8=63 (standard little-endian rank-file).
type Square int

func SquareFromFileRank(file, rank int) Square { return Square(rank*8 + file) }
func (s Square) File() int                     { return int(s) % 8 }
func (s Square) Rank() int                     { return int(s) / 8 }

func (s Square) String() string {
	return fmt.Sprintf("%c%d", 'a'+s.File(), s.Rank()+1)
}

func ParseSquare(alg string) (Square, error) {
	if len(alg) != 2 {
		return 0, fmt.Errorf("invalid square %q", alg)
	}
	file := int(alg[0] - 'a')
	rank := int(alg[1] - '1')
	if file < 0 || file > 7 || rank < 0 || rank > 7 {
		return 0, fmt.Errorf("invalid square %q", alg)
	}
	return SquareFromFileRank(file, rank), nil
}

type CastleRights struct {
	WhiteKingside  bool
	WhiteQueenside bool
	BlackKingside  bool
	BlackQueenside bool
}

// Board is the full mutable game state needed to generate legal moves
// and to serialize/deserialize via FEN.
type Board struct {
	Squares      [64]Piece
	Turn         Color
	Castle       CastleRights
	EnPassant    *Square // target square for en passant capture, if any
	HalfmoveClk  int     // half-moves since last capture/pawn push (50-move rule)
	FullmoveNum  int
}

func NewBoard() *Board {
	b := &Board{Turn: White, FullmoveNum: 1}
	b.Castle = CastleRights{true, true, true, true}
	back := []PieceType{Rook, Knight, Bishop, Queen, King, Bishop, Knight, Rook}
	for f := 0; f < 8; f++ {
		b.Squares[SquareFromFileRank(f, 0)] = Piece{back[f], White}
		b.Squares[SquareFromFileRank(f, 1)] = Piece{Pawn, White}
		b.Squares[SquareFromFileRank(f, 6)] = Piece{Pawn, Black}
		b.Squares[SquareFromFileRank(f, 7)] = Piece{back[f], Black}
	}
	return b
}

func (b *Board) Clone() *Board {
	nb := *b
	if b.EnPassant != nil {
		ep := *b.EnPassant
		nb.EnPassant = &ep
	}
	return &nb
}

func (b *Board) At(s Square) Piece { return b.Squares[s] }

func (b *Board) KingSquare(c Color) (Square, bool) {
	for s := Square(0); s < 64; s++ {
		p := b.Squares[s]
		if p.Type == King && p.Color == c {
			return s, true
		}
	}
	return 0, false
}

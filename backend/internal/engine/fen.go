package engine

import (
	"fmt"
	"strconv"
	"strings"
)

var pieceLetters = map[PieceType]string{
	Pawn: "p", Knight: "n", Bishop: "b", Rook: "r", Queen: "q", King: "k",
}

func (b *Board) FEN() string {
	var sb strings.Builder
	for rank := 7; rank >= 0; rank-- {
		empty := 0
		for file := 0; file < 8; file++ {
			p := b.Squares[SquareFromFileRank(file, rank)]
			if p.Type == Empty {
				empty++
				continue
			}
			if empty > 0 {
				sb.WriteString(strconv.Itoa(empty))
				empty = 0
			}
			letter := pieceLetters[p.Type]
			if p.Color == White {
				letter = strings.ToUpper(letter)
			}
			sb.WriteString(letter)
		}
		if empty > 0 {
			sb.WriteString(strconv.Itoa(empty))
		}
		if rank > 0 {
			sb.WriteByte('/')
		}
	}

	sb.WriteByte(' ')
	if b.Turn == White {
		sb.WriteByte('w')
	} else {
		sb.WriteByte('b')
	}

	sb.WriteByte(' ')
	castle := ""
	if b.Castle.WhiteKingside {
		castle += "K"
	}
	if b.Castle.WhiteQueenside {
		castle += "Q"
	}
	if b.Castle.BlackKingside {
		castle += "k"
	}
	if b.Castle.BlackQueenside {
		castle += "q"
	}
	if castle == "" {
		castle = "-"
	}
	sb.WriteString(castle)

	sb.WriteByte(' ')
	if b.EnPassant != nil {
		sb.WriteString(b.EnPassant.String())
	} else {
		sb.WriteByte('-')
	}

	sb.WriteByte(' ')
	sb.WriteString(strconv.Itoa(b.HalfmoveClk))
	sb.WriteByte(' ')
	sb.WriteString(strconv.Itoa(b.FullmoveNum))

	return sb.String()
}

var letterToPiece = map[byte]PieceType{
	'p': Pawn, 'n': Knight, 'b': Bishop, 'r': Rook, 'q': Queen, 'k': King,
}

func FromFEN(fen string) (*Board, error) {
	fields := strings.Fields(fen)
	if len(fields) != 6 {
		return nil, fmt.Errorf("invalid FEN: expected 6 fields, got %d", len(fields))
	}
	b := &Board{}
	ranks := strings.Split(fields[0], "/")
	if len(ranks) != 8 {
		return nil, fmt.Errorf("invalid FEN board: expected 8 ranks")
	}
	for i, rankStr := range ranks {
		rank := 7 - i
		file := 0
		for _, ch := range rankStr {
			if ch >= '1' && ch <= '8' {
				file += int(ch - '0')
				continue
			}
			pt, ok := letterToPiece[byte(strings.ToLower(string(ch))[0])]
			if !ok {
				return nil, fmt.Errorf("invalid FEN piece char %q", ch)
			}
			color := Black
			if ch >= 'A' && ch <= 'Z' {
				color = White
			}
			if file > 7 {
				return nil, fmt.Errorf("invalid FEN: rank overflow")
			}
			b.Squares[SquareFromFileRank(file, rank)] = Piece{pt, color}
			file++
		}
	}

	if fields[1] == "w" {
		b.Turn = White
	} else {
		b.Turn = Black
	}

	b.Castle = CastleRights{
		WhiteKingside:  strings.Contains(fields[2], "K"),
		WhiteQueenside: strings.Contains(fields[2], "Q"),
		BlackKingside:  strings.Contains(fields[2], "k"),
		BlackQueenside: strings.Contains(fields[2], "q"),
	}

	if fields[3] != "-" {
		sq, err := ParseSquare(fields[3])
		if err != nil {
			return nil, err
		}
		b.EnPassant = &sq
	}

	halfmove, err := strconv.Atoi(fields[4])
	if err != nil {
		return nil, fmt.Errorf("invalid halfmove clock: %w", err)
	}
	b.HalfmoveClk = halfmove

	fullmove, err := strconv.Atoi(fields[5])
	if err != nil {
		return nil, fmt.Errorf("invalid fullmove number: %w", err)
	}
	b.FullmoveNum = fullmove

	return b, nil
}

const StartFEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"

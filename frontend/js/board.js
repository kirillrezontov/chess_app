// board.js — renders a chess board purely from data it's given: a FEN string
// and, optionally, a list of legal target squares for a selected piece
// (which the backend would supply — e.g. via a "legal_targets" WS message
// you can add server-side; today the UI shows drag-and-drop with a
// server-side accept/reject round trip and no client legality check).
//
// This module never decides if a move is legal. It only:
//  - draws pieces from FEN
//  - tracks which square is "selected" for display purposes
//  - fires a callback with {from, to} when the user drops/clicks a target
//  - lets the caller show/clear highlight classes

const FEN_TO_GLYPH = {
  p: "♟", n: "♞", b: "♝", r: "♜", q: "♛", k: "♚",
  P: "♙", N: "♘", B: "♗", R: "♖", Q: "♕", K: "♔",
};

const Board = (() => {
  let boardEl = null;
  let onMoveIntent = null; // callback(from, to)
  let selected = null;     // currently selected square, e.g. "e2"
  let orientationWhiteDown = true; // true = white pieces at bottom
  let currentFEN = null;

  function squareId(file, rank) {
    return String.fromCharCode(97 + file) + (rank + 1);
  }

  function init(element, moveIntentCallback) {
    boardEl = element;
    onMoveIntent = moveIntentCallback;
    buildEmptyGrid();
  }

  function buildEmptyGrid() {
    boardEl.innerHTML = "";
    for (let displayRow = 0; displayRow < 8; displayRow++) {
      for (let displayCol = 0; displayCol < 8; displayCol++) {
        const { file, rank } = displayToFileRank(displayRow, displayCol);
        const sq = document.createElement("div");
        sq.className = "square " + ((file + rank) % 2 === 0 ? "dark" : "light");
        sq.dataset.square = squareId(file, rank);
        sq.addEventListener("click", () => handleSquareClick(sq.dataset.square));
        sq.addEventListener("dragover", (e) => e.preventDefault());
        sq.addEventListener("drop", (e) => {
          e.preventDefault();
          const from = e.dataTransfer.getData("text/plain");
          handleDrop(from, sq.dataset.square);
        });
        boardEl.appendChild(sq);
      }
    }
  }

  function displayToFileRank(displayRow, displayCol) {
    if (orientationWhiteDown) {
      return { file: displayCol, rank: 7 - displayRow };
    }
    return { file: 7 - displayCol, rank: displayRow };
  }

  function setOrientation(whiteDown) {
    orientationWhiteDown = whiteDown;
    buildEmptyGrid();
    if (currentFEN) renderFEN(currentFEN);
  }

  function parseFENBoard(fen) {
    const placement = fen.split(" ")[0];
    const rows = placement.split("/"); // rank 8 down to rank 1
    const map = {}; // square -> glyph char (FEN letter)
    rows.forEach((rowStr, i) => {
      const rank = 7 - i;
      let file = 0;
      for (const ch of rowStr) {
        if (ch >= "1" && ch <= "8") {
          file += parseInt(ch, 10);
        } else {
          map[squareId(file, rank)] = ch;
          file += 1;
        }
      }
    });
    return map;
  }

  function renderFEN(fen) {
    currentFEN = fen;
    const pieceMap = parseFENBoard(fen);
    const squares = boardEl.querySelectorAll(".square");
    squares.forEach((sq) => {
      sq.innerHTML = "";
      const id = sq.dataset.square;
      const letter = pieceMap[id];
      if (letter) {
        const span = document.createElement("span");
        span.className = "piece";
        span.textContent = FEN_TO_GLYPH[letter] || "?";
        span.draggable = true;
        span.addEventListener("dragstart", (e) => {
          e.dataTransfer.setData("text/plain", id);
          span.classList.add("dragging");
        });
        span.addEventListener("dragend", () => span.classList.remove("dragging"));
        sq.appendChild(span);
      }
    });
  }

  function handleSquareClick(square) {
    if (!selected) {
      if (squareHasPiece(square)) {
        selectSquare(square);
      }
      return;
    }
    if (selected === square) {
      clearSelection();
      return;
    }
    const from = selected;
    clearSelection();
    onMoveIntent && onMoveIntent(from, square);
  }

  function handleDrop(from, to) {
    clearSelection();
    if (from && to && from !== to) {
      onMoveIntent && onMoveIntent(from, to);
    }
  }

  function squareHasPiece(square) {
    const sq = boardEl.querySelector(`.square[data-square="${square}"]`);
    return sq && sq.querySelector(".piece") !== null;
  }

  function selectSquare(square) {
    clearSelection();
    selected = square;
    const sq = boardEl.querySelector(`.square[data-square="${square}"]`);
    sq && sq.classList.add("selected");
  }

  function clearSelection() {
    if (!selected) return;
    const sq = boardEl.querySelector(`.square[data-square="${selected}"]`);
    sq && sq.classList.remove("selected");
    selected = null;
  }

  function highlightLegalTargets(targets) {
    clearHighlights();
    targets.forEach((sqId) => {
      const sq = boardEl.querySelector(`.square[data-square="${sqId}"]`);
      if (!sq) return;
      sq.classList.add(squareHasPiece(sqId) ? "legal-capture" : "legal-target");
    });
  }

  function clearHighlights() {
    boardEl.querySelectorAll(".legal-target, .legal-capture").forEach((el) => {
      el.classList.remove("legal-target", "legal-capture");
    });
  }

  function markLastMove(from, to) {
    boardEl.querySelectorAll(".last-move").forEach((el) => el.classList.remove("last-move"));
    [from, to].forEach((id) => {
      const sq = boardEl.querySelector(`.square[data-square="${id}"]`);
      sq && sq.classList.add("last-move");
    });
  }

  function markCheck(kingSquare) {
    boardEl.querySelectorAll(".king-in-check").forEach((el) => el.classList.remove("king-in-check"));
    if (kingSquare) {
      const sq = boardEl.querySelector(`.square[data-square="${kingSquare}"]`);
      sq && sq.classList.add("king-in-check");
    }
  }

  function findKingSquare(fen, color) {
    const pieceMap = parseFENBoard(fen);
    const letter = color === "white" ? "K" : "k";
    for (const [sq, ch] of Object.entries(pieceMap)) {
      if (ch === letter) return sq;
    }
    return null;
  }

  function setInteractive(enabled) {
    boardEl.querySelectorAll(".piece").forEach((p) => {
      p.draggable = enabled;
    });
  }

  return {
    init,
    renderFEN,
    setOrientation,
    highlightLegalTargets,
    clearHighlights,
    markLastMove,
    markCheck,
    findKingSquare,
    setInteractive,
  };
})();

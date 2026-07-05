// game.js — controls the live game screen. Every decision about whether a
// move is allowed happens on the backend; this file just:
//   - sends {from, to, promotion} intents over the WS connection
//   - renders whatever Snapshot comes back
//   - runs a purely cosmetic local clock ticker between server updates
//     (corrected back to server truth on every snapshot, never authoritative)

const GameView = (() => {
  let conn = null;
  let myUserId = null;
  let myColor = null; // "white" | "black"
  let latestSnapshot = null;
  let clockTimer = null;
  let pendingMove = null; // {from, to} awaiting promotion choice

  const els = {};

  function cacheEls() {
    els.fen = document.getElementById("fenDisplay");
    els.turn = document.getElementById("turnDisplay");
    els.check = document.getElementById("checkDisplay");
    els.topClock = document.getElementById("topClock");
    els.bottomClock = document.getElementById("bottomClock");
    els.topTag = document.getElementById("topPlayerTag");
    els.bottomTag = document.getElementById("bottomPlayerTag");
    els.moveList = document.getElementById("moveList");
    els.resignBtn = document.getElementById("resignBtn");
    els.offerDrawBtn = document.getElementById("offerDrawBtn");
    els.gameResult = document.getElementById("gameResult");
    els.backToLobbyBtn = document.getElementById("backToLobbyBtn");
    els.promoOverlay = document.getElementById("promoOverlay");
  }

  function start(gameId, userId, colorAssigned) {
    cacheEls();
    myUserId = userId;
    myColor = colorAssigned;
    Board.setOrientation(myColor !== "black");
    Board.setInteractive(false);

    els.gameResult.hidden = true;
    els.backToLobbyBtn.hidden = true;
    els.resignBtn.disabled = false;
    els.offerDrawBtn.disabled = false;

    conn = API.connectGame(gameId, {
      onOpen: () => App.setConnState("connected"),
      onClose: () => App.setConnState("disconnected"),
      onError: (msg) => App.toast(msg),
      onSnapshot: handleSnapshot,
    });

    Board.init(document.getElementById("board"), handleMoveIntent);

    els.resignBtn.onclick = () => conn.resign();
    els.offerDrawBtn.onclick = () => conn.offerDraw();
    els.backToLobbyBtn.onclick = () => {
      stop();
      Lobby.show();
    };

    els.promoOverlay.querySelectorAll("[data-piece]").forEach((btn) => {
      btn.onclick = () => {
        const piece = btn.dataset.piece;
        els.promoOverlay.hidden = true;
        if (pendingMove) {
          conn.sendMove(pendingMove.from, pendingMove.to, piece);
          pendingMove = null;
        }
      };
    });
  }

  function stop() {
    if (conn) conn.close();
    conn = null;
    if (clockTimer) clearInterval(clockTimer);
    clockTimer = null;
  }

  function handleMoveIntent(from, to) {
    if (!latestSnapshot || latestSnapshot.outcome) return; // game over, ignore
    if (latestSnapshot.turn !== myColor) {
      App.toast("not your turn");
      return;
    }
    if (isPromotionCandidate(from, to)) {
      pendingMove = { from, to };
      els.promoOverlay.hidden = false;
      return;
    }
    conn.sendMove(from, to, "");
  }

  // Purely a UX nicety to show the promotion picker before the round trip —
  // the backend is the one that actually decides if this move is legal at
  // all, promotion or not. If it disagrees, the move is simply rejected via
  // an error message and the board stays as it was.
  function isPromotionCandidate(from, to) {
    const fromRank = from[1];
    const toRank = to[1];
    return (fromRank === "7" && toRank === "8") || (fromRank === "2" && toRank === "1");
  }

  function handleSnapshot(snap) {
    latestSnapshot = snap;
    Board.renderFEN(snap.fen);
    Board.setInteractive(!snap.outcome);

    if (snap.last_move) {
      Board.markLastMove(snap.last_move.from, snap.last_move.to);
    }
    if (snap.in_check) {
      const kingColor = snap.turn;
      Board.markCheck(Board.findKingSquare(snap.fen, kingColor));
    } else {
      Board.markCheck(null);
    }

    els.fen.textContent = "fen: " + snap.fen;
    els.turn.textContent = "turn: " + snap.turn;
    els.check.hidden = !snap.in_check;

    updateClocks(snap);
    renderMoveList(snap.move_list || []);
    updateTurnHighlight(snap.turn);

    if (snap.outcome) {
      showResult(snap.outcome);
    }
  }

  function updateClocks(snap) {
    const whiteMs = snap.white_clock_ms;
    const blackMs = snap.black_clock_ms;
    const bottomIsWhite = myColor !== "black";
    els.bottomClock.textContent = formatClock(bottomIsWhite ? whiteMs : blackMs);
    els.topClock.textContent = formatClock(bottomIsWhite ? blackMs : whiteMs);
  }

  function formatClock(ms) {
    if (ms == null) return "--:--";
    const totalSec = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  function updateTurnHighlight(turn) {
    const bottomIsWhite = myColor !== "black";
    const bottomActive = (bottomIsWhite && turn === "white") || (!bottomIsWhite && turn === "black");
    els.bottomTag.classList.toggle("active-turn", bottomActive);
    els.topTag.classList.toggle("active-turn", !bottomActive);
  }

  function renderMoveList(moves) {
    els.moveList.innerHTML = "";
    moves.forEach((ply, i) => {
      const li = document.createElement("li");
      li.textContent = `${i + 1}. ${ply}`;
      els.moveList.appendChild(li);
    });
    els.moveList.scrollTop = els.moveList.scrollHeight;
  }

  function showResult(outcome) {
    const labels = {
      white_win: "white wins",
      black_win: "black wins",
      draw: "draw",
      abandoned: "abandoned",
    };
    els.gameResult.textContent = labels[outcome] || outcome;
    els.gameResult.hidden = false;
    els.backToLobbyBtn.hidden = false;
    els.resignBtn.disabled = true;
    els.offerDrawBtn.disabled = true;
  }

  return { start, stop };
})();

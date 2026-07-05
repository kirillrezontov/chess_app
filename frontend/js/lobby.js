// lobby.js — auth screen + lobby screen. Polls the queue ticket endpoint
// until matched, then hands off to GameView. No game rules here either —
// this is just account/matchmaking plumbing.

const Lobby = (() => {
  let pollTimer = null;
  let currentUser = null; // {user_id, username, rating}

  const els = {};

  function cacheEls() {
    els.loginForm = document.getElementById("loginForm");
    els.registerForm = document.getElementById("registerForm");
    els.loginError = document.getElementById("loginError");
    els.registerError = document.getElementById("registerError");
    els.tabs = document.querySelectorAll(".tab");
    els.joinQueueBtn = document.getElementById("joinQueueBtn");
    els.cancelQueueBtn = document.getElementById("cancelQueueBtn");
    els.queueStatus = document.getElementById("queueStatus");
    els.timeControlSelect = document.getElementById("timeControlSelect");
    els.leaderboardBody = document.querySelector("#leaderboardTable tbody");
    els.historyList = document.getElementById("historyList");
  }

  function init() {
    cacheEls();

    els.tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        els.tabs.forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        const target = tab.dataset.tab;
        els.loginForm.hidden = target !== "login";
        els.registerForm.hidden = target !== "register";
      });
    });

    els.loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      els.loginError.textContent = "";
      const fd = new FormData(els.loginForm);
      try {
        const data = await API.login(fd.get("username"), fd.get("password"));
        onAuthenticated(data);
      } catch (err) {
        els.loginError.textContent = err.message;
      }
    });

    els.registerForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      els.registerError.textContent = "";
      const fd = new FormData(els.registerForm);
      try {
        const data = await API.register(fd.get("username"), fd.get("email"), fd.get("password"));
        onAuthenticated(data);
      } catch (err) {
        els.registerError.textContent = err.message;
      }
    });

    els.joinQueueBtn.addEventListener("click", joinQueue);
    els.cancelQueueBtn.addEventListener("click", cancelQueue);
  }

  function onAuthenticated(data) {
    API.setToken(data.token);
    currentUser = data;
    App.onLogin(data);
    show();
  }

  async function show() {
    App.showView("lobby");
    await Promise.all([refreshLeaderboard(), refreshHistory()]);
  }

  async function refreshLeaderboard() {
    try {
      const entries = await API.leaderboard();
      els.leaderboardBody.innerHTML = "";
      entries.forEach((e) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${escapeHtml(e.Username)}</td><td>${e.Rating}</td><td>${e.Wins}</td><td>${e.Losses}</td><td>${e.Draws}</td>`;
        els.leaderboardBody.appendChild(tr);
      });
    } catch (err) {
      App.toast("could not load leaderboard: " + err.message);
    }
  }

  async function refreshHistory() {
    try {
      const games = await API.history();
      els.historyList.innerHTML = "";
      (games || []).forEach((g) => {
        const li = document.createElement("li");
        const outcomeClass = outcomeClassFor(g);
        li.innerHTML = `<span>game #${g.ID}</span><span class="${outcomeClass}">${g.Outcome || g.Status}</span>`;
        els.historyList.appendChild(li);
      });
    } catch (err) {
      App.toast("could not load history: " + err.message);
    }
  }

  function outcomeClassFor(g) {
    if (!g.Outcome) return "";
    if (g.Outcome === "draw") return "history-outcome-draw";
    const won =
      (g.Outcome === "white_win" && g.WhiteID === currentUser.user_id) ||
      (g.Outcome === "black_win" && g.BlackID === currentUser.user_id);
    return won ? "history-outcome-win" : "history-outcome-loss";
  }

  async function joinQueue() {
    const [initial, increment] = els.timeControlSelect.value.split(":").map(Number);
    els.joinQueueBtn.hidden = true;
    els.cancelQueueBtn.hidden = false;
    els.queueStatus.textContent = "searching for opponent...";
    try {
      const { ticket_id } = await API.joinQueue(initial, increment);
      pollTimer = setInterval(() => pollQueue(ticket_id), 1000);
    } catch (err) {
      App.toast("could not join queue: " + err.message);
      resetQueueUI();
    }
  }

  async function pollQueue(ticketId) {
    try {
      const status = await API.queueStatus(ticketId);
      if (status.status === "matched") {
        clearInterval(pollTimer);
        pollTimer = null;
        els.queueStatus.textContent = "matched — loading game...";
        const myColor = await resolveColor(status.game_id);
        GameView.start(status.game_id, currentUser.user_id, myColor);
        App.showView("game");
        resetQueueUI();
      }
    } catch (err) {
      clearInterval(pollTimer);
      pollTimer = null;
      App.toast("queue error: " + err.message);
      resetQueueUI();
    }
  }

  async function resolveColor(gameId) {
    const g = await API.getGame(gameId);
    return g.WhiteID === currentUser.user_id ? "white" : "black";
  }

  function cancelQueue() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
    resetQueueUI();
    els.queueStatus.textContent = "";
    // NOTE: does not yet call a DELETE /api/queue/{id} endpoint on the
    // backend — add one if you want server-side cancellation semantics
    // rather than the client simply stopping polling.
  }

  function resetQueueUI() {
    els.joinQueueBtn.hidden = false;
    els.cancelQueueBtn.hidden = true;
  }

  function escapeHtml(s) {
    const div = document.createElement("div");
    div.textContent = s;
    return div.innerHTML;
  }

  return { init, show, getCurrentUser: () => currentUser };
})();

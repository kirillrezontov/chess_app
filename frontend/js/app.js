// app.js — top-level wiring: which view is visible, the connection status
// pill, toast notifications, and session bootstrap on page load.

const App = (() => {
  const views = ["auth", "lobby", "game"];
  let toastTimer = null;

  function cacheEls() {
    return {
      connStatus: document.getElementById("connStatus"),
      userLabel: document.getElementById("userLabel"),
      logoutBtn: document.getElementById("logoutBtn"),
      toast: document.getElementById("toast"),
    };
  }
  let els;

  function showView(name) {
    views.forEach((v) => {
      document.getElementById(`view-${v}`).hidden = v !== name;
    });
  }

  function setConnState(state) {
    els.connStatus.dataset.state = state;
    els.connStatus.querySelector(".conn-label").textContent = state;
  }

  function toast(message) {
    els.toast.textContent = message;
    els.toast.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (els.toast.hidden = true), 3500);
  }

  function onLogin(data) {
    els.userLabel.textContent = `${data.username || "player"} (${data.rating ?? "—"})`;
    els.logoutBtn.hidden = false;
  }

  function logout() {
    API.clearToken();
    GameView.stop();
    els.userLabel.textContent = "guest";
    els.logoutBtn.hidden = true;
    showView("auth");
  }

  async function bootstrap() {
    els = cacheEls();
    els.logoutBtn.addEventListener("click", logout);
    Lobby.init();

    const token = API.getToken();
    if (token) {
      try {
        const me = await API.me();
        onLogin(me);
        await Lobby.show();
        return;
      } catch {
        API.clearToken();
      }
    }
    showView("auth");
  }

  document.addEventListener("DOMContentLoaded", bootstrap);

  return { showView, setConnState, toast, onLogin };
})();

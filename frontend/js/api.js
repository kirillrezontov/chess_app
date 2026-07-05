// api.js — thin transport layer only. Every function here either calls a
// REST endpoint or opens/uses a WebSocket. Nothing in this file decides
// whether a move is legal, whose turn it is, or what the board looks like;
// it only forwards intents to the backend and hands back whatever the
// backend says.

const API = (() => {
  const BASE = ""; // same-origin; nginx proxies /api and /ws to the backend

  function authHeaders() {
    const token = localStorage.getItem("chess_token");
    return token ? { Authorization: "Bearer " + token } : {};
  }

  async function request(method, path, body) {
    const res = await fetch(BASE + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || `request failed (${res.status})`);
    }
    return data;
  }

  return {
    register: (username, email, password) =>
      request("POST", "/api/register", { username, email, password }),

    login: (username, password) =>
      request("POST", "/api/login", { username, password }),

    me: () => request("GET", "/api/me"),

    joinQueue: (initialTimeSec, incrementSec) =>
      request("POST", "/api/queue", { initial_time_sec: initialTimeSec, increment_sec: incrementSec }),

    queueStatus: (ticketId) => request("GET", `/api/queue/${ticketId}`),

    getGame: (gameId) => request("GET", `/api/games/${gameId}`),

    history: () => request("GET", "/api/history"),

    leaderboard: () => request("GET", "/api/leaderboard"),

    setToken(token) {
      localStorage.setItem("chess_token", token);
    },
    clearToken() {
      localStorage.removeItem("chess_token");
    },
    getToken() {
      return localStorage.getItem("chess_token");
    },

    /**
     * Opens a WebSocket for live gameplay on a given game id.
     * handlers = { onOpen, onSnapshot(state), onError(msg), onClose }
     * Returns an object with .sendMove(from,to,promotion), .resign(), .offerDraw(), .close()
     */
    connectGame(gameId, handlers) {
      const token = this.getToken();
      const proto = location.protocol === "https:" ? "wss" : "ws";
      const ws = new WebSocket(`${proto}://${location.host}/ws/games/${gameId}?token=${encodeURIComponent(token)}`);

      ws.onopen = () => handlers.onOpen && handlers.onOpen();
      ws.onclose = () => handlers.onClose && handlers.onClose();
      ws.onerror = () => handlers.onError && handlers.onError("connection error");
      ws.onmessage = (evt) => {
        let msg;
        try {
          msg = JSON.parse(evt.data);
        } catch {
          return;
        }
        if (msg.type === "snapshot" && handlers.onSnapshot) {
          handlers.onSnapshot(msg.state);
        } else if (msg.type === "error" && handlers.onError) {
          handlers.onError(msg.error);
        }
      };

      return {
        sendMove(from, to, promotion) {
          ws.send(JSON.stringify({ type: "move", from, to, promotion: promotion || "" }));
        },
        resign() {
          ws.send(JSON.stringify({ type: "resign" }));
        },
        offerDraw() {
          ws.send(JSON.stringify({ type: "offer_draw" }));
        },
        close() {
          ws.close();
        },
      };
    },
  };
})();

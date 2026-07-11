package main

import (
        "log"
        "net/http"
        "os"
        "strconv"

        "github.com/gorilla/mux"

        "chess-backend/internal/api"
        "chess-backend/internal/game"
        "chess-backend/internal/store"
        "chess-backend/internal/ws"
)

func main() {
        dsn := os.Getenv("DATABASE_URL")
        if dsn == "" {
                dsn = "postgres://chess:chess@localhost:5432/chess?sslmode=disable"
        }

        db, err := store.Open(dsn)
        if err != nil {
                log.Fatalf("db connection failed: %v", err)
        }
        defer db.Close()

        registry := game.NewRegistry()
        server := api.NewServer(db, registry)
        hub := ws.NewHub(registry)

        r := mux.NewRouter()

        // REST — auth
        r.HandleFunc("/api/register", server.Register).Methods("POST")
        r.HandleFunc("/api/login", server.Login).Methods("POST")

        // REST — authenticated
        r.HandleFunc("/api/me", api.RequireAuth(server.Me)).Methods("GET")
        r.HandleFunc("/api/queue", api.RequireAuth(server.JoinQueue)).Methods("POST")
        r.HandleFunc("/api/queue/{ticketId}", api.RequireAuth(server.QueueStatus)).Methods("GET")
        r.HandleFunc("/api/games/{id}", api.RequireAuth(server.GetGame)).Methods("GET")
        r.HandleFunc("/api/games/{id}/moves", api.RequireAuth(server.GetGameMoves)).Methods("GET")
        r.HandleFunc("/api/history", api.RequireAuth(server.GameHistory)).Methods("GET")
        r.HandleFunc("/api/leaderboard", server.Leaderboard).Methods("GET")

        // Friends
        r.HandleFunc("/api/friends", api.RequireAuth(server.ListFriends)).Methods("GET")
        r.HandleFunc("/api/friends", api.RequireAuth(server.AddFriend)).Methods("POST")
        r.HandleFunc("/api/friends", api.RequireAuth(server.RemoveFriend)).Methods("DELETE")
        r.HandleFunc("/api/friends/search", api.RequireAuth(server.SearchUsers)).Methods("GET")
        r.HandleFunc("/api/friends/invite", api.RequireAuth(server.InviteFriend)).Methods("POST")

        // WebSocket — live game play, auth via ?token= query param
        r.HandleFunc("/ws/games/{id}", func(w http.ResponseWriter, req *http.Request) {
                idStr := mux.Vars(req)["id"]
                id, err := strconv.ParseInt(idStr, 10, 64)
                if err != nil {
                        http.Error(w, "invalid game id", http.StatusBadRequest)
                        return
                }
                hub.ServeGame(w, req, id)
        })

        r.Use(corsMiddleware)

        addr := os.Getenv("LISTEN_ADDR")
        if addr == "" {
                addr = ":8080"
        }
        log.Printf("chess backend listening on %s", addr)
        log.Fatal(http.ListenAndServe(addr, r))
}

func corsMiddleware(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
                w.Header().Set("Access-Control-Allow-Origin", "*") // tighten to frontend origin in production
                w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
                w.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
                if r.Method == "OPTIONS" {
                        w.WriteHeader(http.StatusOK)
                        return
                }
                next.ServeHTTP(w, r)
        })
}

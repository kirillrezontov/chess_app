package api

import (
	"context"
	"net/http"
	"strings"

	"chess-backend/internal/auth"
)

type ctxKey string

const claimsKey ctxKey = "claims"

// RequireAuth validates the Bearer token and injects claims into context.
// Handlers read the user via claimsFromContext — never by trusting a
// client-supplied user id in the body.
func RequireAuth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		header := r.Header.Get("Authorization")
		if !strings.HasPrefix(header, "Bearer ") {
			writeErr(w, http.StatusUnauthorized, "missing bearer token")
			return
		}
		tokenStr := strings.TrimPrefix(header, "Bearer ")
		claims, err := auth.ParseToken(tokenStr)
		if err != nil {
			writeErr(w, http.StatusUnauthorized, "invalid or expired token")
			return
		}
		ctx := context.WithValue(r.Context(), claimsKey, claims)
		next(w, r.WithContext(ctx))
	}
}

func claimsFromContext(r *http.Request) *auth.Claims {
	c, _ := r.Context().Value(claimsKey).(*auth.Claims)
	if c == nil {
		return &auth.Claims{} // callers behind RequireAuth always get a real one
	}
	return c
}

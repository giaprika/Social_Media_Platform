package auth

import (
	"context"
	"errors"
	"net/http"

	ctxkeys "chat-service/internal/context"
)

const (
	// UserIDHeader is the header name for user ID set by API Gateway
	UserIDHeader = "X-User-Id"
	// UserIDQueryParam is the query parameter name for user ID (fallback for WebSocket from browsers)
	UserIDQueryParam = "user_id"
)

var (
	ErrMissingUserID = errors.New("missing user id")
)

// ExtractUserIDFromHeader extracts user_id from X-User-Id header
// API Gateway is responsible for JWT validation and setting this header
func ExtractUserIDFromHeader(r *http.Request) (string, error) {
	userID := r.Header.Get(UserIDHeader)
	if userID == "" {
		return "", ErrMissingUserID
	}
	return userID, nil
}

// ExtractUserIDFromRequest extracts user_id from HTTP request.
// Priority: 1) X-User-Id header, 2) user_id query parameter
// This is useful for WebSocket connections where browsers don't support custom headers.
func ExtractUserIDFromRequest(r *http.Request) (string, error) {
	// Priority 1: Try header first
	userID := r.Header.Get(UserIDHeader)
	if userID != "" {
		return userID, nil
	}

	// Priority 2: Fallback to query parameter (for browser WebSocket)
	userID = r.URL.Query().Get(UserIDQueryParam)
	if userID != "" {
		return userID, nil
	}

	return "", ErrMissingUserID
}

// GetUserIDFromContext retrieves user_id from context
func GetUserIDFromContext(ctx context.Context) (string, error) {
	userID, ok := ctx.Value(ctxkeys.UserIDKey).(string)
	if !ok || userID == "" {
		return "", ErrMissingUserID
	}
	return userID, nil
}

// SetUserIDInContext sets user_id in context
func SetUserIDInContext(ctx context.Context, userID string) context.Context {
	return context.WithValue(ctx, ctxkeys.UserIDKey, userID)
}

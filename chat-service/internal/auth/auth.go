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

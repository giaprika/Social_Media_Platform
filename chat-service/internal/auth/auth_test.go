package auth

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	ctxkeys "chat-service/internal/context"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestExtractUserIDFromHeader_Success(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	req.Header.Set(UserIDHeader, "user-123")

	userID, err := ExtractUserIDFromHeader(req)

	require.NoError(t, err)
	assert.Equal(t, "user-123", userID)
}

func TestExtractUserIDFromHeader_MissingHeader(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/test", nil)

	userID, err := ExtractUserIDFromHeader(req)

	require.Error(t, err)
	assert.Equal(t, ErrMissingUserID, err)
	assert.Empty(t, userID)
}

func TestExtractUserIDFromHeader_EmptyHeader(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	req.Header.Set(UserIDHeader, "")

	userID, err := ExtractUserIDFromHeader(req)

	require.Error(t, err)
	assert.Equal(t, ErrMissingUserID, err)
	assert.Empty(t, userID)
}

func TestGetUserIDFromContext_Success(t *testing.T) {
	ctx := context.WithValue(context.Background(), ctxkeys.UserIDKey, "user-456")

	userID, err := GetUserIDFromContext(ctx)

	require.NoError(t, err)
	assert.Equal(t, "user-456", userID)
}

func TestGetUserIDFromContext_MissingValue(t *testing.T) {
	ctx := context.Background()

	userID, err := GetUserIDFromContext(ctx)

	require.Error(t, err)
	assert.Equal(t, ErrMissingUserID, err)
	assert.Empty(t, userID)
}

func TestGetUserIDFromContext_EmptyValue(t *testing.T) {
	ctx := context.WithValue(context.Background(), ctxkeys.UserIDKey, "")

	userID, err := GetUserIDFromContext(ctx)

	require.Error(t, err)
	assert.Equal(t, ErrMissingUserID, err)
	assert.Empty(t, userID)
}

func TestGetUserIDFromContext_WrongType(t *testing.T) {
	ctx := context.WithValue(context.Background(), ctxkeys.UserIDKey, 123)

	userID, err := GetUserIDFromContext(ctx)

	require.Error(t, err)
	assert.Equal(t, ErrMissingUserID, err)
	assert.Empty(t, userID)
}

func TestSetUserIDInContext(t *testing.T) {
	ctx := context.Background()

	newCtx := SetUserIDInContext(ctx, "user-789")

	userID, err := GetUserIDFromContext(newCtx)
	require.NoError(t, err)
	assert.Equal(t, "user-789", userID)
}

func TestSetUserIDInContext_OverwriteExisting(t *testing.T) {
	ctx := context.WithValue(context.Background(), ctxkeys.UserIDKey, "old-user")

	newCtx := SetUserIDInContext(ctx, "new-user")

	userID, err := GetUserIDFromContext(newCtx)
	require.NoError(t, err)
	assert.Equal(t, "new-user", userID)
}

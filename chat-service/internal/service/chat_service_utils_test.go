package service

import (
	"context"
	"testing"
	"time"

	chatv1 "chat-service/api/chat/v1"
	"chat-service/internal/repository"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/assert"
	"go.uber.org/zap"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func TestParseUUID(t *testing.T) {
	tests := []struct {
		name      string
		uuidStr   string
		wantError bool
	}{
		{
			name:      "valid UUID",
			uuidStr:   "550e8400-e29b-41d4-a716-446655440000",
			wantError: false,
		},
		{
			name:      "invalid UUID",
			uuidStr:   "invalid-uuid",
			wantError: true,
		},
		{
			name:      "empty UUID",
			uuidStr:   "",
			wantError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			uuid, err := parseUUID(tt.uuidStr)
			if tt.wantError {
				assert.Error(t, err)
				assert.False(t, uuid.Valid)
			} else {
				assert.NoError(t, err)
				assert.True(t, uuid.Valid)
			}
		})
	}
}

func TestParseUUID_EdgeCases(t *testing.T) {
	tests := []struct {
		name      string
		input     string
		wantError bool
	}{
		{
			name:      "valid lowercase UUID",
			input:     "550e8400-e29b-41d4-a716-446655440000",
			wantError: false,
		},
		{
			name:      "valid uppercase UUID",
			input:     "550E8400-E29B-41D4-A716-446655440000",
			wantError: false,
		},
		{
			name:      "UUID without hyphens",
			input:     "550e8400e29b41d4a716446655440000",
			wantError: false,
		},
		{
			name:      "malformed UUID",
			input:     "not-a-valid-uuid",
			wantError: true,
		},
		{
			name:      "partial UUID",
			input:     "550e8400-e29b",
			wantError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			uuid, err := parseUUID(tt.input)
			if tt.wantError {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
				assert.True(t, uuid.Valid)
			}
		})
	}
}

func TestUUIDToString(t *testing.T) {
	tests := []struct {
		name     string
		uuidStr  string
		expected bool
	}{
		{
			name:     "valid UUID conversion",
			uuidStr:  "550e8400-e29b-41d4-a716-446655440000",
			expected: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Parse UUID
			uuid, err := parseUUID(tt.uuidStr)
			assert.NoError(t, err)

			// Convert back to string
			result := uuidToString(uuid)
			assert.NotEmpty(t, result)
			assert.Contains(t, result, "-")
		})
	}
}

func TestUUIDToString_Invalid(t *testing.T) {
	var invalidUUID pgtype.UUID
	invalidUUID.Valid = false

	result := uuidToString(invalidUUID)
	assert.Empty(t, result)
}

func TestSanitizeLimit(t *testing.T) {
	assert.Equal(t, defaultMessagesLimit, sanitizeLimit(0))
	assert.Equal(t, defaultMessagesLimit, sanitizeLimit(-5))
	assert.Equal(t, int32(25), sanitizeLimit(25))
	assert.Equal(t, maxMessagesLimit, sanitizeLimit(1000))
}

func TestParseTimestampToPgtype(t *testing.T) {
	ts, err := parseTimestampToPgtype("2025-01-02T15:04:05Z")
	assert.NoError(t, err)
	assert.True(t, ts.Valid)

	ts2, err := parseTimestampToPgtype("2025-01-02T15:04:05.123456789Z")
	assert.NoError(t, err)
	assert.True(t, ts2.Valid)

	_, err = parseTimestampToPgtype("invalid")
	assert.Error(t, err)
}

func TestFormatTimestamp(t *testing.T) {
	var ts pgtype.Timestamptz
	assert.Equal(t, "", formatTimestamp(ts))

	ts.Scan(time.Date(2025, 1, 2, 15, 4, 5, 0, time.UTC))
	result := formatTimestamp(ts)
	assert.Contains(t, result, "2025-01-02T15:04:05")
}

func TestNewChatService(t *testing.T) {
	logger := zap.NewNop()
	mockIdempotency := new(MockIdempotencyChecker)

	service := NewChatService(nil, mockIdempotency, logger)

	assert.NotNil(t, service)
	assert.Equal(t, mockIdempotency, service.idempotencyCheck)
	assert.Equal(t, logger, service.logger)
}

func TestInjectableFunctions(t *testing.T) {
	logger := zap.NewNop()

	t.Run("beginTx uses injectable function", func(t *testing.T) {
		mockTx := &mockDBTX{}
		called := false

		service := &ChatService{
			logger: logger,
			beginTxFn: func(ctx context.Context) (repository.DBTX, error) {
				called = true
				return mockTx, nil
			},
		}

		tx, err := service.beginTx(context.Background())
		assert.NoError(t, err)
		assert.Equal(t, mockTx, tx)
		assert.True(t, called, "injectable function should be called")
	})

	t.Run("upsertConversation uses injectable function", func(t *testing.T) {
		called := false
		expectedConv := repository.Conversation{
			ID: mustParseUUID(t, "550e8400-e29b-41d4-a716-446655440000"),
		}

		service := &ChatService{
			logger: logger,
			upsertConversationFn: func(ctx context.Context, qtx *repository.Queries, id pgtype.UUID) (repository.Conversation, error) {
				called = true
				return expectedConv, nil
			},
		}

		conv, err := service.upsertConversation(context.Background(), nil, pgtype.UUID{})
		assert.NoError(t, err)
		assert.Equal(t, expectedConv, conv)
		assert.True(t, called, "injectable function should be called")
	})

	t.Run("insertMessage uses injectable function", func(t *testing.T) {
		called := false
		expectedMsg := repository.Message{
			ID:      mustParseUUID(t, "550e8400-e29b-41d4-a716-446655440000"),
			Content: "test message",
		}

		service := &ChatService{
			logger: logger,
			insertMessageFn: func(ctx context.Context, qtx *repository.Queries, params repository.InsertMessageParams) (repository.Message, error) {
				called = true
				return expectedMsg, nil
			},
		}

		msg, err := service.insertMessage(context.Background(), nil, repository.InsertMessageParams{})
		assert.NoError(t, err)
		assert.Equal(t, expectedMsg, msg)
		assert.True(t, called, "injectable function should be called")
	})
}

func TestGetConversations_MissingUserIDInContext(t *testing.T) {
	service := &ChatService{logger: zap.NewNop()}

	// Context without user_id
	ctx := context.Background()
	req := &chatv1.GetConversationsRequest{
		Limit: 50,
	}

	resp, err := service.GetConversations(ctx, req)

	assert.Nil(t, resp)
	assert.Error(t, err)
	assert.Equal(t, codes.Unauthenticated, status.Code(err))
	assert.Contains(t, err.Error(), "user_id not found in context")
}

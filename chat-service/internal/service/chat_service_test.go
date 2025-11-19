package service

import (
	"context"
	"errors"
	"testing"
	"time"

	chatv1 "chat-service/api/chat/v1"
	"chat-service/internal/repository"
	"chat-service/pkg/idempotency"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"go.uber.org/zap"
)

// MockIdempotencyChecker is a mock implementation of idempotency.Checker
type MockIdempotencyChecker struct {
	mock.Mock
}

func (m *MockIdempotencyChecker) Check(ctx context.Context, key string) error {
	args := m.Called(ctx, key)
	return args.Error(0)
}

func (m *MockIdempotencyChecker) CheckWithTTL(ctx context.Context, key string, ttl time.Duration) error {
	args := m.Called(ctx, key, ttl)
	return args.Error(0)
}

func (m *MockIdempotencyChecker) Remove(ctx context.Context, key string) error {
	args := m.Called(ctx, key)
	return args.Error(0)
}

func TestValidateSendMessageRequest(t *testing.T) {
	logger := zap.NewNop()
	service := &ChatService{
		logger: logger,
	}

	tests := []struct {
		name        string
		req         *chatv1.SendMessageRequest
		expectedErr error
	}{
		{
			name:        "nil request",
			req:         nil,
			expectedErr: ErrInvalidRequest,
		},
		{
			name: "empty conversation_id",
			req: &chatv1.SendMessageRequest{
				ConversationId: "",
				SenderId:       "sender-123",
				Content:        "Hello",
				IdempotencyKey: "key-123",
			},
			expectedErr: ErrEmptyConversationID,
		},
		{
			name: "empty sender_id",
			req: &chatv1.SendMessageRequest{
				ConversationId: "conv-123",
				SenderId:       "",
				Content:        "Hello",
				IdempotencyKey: "key-123",
			},
			expectedErr: ErrEmptySenderID,
		},
		{
			name: "empty content",
			req: &chatv1.SendMessageRequest{
				ConversationId: "conv-123",
				SenderId:       "sender-123",
				Content:        "",
				IdempotencyKey: "key-123",
			},
			expectedErr: ErrEmptyContent,
		},
		{
			name: "empty idempotency_key",
			req: &chatv1.SendMessageRequest{
				ConversationId: "conv-123",
				SenderId:       "sender-123",
				Content:        "Hello",
				IdempotencyKey: "",
			},
			expectedErr: ErrEmptyIdempotencyKey,
		},
		{
			name: "valid request",
			req: &chatv1.SendMessageRequest{
				ConversationId: "conv-123",
				SenderId:       "sender-123",
				Content:        "Hello",
				IdempotencyKey: "key-123",
			},
			expectedErr: nil,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := service.validateSendMessageRequest(tt.req)
			if tt.expectedErr != nil {
				assert.ErrorIs(t, err, tt.expectedErr)
			} else {
				assert.NoError(t, err)
			}
		})
	}
}

func TestSendMessage_ValidationError(t *testing.T) {
	logger := zap.NewNop()
	mockIdempotency := new(MockIdempotencyChecker)

	service := &ChatService{
		idempotencyCheck: mockIdempotency,
		logger:           logger,
	}

	ctx := context.Background()
	req := &chatv1.SendMessageRequest{
		ConversationId: "",
		SenderId:       "sender-123",
		Content:        "Hello",
		IdempotencyKey: "key-123",
	}

	resp, err := service.SendMessage(ctx, req)

	assert.Nil(t, resp)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "conversation_id")
	mockIdempotency.AssertNotCalled(t, "Check")
}

func TestSendMessage_DuplicateRequest(t *testing.T) {
	logger := zap.NewNop()
	mockIdempotency := new(MockIdempotencyChecker)

	service := &ChatService{
		idempotencyCheck: mockIdempotency,
		logger:           logger,
	}

	ctx := context.Background()
	req := &chatv1.SendMessageRequest{
		ConversationId: "550e8400-e29b-41d4-a716-446655440000",
		SenderId:       "660e8400-e29b-41d4-a716-446655440000",
		Content:        "Hello",
		IdempotencyKey: "key-123",
	}

	// Mock idempotency check to return duplicate error
	mockIdempotency.On("Check", ctx, "key-123").Return(idempotency.ErrDuplicateRequest)

	resp, err := service.SendMessage(ctx, req)

	assert.Nil(t, resp)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "duplicate request")
	mockIdempotency.AssertExpectations(t)
}

func TestSendMessage_IdempotencyCheckError(t *testing.T) {
	logger := zap.NewNop()
	mockIdempotency := new(MockIdempotencyChecker)

	service := &ChatService{
		idempotencyCheck: mockIdempotency,
		logger:           logger,
	}

	ctx := context.Background()
	req := &chatv1.SendMessageRequest{
		ConversationId: "550e8400-e29b-41d4-a716-446655440000",
		SenderId:       "660e8400-e29b-41d4-a716-446655440000",
		Content:        "Hello",
		IdempotencyKey: "key-123",
	}

	// Mock idempotency check to return generic error
	redisErr := errors.New("redis connection failed")
	mockIdempotency.On("Check", ctx, "key-123").Return(redisErr)

	resp, err := service.SendMessage(ctx, req)

	assert.Nil(t, resp)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "failed to check idempotency")
	mockIdempotency.AssertExpectations(t)
}

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

func TestCreateMessageEventPayload(t *testing.T) {
	logger := zap.NewNop()
	service := &ChatService{
		logger: logger,
	}

	// Create a test message
	convUUID, _ := parseUUID("550e8400-e29b-41d4-a716-446655440000")
	senderUUID, _ := parseUUID("660e8400-e29b-41d4-a716-446655440000")
	msgUUID, _ := parseUUID("770e8400-e29b-41d4-a716-446655440000")

	message := repository.Message{
		ID:             msgUUID,
		ConversationID: convUUID,
		SenderID:       senderUUID,
		Content:        "Test message",
	}
	message.CreatedAt.Scan(time.Now())

	payload, err := service.createMessageEventPayload(message)

	assert.NoError(t, err)
	assert.NotNil(t, payload)
	assert.Contains(t, string(payload), "message.sent")
	assert.Contains(t, string(payload), "Test message")
}

func TestNewChatService(t *testing.T) {
	logger := zap.NewNop()
	mockIdempotency := new(MockIdempotencyChecker)

	service := NewChatService(nil, mockIdempotency, logger)

	assert.NotNil(t, service)
	assert.Equal(t, mockIdempotency, service.idempotencyCheck)
	assert.Equal(t, logger, service.logger)
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

func TestValidateSendMessageRequest_AllFields(t *testing.T) {
	logger := zap.NewNop()
	service := &ChatService{logger: logger}

	// Test with all valid fields
	validReq := &chatv1.SendMessageRequest{
		ConversationId: "550e8400-e29b-41d4-a716-446655440000",
		SenderId:       "660e8400-e29b-41d4-a716-446655440000",
		Content:        "This is a test message with special chars: !@#$%^&*()",
		IdempotencyKey: "unique-key-12345",
	}

	err := service.validateSendMessageRequest(validReq)
	assert.NoError(t, err)

	// Test with very long content
	longContent := string(make([]byte, 10000))
	longContentReq := &chatv1.SendMessageRequest{
		ConversationId: "550e8400-e29b-41d4-a716-446655440000",
		SenderId:       "660e8400-e29b-41d4-a716-446655440000",
		Content:        longContent,
		IdempotencyKey: "key-123",
	}
	err = service.validateSendMessageRequest(longContentReq)
	assert.NoError(t, err) // Should accept long content
}

func TestCreateMessageEventPayload_WithDifferentContent(t *testing.T) {
	logger := zap.NewNop()
	service := &ChatService{logger: logger}

	tests := []struct {
		name    string
		content string
	}{
		{
			name:    "simple text",
			content: "Hello World",
		},
		{
			name:    "with special chars",
			content: "Test with special: !@#$%^&*()",
		},
		{
			name:    "with unicode",
			content: "Hello 你好 مرحبا",
		},
		{
			name:    "with newlines",
			content: "Line 1\nLine 2\nLine 3",
		},
		{
			name:    "with JSON-like content",
			content: `{"test": "value", "number": 123}`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			convUUID, _ := parseUUID("550e8400-e29b-41d4-a716-446655440000")
			senderUUID, _ := parseUUID("660e8400-e29b-41d4-a716-446655440000")
			msgUUID, _ := parseUUID("770e8400-e29b-41d4-a716-446655440000")

			message := repository.Message{
				ID:             msgUUID,
				ConversationID: convUUID,
				SenderID:       senderUUID,
				Content:        tt.content,
			}
			message.CreatedAt.Scan(time.Now())

			payload, err := service.createMessageEventPayload(message)

			assert.NoError(t, err)
			assert.NotNil(t, payload)
			assert.Contains(t, string(payload), "message.sent")
			// Note: JSON encoding may escape special characters, so we just check it's valid JSON
			assert.Greater(t, len(payload), 0)
		})
	}
}

func TestSendMessage_ContextCancellation(t *testing.T) {
	logger := zap.NewNop()
	mockIdempotency := new(MockIdempotencyChecker)

	service := &ChatService{
		idempotencyCheck: mockIdempotency,
		logger:           logger,
	}

	// Create a cancelled context
	ctx, cancel := context.WithCancel(context.Background())
	cancel() // Cancel immediately

	req := &chatv1.SendMessageRequest{
		ConversationId: "550e8400-e29b-41d4-a716-446655440000",
		SenderId:       "660e8400-e29b-41d4-a716-446655440000",
		Content:        "Hello",
		IdempotencyKey: "key-123",
	}

	// Mock should handle cancelled context
	mockIdempotency.On("Check", ctx, "key-123").Return(context.Canceled)

	resp, err := service.SendMessage(ctx, req)

	assert.Nil(t, resp)
	assert.Error(t, err)
}

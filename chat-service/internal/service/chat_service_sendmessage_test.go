package service

import (
	"context"
	"errors"
	"testing"
	"time"

	chatv1 "chat-service/internal/repository"
	"chat-service/pkg/idempotency"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/assert"
	"go.uber.org/zap"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	chatv1pb "chat-service/api/chat/v1"
)

func TestValidateSendMessageRequest(t *testing.T) {
	logger := zap.NewNop()
	service := &ChatService{
		logger: logger,
	}

	tests := []struct {
		name        string
		req         *chatv1pb.SendMessageRequest
		expectedErr error
	}{
		{
			name:        "nil request",
			req:         nil,
			expectedErr: ErrInvalidRequest,
		},
		{
			name: "empty conversation_id",
			req: &chatv1pb.SendMessageRequest{
				ConversationId: "",
				Content:        "Hello",
				IdempotencyKey: "key-123",
			},
			expectedErr: ErrEmptyConversationID,
		},
		{
			name: "empty content",
			req: &chatv1pb.SendMessageRequest{
				ConversationId: "conv-123",
				Content:        "",
				IdempotencyKey: "key-123",
			},
			expectedErr: ErrEmptyContent,
		},
		{
			name: "empty idempotency_key",
			req: &chatv1pb.SendMessageRequest{
				ConversationId: "conv-123",
				Content:        "Hello",
				IdempotencyKey: "",
			},
			expectedErr: ErrEmptyIdempotencyKey,
		},
		{
			name: "valid request",
			req: &chatv1pb.SendMessageRequest{
				ConversationId: "conv-123",
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

func TestValidateSendMessageRequest_AllFields(t *testing.T) {
	logger := zap.NewNop()
	service := &ChatService{logger: logger}

	// Test with all valid fields
	validReq := &chatv1pb.SendMessageRequest{
		ConversationId: "550e8400-e29b-41d4-a716-446655440000",
		Content:        "This is a test message with special chars: !@#$%^&*()",
		IdempotencyKey: "unique-key-12345",
	}

	err := service.validateSendMessageRequest(validReq)
	assert.NoError(t, err)

	// Test with very long content
	longContent := string(make([]byte, 10000))
	longContentReq := &chatv1pb.SendMessageRequest{
		ConversationId: "550e8400-e29b-41d4-a716-446655440000",
		Content:        longContent,
		IdempotencyKey: "key-123",
	}
	err = service.validateSendMessageRequest(longContentReq)
	assert.NoError(t, err) // Should accept long content
}

func TestSendMessage_ValidationError(t *testing.T) {
	logger := zap.NewNop()
	mockIdempotency := new(MockIdempotencyChecker)

	service := &ChatService{
		idempotencyCheck: mockIdempotency,
		logger:           logger,
	}

	// Create context with user_id
	ctx := contextWithUserID("660e8400-e29b-41d4-a716-446655440000")
	req := &chatv1pb.SendMessageRequest{
		ConversationId: "",
		Content:        "Hello",
		IdempotencyKey: "key-123",
	}

	resp, err := service.SendMessage(ctx, req)

	assert.Nil(t, resp)
	assert.Error(t, err)
	assert.Equal(t, codes.InvalidArgument, status.Code(err))
	assert.Contains(t, err.Error(), "conversation_id")
	mockIdempotency.AssertNotCalled(t, "Check")
}

func TestSendMessage_MissingUserIDInContext(t *testing.T) {
	logger := zap.NewNop()
	mockIdempotency := new(MockIdempotencyChecker)

	// Track if any database operations are called
	beginTxCalled := false
	upsertConvCalled := false
	addParticipantCalled := false
	insertMsgCalled := false
	updateLastMsgCalled := false
	insertOutboxCalled := false

	service := &ChatService{
		idempotencyCheck: mockIdempotency,
		logger:           logger,
		// Set up injectable functions to track if they're called
		beginTxFn: func(ctx context.Context) (chatv1.DBTX, error) {
			beginTxCalled = true
			return nil, errors.New("should not be called")
		},
		upsertConversationFn: func(ctx context.Context, qtx *chatv1.Queries, id pgtype.UUID) (chatv1.Conversation, error) {
			upsertConvCalled = true
			return chatv1.Conversation{}, errors.New("should not be called")
		},
		addParticipantFn: func(ctx context.Context, qtx *chatv1.Queries, params chatv1.AddParticipantParams) error {
			addParticipantCalled = true
			return errors.New("should not be called")
		},
		insertMessageFn: func(ctx context.Context, qtx *chatv1.Queries, params chatv1.InsertMessageParams) (chatv1.Message, error) {
			insertMsgCalled = true
			return chatv1.Message{}, errors.New("should not be called")
		},
		updateLastMessageFn: func(ctx context.Context, qtx *chatv1.Queries, params chatv1.UpdateConversationLastMessageParams) error {
			updateLastMsgCalled = true
			return errors.New("should not be called")
		},
		insertOutboxFn: func(ctx context.Context, qtx *chatv1.Queries, params chatv1.InsertOutboxParams) error {
			insertOutboxCalled = true
			return errors.New("should not be called")
		},
	}

	// Context without user_id
	ctx := context.Background()
	req := &chatv1pb.SendMessageRequest{
		ConversationId: "550e8400-e29b-41d4-a716-446655440000",
		Content:        "Hello",
		IdempotencyKey: "key-123",
	}

	resp, err := service.SendMessage(ctx, req)

	assert.Nil(t, resp)
	assert.Error(t, err)
	assert.Equal(t, codes.Unauthenticated, status.Code(err))
	assert.Contains(t, err.Error(), "user_id not found in context")
	
	// Verify no idempotency check occurred
	mockIdempotency.AssertNotCalled(t, "Check")
	
	// Verify no database operations were attempted
	assert.False(t, beginTxCalled, "beginTx should not be called without authentication")
	assert.False(t, upsertConvCalled, "upsertConversation should not be called without authentication")
	assert.False(t, addParticipantCalled, "addParticipant should not be called without authentication")
	assert.False(t, insertMsgCalled, "insertMessage should not be called without authentication")
	assert.False(t, updateLastMsgCalled, "updateLastMessage should not be called without authentication")
	assert.False(t, insertOutboxCalled, "insertOutbox should not be called without authentication")
}

func TestSendMessage_DuplicateRequest(t *testing.T) {
	logger := zap.NewNop()
	mockIdempotency := new(MockIdempotencyChecker)

	// Track if any database operations are called
	beginTxCalled := false
	upsertConvCalled := false
	insertMsgCalled := false

	service := &ChatService{
		idempotencyCheck: mockIdempotency,
		logger:           logger,
		// Set up injectable functions to track if they're called
		beginTxFn: func(ctx context.Context) (chatv1.DBTX, error) {
			beginTxCalled = true
			return nil, errors.New("should not be called")
		},
		upsertConversationFn: func(ctx context.Context, qtx *chatv1.Queries, id pgtype.UUID) (chatv1.Conversation, error) {
			upsertConvCalled = true
			return chatv1.Conversation{}, errors.New("should not be called")
		},
		insertMessageFn: func(ctx context.Context, qtx *chatv1.Queries, params chatv1.InsertMessageParams) (chatv1.Message, error) {
			insertMsgCalled = true
			return chatv1.Message{}, errors.New("should not be called")
		},
	}

	// Create context with user_id
	ctx := contextWithUserID("660e8400-e29b-41d4-a716-446655440000")
	req := &chatv1pb.SendMessageRequest{
		ConversationId: "550e8400-e29b-41d4-a716-446655440000",
		Content:        "Hello",
		IdempotencyKey: "key-123",
	}

	// Mock idempotency check to return duplicate error
	mockIdempotency.On("Check", ctx, "key-123").Return(idempotency.ErrDuplicateRequest)

	resp, err := service.SendMessage(ctx, req)

	assert.Nil(t, resp)
	assert.Error(t, err)
	assert.Equal(t, codes.AlreadyExists, status.Code(err))
	assert.Contains(t, err.Error(), "duplicate request")
	mockIdempotency.AssertExpectations(t)

	// Verify no database operations were attempted
	assert.False(t, beginTxCalled, "beginTx should not be called for duplicate requests")
	assert.False(t, upsertConvCalled, "upsertConversation should not be called for duplicate requests")
	assert.False(t, insertMsgCalled, "insertMessage should not be called for duplicate requests")
}

func TestSendMessage_IdempotencyCheckError(t *testing.T) {
	logger := zap.NewNop()
	mockIdempotency := new(MockIdempotencyChecker)

	// Track if any database operations are called
	beginTxCalled := false
	upsertConvCalled := false
	insertMsgCalled := false

	service := &ChatService{
		idempotencyCheck: mockIdempotency,
		logger:           logger,
		// Set up injectable functions to track if they're called
		beginTxFn: func(ctx context.Context) (chatv1.DBTX, error) {
			beginTxCalled = true
			return nil, errors.New("should not be called")
		},
		upsertConversationFn: func(ctx context.Context, qtx *chatv1.Queries, id pgtype.UUID) (chatv1.Conversation, error) {
			upsertConvCalled = true
			return chatv1.Conversation{}, errors.New("should not be called")
		},
		insertMessageFn: func(ctx context.Context, qtx *chatv1.Queries, params chatv1.InsertMessageParams) (chatv1.Message, error) {
			insertMsgCalled = true
			return chatv1.Message{}, errors.New("should not be called")
		},
	}

	// Create context with user_id
	ctx := contextWithUserID("660e8400-e29b-41d4-a716-446655440000")
	req := &chatv1pb.SendMessageRequest{
		ConversationId: "550e8400-e29b-41d4-a716-446655440000",
		Content:        "Hello",
		IdempotencyKey: "key-123",
	}

	// Mock idempotency check to return generic error (Redis connection failure)
	redisErr := errors.New("redis connection failed")
	mockIdempotency.On("Check", ctx, "key-123").Return(redisErr)

	resp, err := service.SendMessage(ctx, req)

	assert.Nil(t, resp)
	assert.Error(t, err)
	assert.Equal(t, codes.Internal, status.Code(err))
	assert.Contains(t, err.Error(), "failed to check idempotency")
	mockIdempotency.AssertExpectations(t)

	// Verify no database operations were attempted
	assert.False(t, beginTxCalled, "beginTx should not be called when idempotency check fails")
	assert.False(t, upsertConvCalled, "upsertConversation should not be called when idempotency check fails")
	assert.False(t, insertMsgCalled, "insertMessage should not be called when idempotency check fails")
}

func TestSendMessage_ContextCancellation(t *testing.T) {
	logger := zap.NewNop()
	mockIdempotency := new(MockIdempotencyChecker)

	service := &ChatService{
		idempotencyCheck: mockIdempotency,
		logger:           logger,
	}

	// Create a cancelled context with user_id
	ctx, cancel := context.WithCancel(contextWithUserID("660e8400-e29b-41d4-a716-446655440000"))
	cancel() // Cancel immediately

	req := &chatv1pb.SendMessageRequest{
		ConversationId: "550e8400-e29b-41d4-a716-446655440000",
		Content:        "Hello",
		IdempotencyKey: "key-123",
	}

	// Mock should handle cancelled context
	mockIdempotency.On("Check", ctx, "key-123").Return(context.Canceled)

	resp, err := service.SendMessage(ctx, req)

	assert.Nil(t, resp)
	assert.Error(t, err)
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

	message := chatv1.Message{
		ID:             msgUUID,
		ConversationID: convUUID,
		SenderID:       senderUUID,
		Content:        "Test message",
	}
	message.CreatedAt.Scan(time.Now())

	receiverIDs := []string{"receiver-1", "receiver-2"}
	payload, err := service.createMessageEventPayload(message, receiverIDs)

	assert.NoError(t, err)
	assert.NotNil(t, payload)
	assert.Contains(t, string(payload), "message.sent")
	assert.Contains(t, string(payload), "Test message")
	assert.Contains(t, string(payload), "receiver_ids")
	assert.Contains(t, string(payload), "receiver-1")
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

			message := chatv1.Message{
				ID:             msgUUID,
				ConversationID: convUUID,
				SenderID:       senderUUID,
				Content:        tt.content,
			}
			message.CreatedAt.Scan(time.Now())

			receiverIDs := []string{"receiver-1"}
			payload, err := service.createMessageEventPayload(message, receiverIDs)

			assert.NoError(t, err)
			assert.NotNil(t, payload)
			assert.Contains(t, string(payload), "message.sent")
			assert.Greater(t, len(payload), 0)
		})
	}
}

package service

import (
	"errors"
	"testing"

	chatv1pb "chat-service/api/chat/v1"

	"github.com/stretchr/testify/assert"
	"go.uber.org/zap"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// TestMockTransactionHelpers_HappyPath verifies the happy path transaction helper setup
func TestMockTransactionHelpers_HappyPath(t *testing.T) {
	logger := zap.NewNop()
	mockIdempotency := new(MockIdempotencyChecker)
	mockTxHelpers := newMockTransactionHelpers()

	conversationID := mustParseUUID(t, "550e8400-e29b-41d4-a716-446655440000")
	senderID := mustParseUUID(t, "660e8400-e29b-41d4-a716-446655440000")
	messageID := mustParseUUID(t, "770e8400-e29b-41d4-a716-446655440000")
	content := "Test message"

	// Setup happy path transaction
	mockTxHelpers.setupHappyPathTransaction(conversationID, senderID, messageID, content)

	// Create service and inject mocks
	service := &ChatService{
		idempotencyCheck: mockIdempotency,
		logger:           logger,
	}
	mockTxHelpers.injectIntoService(service)

	// Mock idempotency check
	ctx := contextWithUserID(uuidToString(senderID))
	mockIdempotency.On("Check", ctx, "test-key").Return(nil)

	req := &chatv1pb.SendMessageRequest{
		ConversationId: uuidToString(conversationID),
		Content:        content,
		IdempotencyKey: "test-key",
	}

	// Execute
	resp, err := service.SendMessage(ctx, req)

	// Verify
	assert.NoError(t, err)
	assert.NotNil(t, resp)
	assert.NotEmpty(t, resp.MessageId)
	assert.Equal(t, "SENT", resp.Status)
	mockIdempotency.AssertExpectations(t)
}

// TestSendMessage_HappyPath_VerifyTransactionOrder tests the happy path and verifies
// that all transaction steps are called in the correct order
func TestSendMessage_HappyPath_VerifyTransactionOrder(t *testing.T) {
	logger := zap.NewNop()
	mockIdempotency := new(MockIdempotencyChecker)
	mockTxHelpers := newMockTransactionHelpers()

	conversationID := mustParseUUID(t, "550e8400-e29b-41d4-a716-446655440000")
	senderID := mustParseUUID(t, "660e8400-e29b-41d4-a716-446655440000")
	messageID := mustParseUUID(t, "770e8400-e29b-41d4-a716-446655440000")
	content := "Test message"

	// Setup happy path transaction
	mockTxHelpers.setupHappyPathTransaction(conversationID, senderID, messageID, content)

	// Create service and inject mocks
	service := &ChatService{
		idempotencyCheck: mockIdempotency,
		logger:           logger,
	}
	mockTxHelpers.injectIntoService(service)

	// Mock idempotency check
	ctx := contextWithUserID(uuidToString(senderID))
	mockIdempotency.On("Check", ctx, "test-key").Return(nil)

	req := &chatv1pb.SendMessageRequest{
		ConversationId: uuidToString(conversationID),
		Content:        content,
		IdempotencyKey: "test-key",
	}

	// Execute
	resp, err := service.SendMessage(ctx, req)

	// Verify
	assert.NoError(t, err)
	assert.NotNil(t, resp)
	assert.NotEmpty(t, resp.MessageId)
	assert.Equal(t, "SENT", resp.Status)
	mockIdempotency.AssertExpectations(t)
}

// TestMockTransactionHelpers_BeginTxError verifies transaction begin error handling
func TestMockTransactionHelpers_BeginTxError(t *testing.T) {
	logger := zap.NewNop()
	mockIdempotency := new(MockIdempotencyChecker)
	mockTxHelpers := newMockTransactionHelpers()

	// Setup transaction begin error
	mockTxHelpers.setupBeginTxError(errors.New("failed to begin transaction"))

	// Create service and inject mocks
	service := &ChatService{
		idempotencyCheck: mockIdempotency,
		logger:           logger,
	}
	mockTxHelpers.injectIntoService(service)

	// Mock idempotency check
	ctx := contextWithUserID("660e8400-e29b-41d4-a716-446655440000")
	mockIdempotency.On("Check", ctx, "test-key").Return(nil)

	req := &chatv1pb.SendMessageRequest{
		ConversationId: "550e8400-e29b-41d4-a716-446655440000",
		Content:        "Test message",
		IdempotencyKey: "test-key",
	}

	// Execute
	resp, err := service.SendMessage(ctx, req)

	// Verify
	assert.Nil(t, resp)
	assert.Error(t, err)
	assert.Equal(t, codes.Internal, status.Code(err))
	mockIdempotency.AssertExpectations(t)
}

// TestMockTransactionHelpers_UpsertConversationError verifies upsert conversation error handling
func TestMockTransactionHelpers_UpsertConversationError(t *testing.T) {
	logger := zap.NewNop()
	mockIdempotency := new(MockIdempotencyChecker)
	mockTxHelpers := newMockTransactionHelpers()

	// Setup upsertConversation error
	mockTxHelpers.setupUpsertConversationError(errors.New("failed to upsert conversation"))

	// Create service and inject mocks
	service := &ChatService{
		idempotencyCheck: mockIdempotency,
		logger:           logger,
	}
	mockTxHelpers.injectIntoService(service)

	// Mock idempotency check
	ctx := contextWithUserID("660e8400-e29b-41d4-a716-446655440000")
	mockIdempotency.On("Check", ctx, "test-key").Return(nil)

	req := &chatv1pb.SendMessageRequest{
		ConversationId: "550e8400-e29b-41d4-a716-446655440000",
		Content:        "Test message",
		IdempotencyKey: "test-key",
	}

	// Execute
	resp, err := service.SendMessage(ctx, req)

	// Verify
	assert.Nil(t, resp)
	assert.Error(t, err)
	assert.Equal(t, codes.Internal, status.Code(err))
	mockIdempotency.AssertExpectations(t)
}

// TestMockTransactionHelpers_InsertMessageError verifies insert message error handling
func TestMockTransactionHelpers_InsertMessageError(t *testing.T) {
	logger := zap.NewNop()
	mockIdempotency := new(MockIdempotencyChecker)
	mockTxHelpers := newMockTransactionHelpers()

	conversationID := mustParseUUID(t, "550e8400-e29b-41d4-a716-446655440000")

	// Setup insertMessage error
	mockTxHelpers.setupInsertMessageError(conversationID, errors.New("failed to insert message"))

	// Create service and inject mocks
	service := &ChatService{
		idempotencyCheck: mockIdempotency,
		logger:           logger,
	}
	mockTxHelpers.injectIntoService(service)

	// Mock idempotency check
	ctx := contextWithUserID("660e8400-e29b-41d4-a716-446655440000")
	mockIdempotency.On("Check", ctx, "test-key").Return(nil)

	req := &chatv1pb.SendMessageRequest{
		ConversationId: "550e8400-e29b-41d4-a716-446655440000",
		Content:        "Test message",
		IdempotencyKey: "test-key",
	}

	// Execute
	resp, err := service.SendMessage(ctx, req)

	// Verify
	assert.Nil(t, resp)
	assert.Error(t, err)
	assert.Equal(t, codes.Internal, status.Code(err))
	mockIdempotency.AssertExpectations(t)
}

// TestMockTransactionHelpers_CommitError verifies commit error handling
func TestMockTransactionHelpers_CommitError(t *testing.T) {
	logger := zap.NewNop()
	mockIdempotency := new(MockIdempotencyChecker)
	mockTxHelpers := newMockTransactionHelpers()

	conversationID := mustParseUUID(t, "550e8400-e29b-41d4-a716-446655440000")
	senderID := mustParseUUID(t, "660e8400-e29b-41d4-a716-446655440000")
	messageID := mustParseUUID(t, "770e8400-e29b-41d4-a716-446655440000")
	content := "Test message"

	// Setup commit error
	mockTxHelpers.setupCommitTxError(conversationID, senderID, messageID, content, errors.New("failed to commit"))

	// Create service and inject mocks
	service := &ChatService{
		idempotencyCheck: mockIdempotency,
		logger:           logger,
	}
	mockTxHelpers.injectIntoService(service)

	// Mock idempotency check
	ctx := contextWithUserID(uuidToString(senderID))
	mockIdempotency.On("Check", ctx, "test-key").Return(nil)

	req := &chatv1pb.SendMessageRequest{
		ConversationId: uuidToString(conversationID),
		Content:        content,
		IdempotencyKey: "test-key",
	}

	// Execute
	resp, err := service.SendMessage(ctx, req)

	// Verify
	assert.Nil(t, resp)
	assert.Error(t, err)
	assert.Equal(t, codes.Internal, status.Code(err))
	mockIdempotency.AssertExpectations(t)
}

// TestSendMessage_TransactionBeginFailure tests transaction begin failure
func TestSendMessage_TransactionBeginFailure(t *testing.T) {
	logger := zap.NewNop()
	mockIdempotency := new(MockIdempotencyChecker)
	mockTxHelpers := newMockTransactionHelpers()

	// Setup transaction begin error
	dbError := errors.New("database connection failed")
	mockTxHelpers.setupBeginTxError(dbError)

	service := &ChatService{
		idempotencyCheck: mockIdempotency,
		logger:           logger,
	}
	mockTxHelpers.injectIntoService(service)

	// Create context with user_id
	ctx := contextWithUserID("660e8400-e29b-41d4-a716-446655440000")
	req := &chatv1pb.SendMessageRequest{
		ConversationId: "550e8400-e29b-41d4-a716-446655440000",
		Content:        "Hello World",
		IdempotencyKey: "key-123",
	}

	// Mock idempotency check to succeed
	mockIdempotency.On("Check", ctx, "key-123").Return(nil)

	resp, err := service.SendMessage(ctx, req)

	assert.Nil(t, resp)
	assert.Error(t, err)
	assert.Equal(t, codes.Internal, status.Code(err))
	assert.Contains(t, err.Error(), "failed to send message")
	mockIdempotency.AssertExpectations(t)
}

// TestSendMessage_UpsertConversationFailure tests upsertConversation failure with rollback
func TestSendMessage_UpsertConversationFailure(t *testing.T) {
	logger := zap.NewNop()
	mockIdempotency := new(MockIdempotencyChecker)
	mockTxHelpers := newMockTransactionHelpers()

	// Setup upsertConversation error
	dbError := errors.New("failed to upsert conversation")
	mockTxHelpers.setupUpsertConversationError(dbError)

	service := &ChatService{
		idempotencyCheck: mockIdempotency,
		logger:           logger,
	}
	mockTxHelpers.injectIntoService(service)

	// Create context with user_id
	ctx := contextWithUserID("660e8400-e29b-41d4-a716-446655440000")
	req := &chatv1pb.SendMessageRequest{
		ConversationId: "550e8400-e29b-41d4-a716-446655440000",
		Content:        "Hello World",
		IdempotencyKey: "key-123",
	}

	// Mock idempotency check to succeed
	mockIdempotency.On("Check", ctx, "key-123").Return(nil)

	resp, err := service.SendMessage(ctx, req)

	assert.Nil(t, resp)
	assert.Error(t, err)
	assert.Equal(t, codes.Internal, status.Code(err))
	assert.Contains(t, err.Error(), "failed to send message")
	mockIdempotency.AssertExpectations(t)
}

// TestSendMessage_InsertMessageFailure tests insertMessage failure with rollback
func TestSendMessage_InsertMessageFailure(t *testing.T) {
	logger := zap.NewNop()
	mockIdempotency := new(MockIdempotencyChecker)
	mockTxHelpers := newMockTransactionHelpers()

	conversationID := mustParseUUID(t, "550e8400-e29b-41d4-a716-446655440000")

	// Setup insertMessage error
	dbError := errors.New("failed to insert message")
	mockTxHelpers.setupInsertMessageError(conversationID, dbError)

	service := &ChatService{
		idempotencyCheck: mockIdempotency,
		logger:           logger,
	}
	mockTxHelpers.injectIntoService(service)

	// Create context with user_id
	ctx := contextWithUserID("660e8400-e29b-41d4-a716-446655440000")
	req := &chatv1pb.SendMessageRequest{
		ConversationId: "550e8400-e29b-41d4-a716-446655440000",
		Content:        "Hello World",
		IdempotencyKey: "key-123",
	}

	// Mock idempotency check to succeed
	mockIdempotency.On("Check", ctx, "key-123").Return(nil)

	resp, err := service.SendMessage(ctx, req)

	assert.Nil(t, resp)
	assert.Error(t, err)
	assert.Equal(t, codes.Internal, status.Code(err))
	assert.Contains(t, err.Error(), "failed to send message")
	mockIdempotency.AssertExpectations(t)
}

// TestSendMessage_InsertOutboxFailure tests insertOutbox failure with rollback
func TestSendMessage_InsertOutboxFailure(t *testing.T) {
	logger := zap.NewNop()
	mockIdempotency := new(MockIdempotencyChecker)
	mockTxHelpers := newMockTransactionHelpers()

	conversationID := mustParseUUID(t, "550e8400-e29b-41d4-a716-446655440000")
	senderID := mustParseUUID(t, "660e8400-e29b-41d4-a716-446655440000")
	messageID := mustParseUUID(t, "770e8400-e29b-41d4-a716-446655440000")

	// Setup insertOutbox error
	dbError := errors.New("failed to insert outbox event")
	mockTxHelpers.setupInsertOutboxError(conversationID, senderID, messageID, "Hello World", dbError)

	service := &ChatService{
		idempotencyCheck: mockIdempotency,
		logger:           logger,
	}
	mockTxHelpers.injectIntoService(service)

	// Create context with user_id
	ctx := contextWithUserID("660e8400-e29b-41d4-a716-446655440000")
	req := &chatv1pb.SendMessageRequest{
		ConversationId: "550e8400-e29b-41d4-a716-446655440000",
		Content:        "Hello World",
		IdempotencyKey: "key-123",
	}

	// Mock idempotency check to succeed
	mockIdempotency.On("Check", ctx, "key-123").Return(nil)

	resp, err := service.SendMessage(ctx, req)

	assert.Nil(t, resp)
	assert.Error(t, err)
	assert.Equal(t, codes.Internal, status.Code(err))
	assert.Contains(t, err.Error(), "failed to send message")
	mockIdempotency.AssertExpectations(t)
}

// TestSendMessage_CommitFailure tests transaction commit failure
func TestSendMessage_CommitFailure(t *testing.T) {
	logger := zap.NewNop()
	mockIdempotency := new(MockIdempotencyChecker)
	mockTxHelpers := newMockTransactionHelpers()

	conversationID := mustParseUUID(t, "550e8400-e29b-41d4-a716-446655440000")
	senderID := mustParseUUID(t, "660e8400-e29b-41d4-a716-446655440000")
	messageID := mustParseUUID(t, "770e8400-e29b-41d4-a716-446655440000")

	// Setup commit error
	commitError := errors.New("failed to commit transaction")
	mockTxHelpers.setupCommitTxError(conversationID, senderID, messageID, "Hello World", commitError)

	service := &ChatService{
		idempotencyCheck: mockIdempotency,
		logger:           logger,
	}
	mockTxHelpers.injectIntoService(service)

	// Create context with user_id
	ctx := contextWithUserID("660e8400-e29b-41d4-a716-446655440000")
	req := &chatv1pb.SendMessageRequest{
		ConversationId: "550e8400-e29b-41d4-a716-446655440000",
		Content:        "Hello World",
		IdempotencyKey: "key-123",
	}

	// Mock idempotency check to succeed
	mockIdempotency.On("Check", ctx, "key-123").Return(nil)

	resp, err := service.SendMessage(ctx, req)

	assert.Nil(t, resp)
	assert.Error(t, err)
	assert.Equal(t, codes.Internal, status.Code(err))
	assert.Contains(t, err.Error(), "failed to send message")
	mockIdempotency.AssertExpectations(t)
}

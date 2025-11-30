package service

import (
	"context"
	"testing"
	"time"

	ctxkeys "chat-service/internal/context"
	"chat-service/internal/repository"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
)

// ============================================================================
// MOCK IMPLEMENTATIONS
// ============================================================================
// This section contains mock implementations of external dependencies used
// in testing the ChatService. These mocks allow us to test service logic
// in isolation without requiring actual Redis or PostgreSQL connections.

// MockIdempotencyChecker is a mock implementation of idempotency.Checker
// 
// Usage Example:
//   mockIdempotency := new(MockIdempotencyChecker)
//   mockIdempotency.On("Check", ctx, "key-123").Return(nil)  // Success case
//   mockIdempotency.On("Check", ctx, "dup-key").Return(idempotency.ErrDuplicateRequest)  // Duplicate
//   
//   service := &ChatService{
//       idempotencyCheck: mockIdempotency,
//       logger: zap.NewNop(),
//   }
//   
//   // After test execution
//   mockIdempotency.AssertExpectations(t)
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

// ============================================================================
// TEST HELPER FUNCTIONS
// ============================================================================
// These helper functions simplify common test setup operations and reduce
// boilerplate code in test cases.

// contextWithUserID creates a context with user_id for testing authenticated requests
// 
// This helper is essential for testing endpoints that require authentication.
// It uses the same context key (ctxkeys.UserIDKey) as the actual service code.
//
// Usage Example:
//   ctx := contextWithUserID("660e8400-e29b-41d4-a716-446655440000")
//   resp, err := service.SendMessage(ctx, req)
//
// For testing unauthenticated scenarios, use context.Background() instead.
func contextWithUserID(userID string) context.Context {
	return context.WithValue(context.Background(), ctxkeys.UserIDKey, userID)
}

// mustParseUUID is a test helper that parses a UUID string and fails the test on error
//
// This helper simplifies UUID creation in tests by handling the error case automatically.
// If parsing fails, the test will fail immediately with a clear error message.
//
// Usage Example:
//   conversationID := mustParseUUID(t, "550e8400-e29b-41d4-a716-446655440000")
//   message := repository.Message{
//       ConversationID: conversationID,
//       Content: "Test message",
//   }
func mustParseUUID(t *testing.T, value string) pgtype.UUID {
	t.Helper()
	uuid, err := parseUUID(value)
	assert.NoError(t, err)
	return uuid
}

// mustTimestamptz is a test helper that creates a pgtype.Timestamptz from a time.Time
//
// This helper simplifies timestamp creation in tests by handling the Scan operation
// and error checking automatically.
//
// Usage Example:
//   ts := time.Date(2025, 1, 1, 12, 0, 0, 0, time.UTC)
//   message.CreatedAt = mustTimestamptz(t, ts)
func mustTimestamptz(t *testing.T, value time.Time) pgtype.Timestamptz {
	t.Helper()
	var ts pgtype.Timestamptz
	err := ts.Scan(value)
	assert.NoError(t, err)
	return ts
}

// ============================================================================
// DATABASE TRANSACTION MOCKS
// ============================================================================
// These mocks enable testing of database transaction logic without requiring
// an actual PostgreSQL connection. They implement the repository.DBTX interface.

// mockDBTX is a simple mock for testing transaction operations
//
// This mock implements the repository.DBTX interface, allowing us to simulate
// database operations and verify that transactions are handled correctly.
//
// Usage Example:
//   mockTx := new(mockDBTX)
//   mockTx.On("Commit", mock.Anything).Return(nil)
//   mockTx.On("Rollback", mock.Anything).Return(nil)
type mockDBTX struct {
	mock.Mock
}

func (m *mockDBTX) Exec(ctx context.Context, sql string, args ...interface{}) (pgconn.CommandTag, error) {
	callArgs := m.Called(ctx, sql, args)
	return callArgs.Get(0).(pgconn.CommandTag), callArgs.Error(1)
}

func (m *mockDBTX) Query(ctx context.Context, sql string, args ...interface{}) (pgx.Rows, error) {
	callArgs := m.Called(ctx, sql, args)
	if callArgs.Get(0) == nil {
		return nil, callArgs.Error(1)
	}
	return callArgs.Get(0).(pgx.Rows), callArgs.Error(1)
}

func (m *mockDBTX) QueryRow(ctx context.Context, sql string, args ...interface{}) pgx.Row {
	callArgs := m.Called(ctx, sql, args)
	if callArgs.Get(0) == nil {
		return nil
	}
	return callArgs.Get(0).(pgx.Row)
}

func (m *mockDBTX) Commit(ctx context.Context) error {
	args := m.Called(ctx)
	return args.Error(0)
}

func (m *mockDBTX) Rollback(ctx context.Context) error {
	args := m.Called(ctx)
	return args.Error(0)
}

// ============================================================================
// TRANSACTION HELPER PATTERN
// ============================================================================
// The mockTransactionHelpers struct provides a convenient way to set up
// complex transaction scenarios for testing. It encapsulates all the injectable
// functions needed to mock a complete database transaction flow.
//
// This pattern is particularly useful for testing SendMessage, which involves
// multiple database operations within a single transaction.

// mockTransactionHelpers provides mock implementations for all transaction-related operations
//
// This helper struct simplifies the setup of transaction mocks by providing
// pre-configured scenarios (happy path, various error cases) that can be
// easily injected into the ChatService.
//
// Usage Example - Happy Path:
//   mocks := newMockTransactionHelpers()
//   mocks.setupHappyPathTransaction(conversationID, senderID, messageID, "Hello")
//   
//   service := &ChatService{
//       idempotencyCheck: mockIdempotency,
//       logger: zap.NewNop(),
//   }
//   mocks.injectIntoService(service)
//   
//   resp, err := service.SendMessage(ctx, req)
//   assert.NoError(t, err)
//
// Usage Example - Error Case:
//   mocks := newMockTransactionHelpers()
//   mocks.setupBeginTxError(errors.New("connection failed"))
//   mocks.injectIntoService(service)
//   
//   resp, err := service.SendMessage(ctx, req)
//   assert.Error(t, err)
type mockTransactionHelpers struct {
	mockTx                           *mockDBTX
	mockBeginTx                      func(ctx context.Context) (repository.DBTX, error)
	mockUpsertConversation           func(ctx context.Context, qtx *repository.Queries, id pgtype.UUID) (repository.Conversation, error)
	mockAddParticipant               func(ctx context.Context, qtx *repository.Queries, params repository.AddParticipantParams) error
	mockAddConversationParticipants  func(ctx context.Context, qtx *repository.Queries, params repository.AddConversationParticipantsParams) error
	mockInsertMessage                func(ctx context.Context, qtx *repository.Queries, params repository.InsertMessageParams) (repository.Message, error)
	mockUpdateLastMessage            func(ctx context.Context, qtx *repository.Queries, params repository.UpdateConversationLastMessageParams) error
	mockGetConversationParticipants  func(ctx context.Context, qtx *repository.Queries, conversationID pgtype.UUID) ([]pgtype.UUID, error)
	mockInsertOutbox                 func(ctx context.Context, qtx *repository.Queries, params repository.InsertOutboxParams) error
	mockCommitTx                     func(ctx context.Context, tx repository.DBTX) error
	mockRollbackTx                   func(ctx context.Context, tx repository.DBTX) error
}

// newMockTransactionHelpers creates a new set of mock transaction helpers
//
// This constructor initializes a mockTransactionHelpers with a fresh mockDBTX.
// After creation, call one of the setup methods (setupHappyPathTransaction,
// setupBeginTxError, etc.) to configure the desired test scenario.
func newMockTransactionHelpers() *mockTransactionHelpers {
	return &mockTransactionHelpers{
		mockTx: new(mockDBTX),
	}
}

// setupHappyPathTransaction configures all mocks for a successful transaction flow
//
// This method sets up all injectable functions to simulate a successful
// SendMessage operation where all database operations succeed and the
// transaction commits successfully.
//
// Parameters:
//   - conversationID: The UUID of the conversation
//   - senderID: The UUID of the message sender
//   - messageID: The UUID to assign to the new message
//   - content: The message content
//
// After calling this method, use injectIntoService() to apply the mocks.
func (m *mockTransactionHelpers) setupHappyPathTransaction(
	conversationID, senderID, messageID pgtype.UUID,
	content string,
) {
	m.mockBeginTx = func(ctx context.Context) (repository.DBTX, error) {
		return m.mockTx, nil
	}

	m.mockUpsertConversation = func(ctx context.Context, qtx *repository.Queries, id pgtype.UUID) (repository.Conversation, error) {
		return repository.Conversation{ID: conversationID}, nil
	}

	// Use bulk insert for participants (sender + receivers)
	m.mockAddConversationParticipants = func(ctx context.Context, qtx *repository.Queries, params repository.AddConversationParticipantsParams) error {
		return nil
	}

	m.mockInsertMessage = func(ctx context.Context, qtx *repository.Queries, params repository.InsertMessageParams) (repository.Message, error) {
		msg := repository.Message{
			ID:             messageID,
			ConversationID: conversationID,
			SenderID:       senderID,
			Content:        content,
		}
		msg.CreatedAt.Scan(time.Now())
		return msg, nil
	}

	m.mockUpdateLastMessage = func(ctx context.Context, qtx *repository.Queries, params repository.UpdateConversationLastMessageParams) error {
		return nil
	}

	// Return sender as participant (will be filtered out) plus a receiver
	receiverID, _ := parseUUID("880e8400-e29b-41d4-a716-446655440000")
	m.mockGetConversationParticipants = func(ctx context.Context, qtx *repository.Queries, convID pgtype.UUID) ([]pgtype.UUID, error) {
		return []pgtype.UUID{senderID, receiverID}, nil
	}

	m.mockInsertOutbox = func(ctx context.Context, qtx *repository.Queries, params repository.InsertOutboxParams) error {
		return nil
	}

	m.mockCommitTx = func(ctx context.Context, tx repository.DBTX) error {
		return nil
	}

	m.mockRollbackTx = func(ctx context.Context, tx repository.DBTX) error {
		return nil
	}
}

// setupBeginTxError configures mocks for transaction begin failure
//
// Use this method to test scenarios where the database connection fails
// or the transaction cannot be started.
//
// Example:
//   mocks.setupBeginTxError(errors.New("connection pool exhausted"))
func (m *mockTransactionHelpers) setupBeginTxError(err error) {
	m.mockBeginTx = func(ctx context.Context) (repository.DBTX, error) {
		return nil, err
	}
}

// setupUpsertConversationError configures mocks for upsertConversation failure
//
// Use this method to test scenarios where the conversation upsert operation fails.
// The transaction should be rolled back in this case.
//
// Example:
//   mocks.setupUpsertConversationError(errors.New("unique constraint violation"))
func (m *mockTransactionHelpers) setupUpsertConversationError(err error) {
	m.mockBeginTx = func(ctx context.Context) (repository.DBTX, error) {
		return m.mockTx, nil
	}

	m.mockUpsertConversation = func(ctx context.Context, qtx *repository.Queries, id pgtype.UUID) (repository.Conversation, error) {
		return repository.Conversation{}, err
	}

	m.mockRollbackTx = func(ctx context.Context, tx repository.DBTX) error {
		return nil
	}
}

// setupAddParticipantError configures mocks for addParticipant failure (legacy, kept for compatibility)
func (m *mockTransactionHelpers) setupAddParticipantError(conversationID pgtype.UUID, err error) {
	m.mockBeginTx = func(ctx context.Context) (repository.DBTX, error) {
		return m.mockTx, nil
	}

	m.mockUpsertConversation = func(ctx context.Context, qtx *repository.Queries, id pgtype.UUID) (repository.Conversation, error) {
		return repository.Conversation{ID: conversationID}, nil
	}

	m.mockAddParticipant = func(ctx context.Context, qtx *repository.Queries, params repository.AddParticipantParams) error {
		return err
	}

	m.mockRollbackTx = func(ctx context.Context, tx repository.DBTX) error {
		return nil
	}
}

// setupAddConversationParticipantsError configures mocks for bulk addConversationParticipants failure
func (m *mockTransactionHelpers) setupAddConversationParticipantsError(conversationID pgtype.UUID, err error) {
	m.mockBeginTx = func(ctx context.Context) (repository.DBTX, error) {
		return m.mockTx, nil
	}

	m.mockUpsertConversation = func(ctx context.Context, qtx *repository.Queries, id pgtype.UUID) (repository.Conversation, error) {
		return repository.Conversation{ID: conversationID}, nil
	}

	m.mockAddConversationParticipants = func(ctx context.Context, qtx *repository.Queries, params repository.AddConversationParticipantsParams) error {
		return err
	}

	m.mockRollbackTx = func(ctx context.Context, tx repository.DBTX) error {
		return nil
	}
}

// setupInsertMessageError configures mocks for insertMessage failure
func (m *mockTransactionHelpers) setupInsertMessageError(conversationID pgtype.UUID, err error) {
	senderID, _ := parseUUID("660e8400-e29b-41d4-a716-446655440000")
	receiverID, _ := parseUUID("880e8400-e29b-41d4-a716-446655440000")

	m.mockBeginTx = func(ctx context.Context) (repository.DBTX, error) {
		return m.mockTx, nil
	}

	m.mockUpsertConversation = func(ctx context.Context, qtx *repository.Queries, id pgtype.UUID) (repository.Conversation, error) {
		return repository.Conversation{ID: conversationID}, nil
	}

	// Use bulk insert for participants
	m.mockAddConversationParticipants = func(ctx context.Context, qtx *repository.Queries, params repository.AddConversationParticipantsParams) error {
		return nil
	}

	m.mockInsertMessage = func(ctx context.Context, qtx *repository.Queries, params repository.InsertMessageParams) (repository.Message, error) {
		return repository.Message{}, err
	}

	m.mockGetConversationParticipants = func(ctx context.Context, qtx *repository.Queries, convID pgtype.UUID) ([]pgtype.UUID, error) {
		return []pgtype.UUID{senderID, receiverID}, nil
	}

	m.mockRollbackTx = func(ctx context.Context, tx repository.DBTX) error {
		return nil
	}
}

// setupInsertOutboxError configures mocks for insertOutbox failure
func (m *mockTransactionHelpers) setupInsertOutboxError(conversationID, senderID, messageID pgtype.UUID, content string, err error) {
	receiverID, _ := parseUUID("880e8400-e29b-41d4-a716-446655440000")

	m.mockBeginTx = func(ctx context.Context) (repository.DBTX, error) {
		return m.mockTx, nil
	}

	m.mockUpsertConversation = func(ctx context.Context, qtx *repository.Queries, id pgtype.UUID) (repository.Conversation, error) {
		return repository.Conversation{ID: conversationID}, nil
	}

	// Use bulk insert for participants
	m.mockAddConversationParticipants = func(ctx context.Context, qtx *repository.Queries, params repository.AddConversationParticipantsParams) error {
		return nil
	}

	m.mockInsertMessage = func(ctx context.Context, qtx *repository.Queries, params repository.InsertMessageParams) (repository.Message, error) {
		msg := repository.Message{
			ID:             messageID,
			ConversationID: conversationID,
			SenderID:       senderID,
			Content:        content,
		}
		msg.CreatedAt.Scan(time.Now())
		return msg, nil
	}

	m.mockUpdateLastMessage = func(ctx context.Context, qtx *repository.Queries, params repository.UpdateConversationLastMessageParams) error {
		return nil
	}

	m.mockGetConversationParticipants = func(ctx context.Context, qtx *repository.Queries, convID pgtype.UUID) ([]pgtype.UUID, error) {
		return []pgtype.UUID{senderID, receiverID}, nil
	}

	m.mockInsertOutbox = func(ctx context.Context, qtx *repository.Queries, params repository.InsertOutboxParams) error {
		return err
	}

	m.mockRollbackTx = func(ctx context.Context, tx repository.DBTX) error {
		return nil
	}
}

// setupCommitTxError configures mocks for commit failure
func (m *mockTransactionHelpers) setupCommitTxError(conversationID, senderID, messageID pgtype.UUID, content string, err error) {
	receiverID, _ := parseUUID("880e8400-e29b-41d4-a716-446655440000")

	m.mockBeginTx = func(ctx context.Context) (repository.DBTX, error) {
		return m.mockTx, nil
	}

	m.mockUpsertConversation = func(ctx context.Context, qtx *repository.Queries, id pgtype.UUID) (repository.Conversation, error) {
		return repository.Conversation{ID: conversationID}, nil
	}

	// Use bulk insert for participants
	m.mockAddConversationParticipants = func(ctx context.Context, qtx *repository.Queries, params repository.AddConversationParticipantsParams) error {
		return nil
	}

	m.mockInsertMessage = func(ctx context.Context, qtx *repository.Queries, params repository.InsertMessageParams) (repository.Message, error) {
		msg := repository.Message{
			ID:             messageID,
			ConversationID: conversationID,
			SenderID:       senderID,
			Content:        content,
		}
		msg.CreatedAt.Scan(time.Now())
		return msg, nil
	}

	m.mockUpdateLastMessage = func(ctx context.Context, qtx *repository.Queries, params repository.UpdateConversationLastMessageParams) error {
		return nil
	}

	m.mockGetConversationParticipants = func(ctx context.Context, qtx *repository.Queries, convID pgtype.UUID) ([]pgtype.UUID, error) {
		return []pgtype.UUID{senderID, receiverID}, nil
	}

	m.mockInsertOutbox = func(ctx context.Context, qtx *repository.Queries, params repository.InsertOutboxParams) error {
		return nil
	}

	m.mockCommitTx = func(ctx context.Context, tx repository.DBTX) error {
		return err
	}

	m.mockRollbackTx = func(ctx context.Context, tx repository.DBTX) error {
		return nil
	}
}

// injectIntoService injects all mock functions into the ChatService
//
// This method applies all configured mock functions to the ChatService instance.
// Call this after setting up your desired test scenario with one of the setup methods.
//
// The ChatService uses function injection to allow testing without actual database
// connections. Each injectable function (beginTxFn, upsertConversationFn, etc.)
// is checked for nil before injection, so only the functions you've configured
// will be overridden.
//
// Example:
//   service := &ChatService{
//       idempotencyCheck: mockIdempotency,
//       logger: zap.NewNop(),
//   }
//   mocks.injectIntoService(service)
func (m *mockTransactionHelpers) injectIntoService(service *ChatService) {
	if m.mockBeginTx != nil {
		service.beginTxFn = m.mockBeginTx
	}
	if m.mockUpsertConversation != nil {
		service.upsertConversationFn = m.mockUpsertConversation
	}
	if m.mockAddParticipant != nil {
		service.addParticipantFn = m.mockAddParticipant
	}
	if m.mockAddConversationParticipants != nil {
		service.addConversationParticipantsFn = m.mockAddConversationParticipants
	}
	if m.mockInsertMessage != nil {
		service.insertMessageFn = m.mockInsertMessage
	}
	if m.mockUpdateLastMessage != nil {
		service.updateLastMessageFn = m.mockUpdateLastMessage
	}
	if m.mockGetConversationParticipants != nil {
		service.getConversationParticipantsFn = m.mockGetConversationParticipants
	}
	if m.mockInsertOutbox != nil {
		service.insertOutboxFn = m.mockInsertOutbox
	}
	if m.mockCommitTx != nil {
		service.commitTxFn = m.mockCommitTx
	}
	if m.mockRollbackTx != nil {
		service.rollbackTxFn = m.mockRollbackTx
	}
}

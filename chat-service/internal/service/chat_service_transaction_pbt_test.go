package service

import (
	"context"
	"errors"
	"testing"
	"time"

	chatv1 "chat-service/api/chat/v1"
	"chat-service/internal/repository"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/leanovate/gopter"
	"github.com/leanovate/gopter/gen"
	"github.com/leanovate/gopter/prop"
	"github.com/stretchr/testify/mock"
	"go.uber.org/zap"
)

// **Feature: auto-add-receivers, Property 6: Transaction atomicity on failure**
// *For any* failure during participant insertion, the entire transaction SHALL be
// rolled back, meaning no message is inserted and no participants are added.
// **Validates: Requirements 3.2**
func TestProperty_TransactionAtomicityOnFailure(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100

	properties := gopter.NewProperties(parameters)

	// Generator for valid UUID strings
	validUUIDGen := gen.Const(nil).Map(func(_ interface{}) string {
		return uuid.New().String()
	})

	// Generator for a slice of 1-5 valid receiver UUIDs
	receiverIDsGen := gen.SliceOfN(5, validUUIDGen).SuchThat(func(ids []string) bool {
		return len(ids) >= 1 && len(ids) <= 5
	}).Map(func(ids []string) []string {
		if len(ids) == 0 {
			return []string{uuid.New().String()}
		}
		return ids
	})

	// Property: When AddConversationParticipants fails, no message is inserted and rollback is called
	properties.Property("participant insertion failure triggers rollback with no message inserted", prop.ForAll(
		func(receiverIDs []string) bool {
			// Setup
			conversationID := uuid.New().String()
			senderID := uuid.New().String()
			content := "Test message"
			idempotencyKey := uuid.New().String()

			// Parse UUIDs for mock setup
			conversationUUID, _ := parseUUID(conversationID)

			// Track state to verify atomicity
			messageInserted := false
			rollbackCalled := false
			commitCalled := false

			// Create mock idempotency checker
			mockIdempotency := new(MockIdempotencyChecker)
			mockIdempotency.On("Check", mock.Anything, mock.Anything).Return(nil)

			// Create service
			service := &ChatService{
				idempotencyCheck: mockIdempotency,
				logger:           zap.NewNop(),
			}

			// Setup mocks that simulate failure during AddConversationParticipants
			mocks := newMockTransactionHelpers()
			mocks.mockBeginTx = func(ctx context.Context) (repository.DBTX, error) {
				return mocks.mockTx, nil
			}
			mocks.mockUpsertConversation = func(ctx context.Context, qtx *repository.Queries, id pgtype.UUID) (repository.Conversation, error) {
				return repository.Conversation{ID: conversationUUID}, nil
			}
			// Simulate failure during bulk participant insertion
			mocks.mockAddConversationParticipants = func(ctx context.Context, qtx *repository.Queries, params repository.AddConversationParticipantsParams) error {
				// Return error to simulate database failure
				return errors.New("simulated database failure during participant insertion")
			}
			// Track if message insertion is attempted (it should NOT be called)
			mocks.mockInsertMessage = func(ctx context.Context, qtx *repository.Queries, params repository.InsertMessageParams) (repository.Message, error) {
				messageInserted = true
				return repository.Message{}, nil
			}
			mocks.mockUpdateLastMessage = func(ctx context.Context, qtx *repository.Queries, params repository.UpdateConversationLastMessageParams) error {
				return nil
			}
			mocks.mockGetConversationParticipants = func(ctx context.Context, qtx *repository.Queries, convID pgtype.UUID) ([]pgtype.UUID, error) {
				return nil, nil
			}
			mocks.mockInsertOutbox = func(ctx context.Context, qtx *repository.Queries, params repository.InsertOutboxParams) error {
				return nil
			}
			mocks.mockCommitTx = func(ctx context.Context, tx repository.DBTX) error {
				commitCalled = true
				return nil
			}
			mocks.mockRollbackTx = func(ctx context.Context, tx repository.DBTX) error {
				rollbackCalled = true
				return nil
			}
			mocks.injectIntoService(service)

			// Create context with user ID
			ctx := contextWithUserID(senderID)

			// Create request with receiver_ids
			req := &chatv1.SendMessageRequest{
				ConversationId: conversationID,
				Content:        content,
				IdempotencyKey: idempotencyKey,
				ReceiverIds:    receiverIDs,
			}

			// Execute - should fail
			_, err := service.SendMessage(ctx, req)

			// Verify: SendMessage should return an error
			if err == nil {
				t.Logf("Expected SendMessage to fail, but it succeeded")
				return false
			}

			// Verify: Message should NOT have been inserted
			if messageInserted {
				t.Logf("Message was inserted despite participant insertion failure")
				return false
			}

			// Verify: Rollback should have been called (via defer)
			if !rollbackCalled {
				t.Logf("Rollback was not called after failure")
				return false
			}

			// Verify: Commit should NOT have been called
			if commitCalled {
				t.Logf("Commit was called despite failure")
				return false
			}

			return true
		},
		receiverIDsGen,
	))

	// Property: When InsertMessage fails after participants added, rollback is called
	properties.Property("message insertion failure after participants triggers rollback", prop.ForAll(
		func(receiverIDs []string) bool {
			// Setup
			conversationID := uuid.New().String()
			senderID := uuid.New().String()
			content := "Test message"
			idempotencyKey := uuid.New().String()

			// Parse UUIDs for mock setup
			conversationUUID, _ := parseUUID(conversationID)
			senderUUID, _ := parseUUID(senderID)

			// Track state to verify atomicity
			participantsAddedCount := 0
			rollbackCalled := false
			commitCalled := false
			outboxInserted := false

			// Create mock idempotency checker
			mockIdempotency := new(MockIdempotencyChecker)
			mockIdempotency.On("Check", mock.Anything, mock.Anything).Return(nil)

			// Create service
			service := &ChatService{
				idempotencyCheck: mockIdempotency,
				logger:           zap.NewNop(),
			}

			// Setup mocks that simulate failure during InsertMessage
			mocks := newMockTransactionHelpers()
			mocks.mockBeginTx = func(ctx context.Context) (repository.DBTX, error) {
				return mocks.mockTx, nil
			}
			mocks.mockUpsertConversation = func(ctx context.Context, qtx *repository.Queries, id pgtype.UUID) (repository.Conversation, error) {
				return repository.Conversation{ID: conversationUUID}, nil
			}
			// Participants are added successfully
			mocks.mockAddConversationParticipants = func(ctx context.Context, qtx *repository.Queries, params repository.AddConversationParticipantsParams) error {
				participantsAddedCount = len(params.Column2)
				return nil
			}
			// Simulate failure during message insertion
			mocks.mockInsertMessage = func(ctx context.Context, qtx *repository.Queries, params repository.InsertMessageParams) (repository.Message, error) {
				return repository.Message{}, errors.New("simulated database failure during message insertion")
			}
			mocks.mockUpdateLastMessage = func(ctx context.Context, qtx *repository.Queries, params repository.UpdateConversationLastMessageParams) error {
				return nil
			}
			mocks.mockGetConversationParticipants = func(ctx context.Context, qtx *repository.Queries, convID pgtype.UUID) ([]pgtype.UUID, error) {
				return []pgtype.UUID{senderUUID}, nil
			}
			mocks.mockInsertOutbox = func(ctx context.Context, qtx *repository.Queries, params repository.InsertOutboxParams) error {
				outboxInserted = true
				return nil
			}
			mocks.mockCommitTx = func(ctx context.Context, tx repository.DBTX) error {
				commitCalled = true
				return nil
			}
			mocks.mockRollbackTx = func(ctx context.Context, tx repository.DBTX) error {
				rollbackCalled = true
				return nil
			}
			mocks.injectIntoService(service)

			// Create context with user ID
			ctx := contextWithUserID(senderID)

			// Create request with receiver_ids
			req := &chatv1.SendMessageRequest{
				ConversationId: conversationID,
				Content:        content,
				IdempotencyKey: idempotencyKey,
				ReceiverIds:    receiverIDs,
			}

			// Execute - should fail
			_, err := service.SendMessage(ctx, req)

			// Verify: SendMessage should return an error
			if err == nil {
				t.Logf("Expected SendMessage to fail, but it succeeded")
				return false
			}

			// Verify: Participants were attempted to be added (before failure)
			expectedParticipants := len(receiverIDs) + 1 // receivers + sender
			if participantsAddedCount != expectedParticipants {
				t.Logf("Expected %d participants to be added, got %d", expectedParticipants, participantsAddedCount)
				return false
			}

			// Verify: Rollback should have been called (via defer)
			if !rollbackCalled {
				t.Logf("Rollback was not called after failure")
				return false
			}

			// Verify: Commit should NOT have been called
			if commitCalled {
				t.Logf("Commit was called despite failure")
				return false
			}

			// Verify: Outbox should NOT have been inserted
			if outboxInserted {
				t.Logf("Outbox was inserted despite message insertion failure")
				return false
			}

			return true
		},
		receiverIDsGen,
	))

	// Property: When InsertOutbox fails, rollback is called and no commit happens
	properties.Property("outbox insertion failure triggers rollback", prop.ForAll(
		func(receiverIDs []string) bool {
			// Setup
			conversationID := uuid.New().String()
			senderID := uuid.New().String()
			messageID := uuid.New().String()
			content := "Test message"
			idempotencyKey := uuid.New().String()

			// Parse UUIDs for mock setup
			conversationUUID, _ := parseUUID(conversationID)
			senderUUID, _ := parseUUID(senderID)
			messageUUID, _ := parseUUID(messageID)

			// Track state to verify atomicity
			rollbackCalled := false
			commitCalled := false

			// Create mock idempotency checker
			mockIdempotency := new(MockIdempotencyChecker)
			mockIdempotency.On("Check", mock.Anything, mock.Anything).Return(nil)

			// Create service
			service := &ChatService{
				idempotencyCheck: mockIdempotency,
				logger:           zap.NewNop(),
			}

			// Setup mocks that simulate failure during InsertOutbox
			mocks := newMockTransactionHelpers()
			mocks.mockBeginTx = func(ctx context.Context) (repository.DBTX, error) {
				return mocks.mockTx, nil
			}
			mocks.mockUpsertConversation = func(ctx context.Context, qtx *repository.Queries, id pgtype.UUID) (repository.Conversation, error) {
				return repository.Conversation{ID: conversationUUID}, nil
			}
			mocks.mockAddConversationParticipants = func(ctx context.Context, qtx *repository.Queries, params repository.AddConversationParticipantsParams) error {
				return nil
			}
			mocks.mockInsertMessage = func(ctx context.Context, qtx *repository.Queries, params repository.InsertMessageParams) (repository.Message, error) {
				msg := repository.Message{
					ID:             messageUUID,
					ConversationID: conversationUUID,
					SenderID:       senderUUID,
					Content:        content,
				}
				msg.CreatedAt.Scan(time.Now())
				return msg, nil
			}
			mocks.mockUpdateLastMessage = func(ctx context.Context, qtx *repository.Queries, params repository.UpdateConversationLastMessageParams) error {
				return nil
			}
			mocks.mockGetConversationParticipants = func(ctx context.Context, qtx *repository.Queries, convID pgtype.UUID) ([]pgtype.UUID, error) {
				participants := make([]pgtype.UUID, 0, len(receiverIDs)+1)
				participants = append(participants, senderUUID)
				for _, rid := range receiverIDs {
					pUUID, _ := parseUUID(rid)
					participants = append(participants, pUUID)
				}
				return participants, nil
			}
			// Simulate failure during outbox insertion
			mocks.mockInsertOutbox = func(ctx context.Context, qtx *repository.Queries, params repository.InsertOutboxParams) error {
				return errors.New("simulated database failure during outbox insertion")
			}
			mocks.mockCommitTx = func(ctx context.Context, tx repository.DBTX) error {
				commitCalled = true
				return nil
			}
			mocks.mockRollbackTx = func(ctx context.Context, tx repository.DBTX) error {
				rollbackCalled = true
				return nil
			}
			mocks.injectIntoService(service)

			// Create context with user ID
			ctx := contextWithUserID(senderID)

			// Create request with receiver_ids
			req := &chatv1.SendMessageRequest{
				ConversationId: conversationID,
				Content:        content,
				IdempotencyKey: idempotencyKey,
				ReceiverIds:    receiverIDs,
			}

			// Execute - should fail
			_, err := service.SendMessage(ctx, req)

			// Verify: SendMessage should return an error
			if err == nil {
				t.Logf("Expected SendMessage to fail, but it succeeded")
				return false
			}

			// Verify: Rollback should have been called (via defer)
			if !rollbackCalled {
				t.Logf("Rollback was not called after failure")
				return false
			}

			// Verify: Commit should NOT have been called
			if commitCalled {
				t.Logf("Commit was called despite failure")
				return false
			}

			return true
		},
		receiverIDsGen,
	))

	properties.TestingRun(t)
}

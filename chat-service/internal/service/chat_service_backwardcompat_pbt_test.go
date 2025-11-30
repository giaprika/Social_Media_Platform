package service

import (
	"context"
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

// **Feature: auto-add-receivers, Property 2: Backward compatibility - empty receivers**
// *For any* message sent without `receiver_ids` (empty or nil), only the sender SHALL be
// added as a participant (existing behavior preserved).
// **Validates: Requirements 1.2, 2.4**
func TestProperty_BackwardCompatibility_EmptyReceivers(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100

	properties := gopter.NewProperties(parameters)

	// Property: Message sent with nil receiver_ids only adds sender as participant
	properties.Property("nil receiver_ids only adds sender", prop.ForAll(
		func(_ int) bool {
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

			// Track what participants were passed to AddConversationParticipants
			var capturedParticipants []pgtype.UUID

			// Create mock idempotency checker
			mockIdempotency := new(MockIdempotencyChecker)
			mockIdempotency.On("Check", mock.Anything, mock.Anything).Return(nil)

			// Create service
			service := &ChatService{
				idempotencyCheck: mockIdempotency,
				logger:           zap.NewNop(),
			}

			// Setup mocks
			mocks := newMockTransactionHelpers()
			mocks.mockBeginTx = func(ctx context.Context) (repository.DBTX, error) {
				return mocks.mockTx, nil
			}
			mocks.mockUpsertConversation = func(ctx context.Context, qtx *repository.Queries, id pgtype.UUID) (repository.Conversation, error) {
				return repository.Conversation{ID: conversationUUID}, nil
			}
			mocks.mockAddConversationParticipants = func(ctx context.Context, qtx *repository.Queries, params repository.AddConversationParticipantsParams) error {
				// Capture the participants passed to the function
				capturedParticipants = params.Column2
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
				return capturedParticipants, nil
			}
			mocks.mockInsertOutbox = func(ctx context.Context, qtx *repository.Queries, params repository.InsertOutboxParams) error {
				return nil
			}
			mocks.mockCommitTx = func(ctx context.Context, tx repository.DBTX) error {
				return nil
			}
			mocks.mockRollbackTx = func(ctx context.Context, tx repository.DBTX) error {
				return nil
			}
			mocks.injectIntoService(service)

			// Create context with user ID
			ctx := contextWithUserID(senderID)

			// Create request WITHOUT receiver_ids (nil)
			req := &chatv1.SendMessageRequest{
				ConversationId: conversationID,
				Content:        content,
				IdempotencyKey: idempotencyKey,
				ReceiverIds:    nil, // Explicitly nil
			}

			// Execute
			_, err := service.SendMessage(ctx, req)
			if err != nil {
				t.Logf("SendMessage failed: %v", err)
				return false
			}

			// Verify: Only sender should be in capturedParticipants
			if len(capturedParticipants) != 1 {
				t.Logf("Expected 1 participant (sender only), got %d", len(capturedParticipants))
				return false
			}

			// Verify the single participant is the sender
			if uuidToString(capturedParticipants[0]) != senderID {
				t.Logf("Expected sender %s, got %s", senderID, uuidToString(capturedParticipants[0]))
				return false
			}

			return true
		},
		gen.Int(), // Dummy generator to run the test multiple times
	))

	// Property: Message sent with empty receiver_ids array only adds sender as participant
	properties.Property("empty receiver_ids array only adds sender", prop.ForAll(
		func(_ int) bool {
			// Setup
			conversationID := uuid.New().String()
			senderID := uuid.New().String()
			messageID := uuid.New().String()
			content := "Test message with empty receivers"
			idempotencyKey := uuid.New().String()

			// Parse UUIDs for mock setup
			conversationUUID, _ := parseUUID(conversationID)
			senderUUID, _ := parseUUID(senderID)
			messageUUID, _ := parseUUID(messageID)

			// Track what participants were passed to AddConversationParticipants
			var capturedParticipants []pgtype.UUID

			// Create mock idempotency checker
			mockIdempotency := new(MockIdempotencyChecker)
			mockIdempotency.On("Check", mock.Anything, mock.Anything).Return(nil)

			// Create service
			service := &ChatService{
				idempotencyCheck: mockIdempotency,
				logger:           zap.NewNop(),
			}

			// Setup mocks
			mocks := newMockTransactionHelpers()
			mocks.mockBeginTx = func(ctx context.Context) (repository.DBTX, error) {
				return mocks.mockTx, nil
			}
			mocks.mockUpsertConversation = func(ctx context.Context, qtx *repository.Queries, id pgtype.UUID) (repository.Conversation, error) {
				return repository.Conversation{ID: conversationUUID}, nil
			}
			mocks.mockAddConversationParticipants = func(ctx context.Context, qtx *repository.Queries, params repository.AddConversationParticipantsParams) error {
				capturedParticipants = params.Column2
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
				return capturedParticipants, nil
			}
			mocks.mockInsertOutbox = func(ctx context.Context, qtx *repository.Queries, params repository.InsertOutboxParams) error {
				return nil
			}
			mocks.mockCommitTx = func(ctx context.Context, tx repository.DBTX) error {
				return nil
			}
			mocks.mockRollbackTx = func(ctx context.Context, tx repository.DBTX) error {
				return nil
			}
			mocks.injectIntoService(service)

			// Create context with user ID
			ctx := contextWithUserID(senderID)

			// Create request with EMPTY receiver_ids array
			req := &chatv1.SendMessageRequest{
				ConversationId: conversationID,
				Content:        content,
				IdempotencyKey: idempotencyKey,
				ReceiverIds:    []string{}, // Explicitly empty array
			}

			// Execute
			_, err := service.SendMessage(ctx, req)
			if err != nil {
				t.Logf("SendMessage failed: %v", err)
				return false
			}

			// Verify: Only sender should be in capturedParticipants
			if len(capturedParticipants) != 1 {
				t.Logf("Expected 1 participant (sender only), got %d", len(capturedParticipants))
				return false
			}

			// Verify the single participant is the sender
			if uuidToString(capturedParticipants[0]) != senderID {
				t.Logf("Expected sender %s, got %s", senderID, uuidToString(capturedParticipants[0]))
				return false
			}

			return true
		},
		gen.Int(), // Dummy generator to run the test multiple times
	))

	// Property: Random message content with no receivers only adds sender
	properties.Property("random content with no receivers only adds sender", prop.ForAll(
		func(content string) bool {
			// Skip empty content as it's invalid
			if content == "" {
				return true
			}

			// Setup
			conversationID := uuid.New().String()
			senderID := uuid.New().String()
			messageID := uuid.New().String()
			idempotencyKey := uuid.New().String()

			// Parse UUIDs for mock setup
			conversationUUID, _ := parseUUID(conversationID)
			senderUUID, _ := parseUUID(senderID)
			messageUUID, _ := parseUUID(messageID)

			// Track what participants were passed to AddConversationParticipants
			var capturedParticipants []pgtype.UUID

			// Create mock idempotency checker
			mockIdempotency := new(MockIdempotencyChecker)
			mockIdempotency.On("Check", mock.Anything, mock.Anything).Return(nil)

			// Create service
			service := &ChatService{
				idempotencyCheck: mockIdempotency,
				logger:           zap.NewNop(),
			}

			// Setup mocks
			mocks := newMockTransactionHelpers()
			mocks.mockBeginTx = func(ctx context.Context) (repository.DBTX, error) {
				return mocks.mockTx, nil
			}
			mocks.mockUpsertConversation = func(ctx context.Context, qtx *repository.Queries, id pgtype.UUID) (repository.Conversation, error) {
				return repository.Conversation{ID: conversationUUID}, nil
			}
			mocks.mockAddConversationParticipants = func(ctx context.Context, qtx *repository.Queries, params repository.AddConversationParticipantsParams) error {
				capturedParticipants = params.Column2
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
				return capturedParticipants, nil
			}
			mocks.mockInsertOutbox = func(ctx context.Context, qtx *repository.Queries, params repository.InsertOutboxParams) error {
				return nil
			}
			mocks.mockCommitTx = func(ctx context.Context, tx repository.DBTX) error {
				return nil
			}
			mocks.mockRollbackTx = func(ctx context.Context, tx repository.DBTX) error {
				return nil
			}
			mocks.injectIntoService(service)

			// Create context with user ID
			ctx := contextWithUserID(senderID)

			// Create request without receiver_ids
			req := &chatv1.SendMessageRequest{
				ConversationId: conversationID,
				Content:        content,
				IdempotencyKey: idempotencyKey,
				// ReceiverIds not set - defaults to nil
			}

			// Execute
			_, err := service.SendMessage(ctx, req)
			if err != nil {
				return false
			}

			// Verify: Only sender should be in capturedParticipants
			if len(capturedParticipants) != 1 {
				return false
			}

			// Verify the single participant is the sender
			return uuidToString(capturedParticipants[0]) == senderID
		},
		gen.AnyString().SuchThat(func(s string) bool { return s != "" }),
	))

	properties.TestingRun(t)
}

package service

import (
	"context"
	"fmt"
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

// **Feature: auto-add-receivers, Property 1: All receivers become participants**
// *For any* message sent with a non-empty `receiver_ids` array, after the transaction commits,
// all specified receivers SHALL exist in `conversation_participants` for that conversation.
// **Validates: Requirements 1.1, 3.1**
func TestProperty_AllReceiversBecomeParticipants(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100

	properties := gopter.NewProperties(parameters)

	// Generator for valid UUID strings
	validUUIDGen := gen.Const(nil).Map(func(_ interface{}) string {
		return uuid.New().String()
	})

	// Generator for a slice of 1-10 valid receiver UUIDs
	receiverIDsGen := gen.SliceOfN(10, validUUIDGen).SuchThat(func(ids []string) bool {
		return len(ids) >= 1 && len(ids) <= 10
	}).Map(func(ids []string) []string {
		// Ensure at least 1 receiver
		if len(ids) == 0 {
			return []string{uuid.New().String()}
		}
		return ids
	})

	// Property: All receivers in receiver_ids are passed to AddConversationParticipants
	properties.Property("all receivers become participants", prop.ForAll(
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
			// Return all participants (sender + receivers) for outbox payload
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

			// Create request with receiver_ids
			req := &chatv1.SendMessageRequest{
				ConversationId: conversationID,
				Content:        content,
				IdempotencyKey: idempotencyKey,
				ReceiverIds:    receiverIDs,
			}

			// Execute
			_, err := service.SendMessage(ctx, req)
			if err != nil {
				t.Logf("SendMessage failed: %v", err)
				return false
			}

			// Verify: All receivers should be in capturedParticipants
			// capturedParticipants should contain sender + all receivers
			expectedCount := 1 + len(receiverIDs) // sender + receivers
			if len(capturedParticipants) != expectedCount {
				t.Logf("Expected %d participants, got %d", expectedCount, len(capturedParticipants))
				return false
			}

			// Verify sender is in participants
			senderFound := false
			for _, p := range capturedParticipants {
				if uuidToString(p) == senderID {
					senderFound = true
					break
				}
			}
			if !senderFound {
				t.Logf("Sender %s not found in participants", senderID)
				return false
			}

			// Verify all receivers are in participants
			for _, receiverID := range receiverIDs {
				found := false
				for _, p := range capturedParticipants {
					if uuidToString(p) == receiverID {
						found = true
						break
					}
				}
				if !found {
					t.Logf("Receiver %s not found in participants", receiverID)
					return false
				}
			}

			return true
		},
		receiverIDsGen,
	))

	// Property: Single receiver becomes participant
	properties.Property("single receiver becomes participant", prop.ForAll(
		func(_ int) bool {
			// Setup with single receiver
			conversationID := uuid.New().String()
			senderID := uuid.New().String()
			receiverID := uuid.New().String()
			messageID := uuid.New().String()
			content := "Test message"
			idempotencyKey := uuid.New().String()

			// Parse UUIDs
			conversationUUID, _ := parseUUID(conversationID)
			senderUUID, _ := parseUUID(senderID)
			messageUUID, _ := parseUUID(messageID)

			// Track captured participants
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

			// Create request with single receiver
			req := &chatv1.SendMessageRequest{
				ConversationId: conversationID,
				Content:        content,
				IdempotencyKey: idempotencyKey,
				ReceiverIds:    []string{receiverID},
			}

			// Execute
			_, err := service.SendMessage(ctx, req)
			if err != nil {
				return false
			}

			// Verify: Should have exactly 2 participants (sender + receiver)
			if len(capturedParticipants) != 2 {
				return false
			}

			// Verify both sender and receiver are present
			senderFound := false
			receiverFound := false
			for _, p := range capturedParticipants {
				pStr := uuidToString(p)
				if pStr == senderID {
					senderFound = true
				}
				if pStr == receiverID {
					receiverFound = true
				}
			}

			return senderFound && receiverFound
		},
		gen.Int(),
	))

	// Property: Participants are passed to bulk insert in correct conversation
	properties.Property("participants added to correct conversation", prop.ForAll(
		func(receiverIDs []string) bool {
			// Setup
			conversationID := uuid.New().String()
			senderID := uuid.New().String()
			messageID := uuid.New().String()
			idempotencyKey := uuid.New().String()

			// Parse UUIDs
			conversationUUID, _ := parseUUID(conversationID)
			senderUUID, _ := parseUUID(senderID)
			messageUUID, _ := parseUUID(messageID)

			// Track the conversation ID passed to AddConversationParticipants
			var capturedConversationID pgtype.UUID

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
				capturedConversationID = params.ConversationID
				return nil
			}
			mocks.mockInsertMessage = func(ctx context.Context, qtx *repository.Queries, params repository.InsertMessageParams) (repository.Message, error) {
				msg := repository.Message{
					ID:             messageUUID,
					ConversationID: conversationUUID,
					SenderID:       senderUUID,
					Content:        "Test",
				}
				msg.CreatedAt.Scan(time.Now())
				return msg, nil
			}
			mocks.mockUpdateLastMessage = func(ctx context.Context, qtx *repository.Queries, params repository.UpdateConversationLastMessageParams) error {
				return nil
			}
			mocks.mockGetConversationParticipants = func(ctx context.Context, qtx *repository.Queries, convID pgtype.UUID) ([]pgtype.UUID, error) {
				return []pgtype.UUID{senderUUID}, nil
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

			// Create request
			req := &chatv1.SendMessageRequest{
				ConversationId: conversationID,
				Content:        "Test",
				IdempotencyKey: idempotencyKey,
				ReceiverIds:    receiverIDs,
			}

			// Execute
			_, err := service.SendMessage(ctx, req)
			if err != nil {
				return false
			}

			// Verify: The conversation ID passed to AddConversationParticipants matches the request
			return uuidToString(capturedConversationID) == conversationID
		},
		gen.SliceOfN(5, validUUIDGen).SuchThat(func(ids []string) bool {
			return len(ids) >= 1
		}).Map(func(ids []string) []string {
			if len(ids) == 0 {
				return []string{uuid.New().String()}
			}
			return ids
		}),
	))

	// Property: Duplicate receivers in input are all passed (DB handles dedup via ON CONFLICT)
	properties.Property("duplicate receivers are passed to bulk insert", prop.ForAll(
		func(_ int) bool {
			// Setup with duplicate receiver
			conversationID := uuid.New().String()
			senderID := uuid.New().String()
			receiverID := uuid.New().String() // Same receiver twice
			messageID := uuid.New().String()
			idempotencyKey := uuid.New().String()

			// Parse UUIDs
			conversationUUID, _ := parseUUID(conversationID)
			senderUUID, _ := parseUUID(senderID)
			messageUUID, _ := parseUUID(messageID)

			// Track captured participants
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
					Content:        "Test",
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

			// Create request with duplicate receiver
			req := &chatv1.SendMessageRequest{
				ConversationId: conversationID,
				Content:        "Test",
				IdempotencyKey: idempotencyKey,
				ReceiverIds:    []string{receiverID, receiverID}, // Duplicate
			}

			// Execute
			_, err := service.SendMessage(ctx, req)
			if err != nil {
				return false
			}

			// Verify: Should have 3 participants (sender + 2x receiver)
			// The service passes all to DB, DB handles dedup via ON CONFLICT DO NOTHING
			if len(capturedParticipants) != 3 {
				fmt.Printf("Expected 3 participants, got %d\n", len(capturedParticipants))
				return false
			}

			// Verify receiver appears twice in the array passed to DB
			receiverCount := 0
			for _, p := range capturedParticipants {
				if uuidToString(p) == receiverID {
					receiverCount++
				}
			}

			return receiverCount == 2
		},
		gen.Int(),
	))

	properties.TestingRun(t)
}

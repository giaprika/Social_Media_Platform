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

// **Feature: auto-add-receivers, Property 3: Idempotent participant insertion**
// *For any* receiver_id that is already a participant, calling `AddParticipant` again
// SHALL NOT create duplicate entries and SHALL NOT return an error.
// **Validates: Requirements 1.3**
func TestProperty_IdempotentParticipantInsertion(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100

	properties := gopter.NewProperties(parameters)

	// Generator for valid UUID strings
	validUUIDGen := gen.Const(nil).Map(func(_ interface{}) string {
		return uuid.New().String()
	})

	// Property: Sending multiple messages with same receivers does not create duplicates
	// The mock simulates the database behavior with ON CONFLICT DO NOTHING
	properties.Property("multiple sends with same receivers creates no duplicates", prop.ForAll(
		func(receiverIDs []string) bool {
			// Setup - use same conversation and receivers for multiple sends
			conversationID := uuid.New().String()
			senderID := uuid.New().String()
			content := "Test message"

			// Parse UUIDs for mock setup
			conversationUUID, _ := parseUUID(conversationID)
			senderUUID, _ := parseUUID(senderID)

			// Simulate database state - track unique participants (like DB with ON CONFLICT DO NOTHING)
			participantSet := make(map[string]bool)

			// Create mock idempotency checker that allows multiple requests (different keys)
			mockIdempotency := new(MockIdempotencyChecker)
			mockIdempotency.On("Check", mock.Anything, mock.Anything).Return(nil)

			// Create service
			service := &ChatService{
				idempotencyCheck: mockIdempotency,
				logger:           zap.NewNop(),
			}

			// Setup mocks that simulate ON CONFLICT DO NOTHING behavior
			mocks := newMockTransactionHelpers()
			mocks.mockBeginTx = func(ctx context.Context) (repository.DBTX, error) {
				return mocks.mockTx, nil
			}
			mocks.mockUpsertConversation = func(ctx context.Context, qtx *repository.Queries, id pgtype.UUID) (repository.Conversation, error) {
				return repository.Conversation{ID: conversationUUID}, nil
			}
			// This mock simulates ON CONFLICT DO NOTHING - adds to set (no duplicates)
			mocks.mockAddConversationParticipants = func(ctx context.Context, qtx *repository.Queries, params repository.AddConversationParticipantsParams) error {
				for _, p := range params.Column2 {
					participantSet[uuidToString(p)] = true
				}
				return nil // ON CONFLICT DO NOTHING - no error even if duplicate
			}
			mocks.mockInsertMessage = func(ctx context.Context, qtx *repository.Queries, params repository.InsertMessageParams) (repository.Message, error) {
				messageUUID, _ := parseUUID(uuid.New().String())
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
				// Return unique participants from the set
				result := make([]pgtype.UUID, 0, len(participantSet))
				for pStr := range participantSet {
					pUUID, _ := parseUUID(pStr)
					result = append(result, pUUID)
				}
				return result, nil
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

			// Send first message
			req1 := &chatv1.SendMessageRequest{
				ConversationId: conversationID,
				Content:        content,
				IdempotencyKey: uuid.New().String(), // Different key for each request
				ReceiverIds:    receiverIDs,
			}
			_, err := service.SendMessage(ctx, req1)
			if err != nil {
				t.Logf("First SendMessage failed: %v", err)
				return false
			}

			// Record participant count after first send
			countAfterFirst := len(participantSet)

			// Send second message with SAME receivers
			req2 := &chatv1.SendMessageRequest{
				ConversationId: conversationID,
				Content:        "Second message",
				IdempotencyKey: uuid.New().String(), // Different key
				ReceiverIds:    receiverIDs,
			}
			_, err = service.SendMessage(ctx, req2)
			if err != nil {
				t.Logf("Second SendMessage failed: %v", err)
				return false
			}

			// Verify: participant count should remain the same (no duplicates)
			countAfterSecond := len(participantSet)
			if countAfterFirst != countAfterSecond {
				t.Logf("Participant count changed: %d -> %d (expected no change)", countAfterFirst, countAfterSecond)
				return false
			}

			// Verify: expected count is sender + unique receivers
			expectedCount := 1 + len(receiverIDs)
			if countAfterSecond != expectedCount {
				t.Logf("Expected %d participants, got %d", expectedCount, countAfterSecond)
				return false
			}

			return true
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

	// Property: Adding same participant multiple times in single request causes no error
	properties.Property("duplicate receivers in single request causes no error", prop.ForAll(
		func(_ int) bool {
			// Setup with duplicate receiver in the same request
			conversationID := uuid.New().String()
			senderID := uuid.New().String()
			receiverID := uuid.New().String()
			content := "Test message"

			// Parse UUIDs
			conversationUUID, _ := parseUUID(conversationID)
			senderUUID, _ := parseUUID(senderID)

			// Simulate database state
			participantSet := make(map[string]bool)

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
				// Simulate ON CONFLICT DO NOTHING - add to set
				for _, p := range params.Column2 {
					participantSet[uuidToString(p)] = true
				}
				return nil
			}
			mocks.mockInsertMessage = func(ctx context.Context, qtx *repository.Queries, params repository.InsertMessageParams) (repository.Message, error) {
				messageUUID, _ := parseUUID(uuid.New().String())
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
				result := make([]pgtype.UUID, 0, len(participantSet))
				for pStr := range participantSet {
					pUUID, _ := parseUUID(pStr)
					result = append(result, pUUID)
				}
				return result, nil
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
				Content:        content,
				IdempotencyKey: uuid.New().String(),
				ReceiverIds:    []string{receiverID, receiverID, receiverID}, // Same receiver 3 times
			}

			// Execute - should not error
			_, err := service.SendMessage(ctx, req)
			if err != nil {
				t.Logf("SendMessage with duplicate receivers failed: %v", err)
				return false
			}

			// Verify: should have exactly 2 unique participants (sender + 1 receiver)
			if len(participantSet) != 2 {
				t.Logf("Expected 2 unique participants, got %d", len(participantSet))
				return false
			}

			// Verify sender and receiver are both present
			if !participantSet[senderID] {
				t.Logf("Sender not in participant set")
				return false
			}
			if !participantSet[receiverID] {
				t.Logf("Receiver not in participant set")
				return false
			}

			return true
		},
		gen.Int(),
	))

	// Property: Sender already being a participant causes no error on subsequent sends
	properties.Property("sender as existing participant causes no error", prop.ForAll(
		func(_ int) bool {
			// Setup
			conversationID := uuid.New().String()
			senderID := uuid.New().String()
			receiverID := uuid.New().String()
			content := "Test message"

			// Parse UUIDs
			conversationUUID, _ := parseUUID(conversationID)
			senderUUID, _ := parseUUID(senderID)

			// Pre-populate participant set with sender (simulating existing participant)
			participantSet := make(map[string]bool)
			participantSet[senderID] = true

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
				// Simulate ON CONFLICT DO NOTHING
				for _, p := range params.Column2 {
					participantSet[uuidToString(p)] = true
				}
				return nil
			}
			mocks.mockInsertMessage = func(ctx context.Context, qtx *repository.Queries, params repository.InsertMessageParams) (repository.Message, error) {
				messageUUID, _ := parseUUID(uuid.New().String())
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
				result := make([]pgtype.UUID, 0, len(participantSet))
				for pStr := range participantSet {
					pUUID, _ := parseUUID(pStr)
					result = append(result, pUUID)
				}
				return result, nil
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
				Content:        content,
				IdempotencyKey: uuid.New().String(),
				ReceiverIds:    []string{receiverID},
			}

			// Execute - should not error even though sender is already a participant
			_, err := service.SendMessage(ctx, req)
			if err != nil {
				t.Logf("SendMessage failed when sender already participant: %v", err)
				return false
			}

			// Verify: should have exactly 2 participants (sender + receiver)
			if len(participantSet) != 2 {
				t.Logf("Expected 2 participants, got %d", len(participantSet))
				return false
			}

			return true
		},
		gen.Int(),
	))

	properties.TestingRun(t)
}

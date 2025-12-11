package service

import (
	"context"
	"encoding/json"
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

// **Feature: auto-add-receivers, Property 4: Outbox contains all receiver_ids**
// *For any* successfully sent message, the outbox event payload SHALL contain all
// receiver_ids that were specified in the request (merged with existing participants).
// **Validates: Requirements 1.4**
func TestProperty_OutboxContainsReceiverIDs(t *testing.T) {
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
		if len(ids) == 0 {
			return []string{uuid.New().String()}
		}
		return ids
	})

	// Property: Outbox payload contains all receiver_ids from the request
	properties.Property("outbox payload contains all receiver_ids", prop.ForAll(
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

			// Track the outbox payload
			var capturedOutboxPayload []byte

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
			// Return sender + all receivers as participants
			// This simulates what the DB would return after bulk insert
			mocks.mockGetConversationParticipants = func(ctx context.Context, qtx *repository.Queries, convID pgtype.UUID) ([]pgtype.UUID, error) {
				participants := make([]pgtype.UUID, 0, len(receiverIDs)+1)
				participants = append(participants, senderUUID)
				for _, rid := range receiverIDs {
					pUUID, _ := parseUUID(rid)
					participants = append(participants, pUUID)
				}
				return participants, nil
			}
			// Capture the outbox payload
			mocks.mockInsertOutbox = func(ctx context.Context, qtx *repository.Queries, params repository.InsertOutboxParams) error {
				capturedOutboxPayload = params.Payload
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

			// Parse the outbox payload
			var payload map[string]interface{}
			if err := json.Unmarshal(capturedOutboxPayload, &payload); err != nil {
				t.Logf("Failed to unmarshal outbox payload: %v", err)
				return false
			}

			// Verify receiver_ids in payload
			payloadReceiverIDs, ok := payload["receiver_ids"].([]interface{})
			if !ok {
				t.Logf("receiver_ids not found in payload or wrong type")
				return false
			}

			// Convert to string slice for comparison
			payloadReceiverIDStrings := make([]string, len(payloadReceiverIDs))
			for i, rid := range payloadReceiverIDs {
				ridStr, ok := rid.(string)
				if !ok {
					t.Logf("receiver_id is not a string: %v", rid)
					return false
				}
				payloadReceiverIDStrings[i] = ridStr
			}

			// Verify all request receiver_ids are in the payload
			// Note: The payload receiver_ids come from GetConversationParticipants (excluding sender)
			// which should contain all the receivers we added
			for _, requestReceiverID := range receiverIDs {
				found := false
				for _, payloadReceiverID := range payloadReceiverIDStrings {
					if requestReceiverID == payloadReceiverID {
						found = true
						break
					}
				}
				if !found {
					t.Logf("Receiver %s from request not found in outbox payload", requestReceiverID)
					return false
				}
			}

			// Verify sender is NOT in receiver_ids (sender should be filtered out)
			for _, payloadReceiverID := range payloadReceiverIDStrings {
				if payloadReceiverID == senderID {
					t.Logf("Sender %s should not be in receiver_ids", senderID)
					return false
				}
			}

			return true
		},
		receiverIDsGen,
	))

	// Property: Outbox payload contains correct message metadata
	properties.Property("outbox payload contains correct message metadata", prop.ForAll(
		func(receiverIDs []string) bool {
			// Setup
			conversationID := uuid.New().String()
			senderID := uuid.New().String()
			messageID := uuid.New().String()
			content := "Test message content"
			idempotencyKey := uuid.New().String()

			// Parse UUIDs
			conversationUUID, _ := parseUUID(conversationID)
			senderUUID, _ := parseUUID(senderID)
			messageUUID, _ := parseUUID(messageID)

			// Track the outbox payload
			var capturedOutboxPayload []byte

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
			mocks.mockInsertOutbox = func(ctx context.Context, qtx *repository.Queries, params repository.InsertOutboxParams) error {
				capturedOutboxPayload = params.Payload
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
				IdempotencyKey: idempotencyKey,
				ReceiverIds:    receiverIDs,
			}

			// Execute
			_, err := service.SendMessage(ctx, req)
			if err != nil {
				t.Logf("SendMessage failed: %v", err)
				return false
			}

			// Parse the outbox payload
			var payload map[string]interface{}
			if err := json.Unmarshal(capturedOutboxPayload, &payload); err != nil {
				t.Logf("Failed to unmarshal outbox payload: %v", err)
				return false
			}

			// Verify required fields exist
			if payload["event_type"] != "message.sent" {
				t.Logf("event_type mismatch: expected 'message.sent', got '%v'", payload["event_type"])
				return false
			}
			if payload["message_id"] != messageID {
				t.Logf("message_id mismatch: expected '%s', got '%v'", messageID, payload["message_id"])
				return false
			}
			if payload["conversation_id"] != conversationID {
				t.Logf("conversation_id mismatch: expected '%s', got '%v'", conversationID, payload["conversation_id"])
				return false
			}
			if payload["sender_id"] != senderID {
				t.Logf("sender_id mismatch: expected '%s', got '%v'", senderID, payload["sender_id"])
				return false
			}
			if payload["content"] != content {
				t.Logf("content mismatch: expected '%s', got '%v'", content, payload["content"])
				return false
			}
			if _, ok := payload["created_at"]; !ok {
				t.Logf("created_at not found in payload")
				return false
			}

			return true
		},
		receiverIDsGen,
	))

	// Property: Empty receiver_ids results in empty receiver_ids in outbox (only sender filtered out)
	properties.Property("empty receiver_ids results in empty outbox receiver_ids", prop.ForAll(
		func(_ int) bool {
			// Setup with no receivers
			conversationID := uuid.New().String()
			senderID := uuid.New().String()
			messageID := uuid.New().String()
			content := "Test message"
			idempotencyKey := uuid.New().String()

			// Parse UUIDs
			conversationUUID, _ := parseUUID(conversationID)
			senderUUID, _ := parseUUID(senderID)
			messageUUID, _ := parseUUID(messageID)

			// Track the outbox payload
			var capturedOutboxPayload []byte

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
			// Return only sender as participant (no receivers)
			mocks.mockGetConversationParticipants = func(ctx context.Context, qtx *repository.Queries, convID pgtype.UUID) ([]pgtype.UUID, error) {
				return []pgtype.UUID{senderUUID}, nil
			}
			mocks.mockInsertOutbox = func(ctx context.Context, qtx *repository.Queries, params repository.InsertOutboxParams) error {
				capturedOutboxPayload = params.Payload
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

			// Create request WITHOUT receiver_ids
			req := &chatv1.SendMessageRequest{
				ConversationId: conversationID,
				Content:        content,
				IdempotencyKey: idempotencyKey,
				ReceiverIds:    nil, // No receivers
			}

			// Execute
			_, err := service.SendMessage(ctx, req)
			if err != nil {
				t.Logf("SendMessage failed: %v", err)
				return false
			}

			// Parse the outbox payload
			var payload map[string]interface{}
			if err := json.Unmarshal(capturedOutboxPayload, &payload); err != nil {
				t.Logf("Failed to unmarshal outbox payload: %v", err)
				return false
			}

			// Verify receiver_ids is empty (sender filtered out)
			payloadReceiverIDs, ok := payload["receiver_ids"].([]interface{})
			if !ok {
				t.Logf("receiver_ids not found in payload or wrong type")
				return false
			}

			if len(payloadReceiverIDs) != 0 {
				t.Logf("Expected empty receiver_ids, got %d items", len(payloadReceiverIDs))
				return false
			}

			return true
		},
		gen.Int(),
	))

	properties.TestingRun(t)
}

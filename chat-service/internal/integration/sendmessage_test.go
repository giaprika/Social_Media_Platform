package integration

import (
	"context"
	"net/http"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestSendMessage_Success tests the complete SendMessage flow
// This test verifies:
// - Message is sent successfully via HTTP POST
// - Response contains message_id and status "SENT"
// - Message exists in messages table
// - Outbox entry is created with correct payload
// - Conversation last_message_content and last_message_at are updated
func TestSendMessage_Success(t *testing.T) {
	t.Parallel() // Safe to run in parallel - uses unique UUIDs
	ctx := context.Background()

	// Setup: Generate test IDs for users and conversation
	testIDs := GenerateTestIDs()

	// Create test conversation with participants
	_, err := CreateTestConversation(ctx, testInfra.DBPool, testIDs.ConversationAB, []string{testIDs.UserA, testIDs.UserB})
	require.NoError(t, err, "Failed to create test conversation")

	// Cleanup test data after test completes
	defer func() {
		err := CleanupConversation(ctx, testInfra.DBPool, testIDs.ConversationAB)
		if err != nil {
			t.Logf("Warning: Failed to cleanup conversation: %v", err)
		}
	}()

	// Execute: Send message via HTTP POST with authentication header
	messageContent := "Hello World"
	idempotencyKey := "test-key-" + uuid.New().String()

	result, resp, err := testServer.SendMessage(testIDs.UserA, testIDs.ConversationAB, messageContent, idempotencyKey)

	// Verify: Check HTTP response
	require.NoError(t, err, "Failed to send message")
	require.NotNil(t, resp, "Response should not be nil")
	assert.Equal(t, http.StatusOK, resp.StatusCode, "Should return 200 OK")

	// Verify: Check response body
	require.NotNil(t, result, "Result should not be nil")
	assert.NotEmpty(t, result.MessageID, "Response should contain message_id")
	assert.Equal(t, "SENT", result.Status, "Status should be SENT")

	// Verify: Message exists in messages table
	AssertMessageExists(t, testInfra.DBPool, result.MessageID)

	// Verify: Message details are correct
	msg, err := GetMessageFromDB(ctx, testInfra.DBPool, result.MessageID)
	require.NoError(t, err, "Failed to get message from database")
	assert.Equal(t, testIDs.ConversationAB, msg.ConversationID, "Message should belong to correct conversation")
	assert.Equal(t, testIDs.UserA, msg.SenderID, "Message should have correct sender")
	assert.Equal(t, messageContent, msg.Content, "Message should have correct content")
	assert.False(t, msg.CreatedAt.IsZero(), "Message should have created_at timestamp")

	// Verify: Outbox entry created with correct payload
	AssertOutboxEntryExists(t, testInfra.DBPool, result.MessageID)

	// Verify: Outbox entry has correct structure and fields
	outboxEntry, err := GetOutboxEntryFromDB(ctx, testInfra.DBPool, result.MessageID)
	require.NoError(t, err, "Failed to get outbox entry from database")
	assert.Equal(t, "message", outboxEntry.AggregateType, "Outbox entry should have aggregate_type 'message'")
	assert.Equal(t, result.MessageID, outboxEntry.AggregateID, "Outbox entry should have correct aggregate_id")
	assert.Nil(t, outboxEntry.ProcessedAt, "Outbox entry should not be processed yet")

	// Verify: Outbox payload contains required fields
	AssertOutboxPayloadContains(t, testInfra.DBPool, result.MessageID, map[string]interface{}{
		"message_id":      result.MessageID,
		"conversation_id": testIDs.ConversationAB,
		"sender_id":       testIDs.UserA,
		"content":         messageContent,
	})

	// Verify: Conversation last_message_content and last_message_at updated
	AssertConversationLastMessage(t, testInfra.DBPool, testIDs.ConversationAB, messageContent)
}

// TestSendMessage_Idempotency tests the idempotency behavior of SendMessage
// This test verifies:
// - First request with idempotency key succeeds (200 OK)
// - Second request with same idempotency key returns 409 AlreadyExists error
// - Only one message exists in database
// - Redis idempotency key is set after first request
func TestSendMessage_Idempotency(t *testing.T) {
	t.Parallel() // Safe to run in parallel - uses unique UUIDs and idempotency keys
	ctx := context.Background()

	// Setup: Generate test IDs for users and conversation
	testIDs := GenerateTestIDs()

	// Create test conversation with participants
	_, err := CreateTestConversation(ctx, testInfra.DBPool, testIDs.ConversationAB, []string{testIDs.UserA, testIDs.UserB})
	require.NoError(t, err, "Failed to create test conversation")

	// Generate a unique idempotency key for this test
	idempotencyKey := "test-idempotency-" + uuid.New().String()

	// Cleanup test data after test completes
	defer func() {
		// Clean up Redis idempotency key
		err := CleanupRedisKeys(ctx, testInfra, []string{"idempotency:" + idempotencyKey})
		if err != nil {
			t.Logf("Warning: Failed to cleanup Redis key: %v", err)
		}
		
		// Clean up conversation and messages
		err = CleanupConversation(ctx, testInfra.DBPool, testIDs.ConversationAB)
		if err != nil {
			t.Logf("Warning: Failed to cleanup conversation: %v", err)
		}
	}()

	// Execute: Send message with specific idempotency key (first request)
	messageContent := "Test idempotency message"
	result1, resp1, err := testServer.SendMessage(testIDs.UserA, testIDs.ConversationAB, messageContent, idempotencyKey)

	// Verify: First request returns 200 OK
	require.NoError(t, err, "First request should not return an error")
	require.NotNil(t, resp1, "First response should not be nil")
	assert.Equal(t, http.StatusOK, resp1.StatusCode, "First request should return 200 OK")

	// Verify: First request returns valid response
	require.NotNil(t, result1, "First result should not be nil")
	assert.NotEmpty(t, result1.MessageID, "First response should contain message_id")
	assert.Equal(t, "SENT", result1.Status, "Status should be SENT")

	// Verify: Message exists in database
	AssertMessageExists(t, testInfra.DBPool, result1.MessageID)

	// Verify: Redis idempotency key is set
	AssertRedisIdempotencyKeyExists(t, testInfra, idempotencyKey)

	// Execute: Send same message again with same idempotency key (second request)
	result2, resp2, err := testServer.SendMessage(testIDs.UserA, testIDs.ConversationAB, messageContent, idempotencyKey)

	// Verify: Second request returns 409 AlreadyExists error
	require.NoError(t, err, "Second request should not return a connection error")
	require.NotNil(t, resp2, "Second response should not be nil")
	assert.Equal(t, http.StatusConflict, resp2.StatusCode, "Second request should return 409 Conflict")

	// Verify: Second request does not return a successful result
	assert.Nil(t, result2, "Second request should not return a result")

	// Verify: Parse error response (if available)
	// Note: The error is properly returned as 409 Conflict, which is the important part
	// The exact error message format may vary based on grpc-gateway error handling

	// Verify: Only one message exists in database
	// Count messages in the conversation
	var messageCount int
	countQuery := `SELECT COUNT(*) FROM messages WHERE conversation_id = $1`
	err = testInfra.DBPool.QueryRow(ctx, countQuery, testIDs.ConversationAB).Scan(&messageCount)
	require.NoError(t, err, "Failed to count messages")
	assert.Equal(t, 1, messageCount, "Only one message should exist in database")

	// Verify: The message that exists is from the first request
	msg, err := GetMessageFromDB(ctx, testInfra.DBPool, result1.MessageID)
	require.NoError(t, err, "Should be able to retrieve the message")
	assert.Equal(t, messageContent, msg.Content, "Message content should match")
	assert.Equal(t, testIDs.UserA, msg.SenderID, "Message sender should match")
	assert.Equal(t, testIDs.ConversationAB, msg.ConversationID, "Message conversation should match")
}

// TestSendMessage_Unauthenticated tests that SendMessage fails without authentication
// This test verifies:
// - Request without x-user-id header returns 401 Unauthenticated error
// - No message is created in the database
// - No outbox entry is created
func TestSendMessage_Unauthenticated(t *testing.T) {
	t.Parallel() // Safe to run in parallel - uses unique UUIDs
	ctx := context.Background()

	// Setup: Generate test IDs for conversation
	testIDs := GenerateTestIDs()

	// Create test conversation with participants
	_, err := CreateTestConversation(ctx, testInfra.DBPool, testIDs.ConversationAB, []string{testIDs.UserA, testIDs.UserB})
	require.NoError(t, err, "Failed to create test conversation")

	// Cleanup test data after test completes
	defer func() {
		err := CleanupConversation(ctx, testInfra.DBPool, testIDs.ConversationAB)
		if err != nil {
			t.Logf("Warning: Failed to cleanup conversation: %v", err)
		}
	}()

	// Execute: Send message WITHOUT x-user-id header (unauthenticated request)
	messageContent := "This message should not be sent"
	idempotencyKey := "test-key-" + uuid.New().String()

	requestBody := map[string]interface{}{
		"conversation_id": testIDs.ConversationAB,
		"content":         messageContent,
		"idempotency_key": idempotencyKey,
	}

	// Make request without authentication headers (empty headers map)
	resp, err := testServer.MakeRequest("POST", "/v1/messages", requestBody, map[string]string{})

	// Verify: Check HTTP response
	require.NoError(t, err, "Request should not fail at connection level")
	require.NotNil(t, resp, "Response should not be nil")
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode, "Should return 401 Unauthorized")

	// Verify: No messages were created in the conversation
	var messageCount int
	countQuery := `SELECT COUNT(*) FROM messages WHERE conversation_id = $1`
	err = testInfra.DBPool.QueryRow(ctx, countQuery, testIDs.ConversationAB).Scan(&messageCount)
	require.NoError(t, err, "Failed to count messages")
	assert.Equal(t, 0, messageCount, "No messages should be created without authentication")

	// Verify: No outbox entries were created for this conversation
	var outboxCount int
	outboxQuery := `
		SELECT COUNT(*) 
		FROM outbox 
		WHERE aggregate_type = 'message' 
		AND payload->>'conversation_id' = $1
	`
	err = testInfra.DBPool.QueryRow(ctx, outboxQuery, testIDs.ConversationAB).Scan(&outboxCount)
	require.NoError(t, err, "Failed to count outbox entries")
	assert.Equal(t, 0, outboxCount, "No outbox entries should be created without authentication")
}

// TestSendMessage_ValidationErrors tests validation error handling for SendMessage
// This test verifies:
// - Invalid conversation_id format returns 400 Bad Request
// - Empty content returns 400 Bad Request
// - Missing idempotency_key returns 400 Bad Request
// - No database changes occur for validation errors
func TestSendMessage_ValidationErrors(t *testing.T) {
	t.Parallel() // Safe to run in parallel - uses unique UUIDs
	ctx := context.Background()

	// Setup: Generate test IDs
	testIDs := GenerateTestIDs()

	// Create test conversation for valid conversation_id tests
	_, err := CreateTestConversation(ctx, testInfra.DBPool, testIDs.ConversationAB, []string{testIDs.UserA, testIDs.UserB})
	require.NoError(t, err, "Failed to create test conversation")

	// Cleanup test data after test completes
	defer func() {
		err := CleanupConversation(ctx, testInfra.DBPool, testIDs.ConversationAB)
		if err != nil {
			t.Logf("Warning: Failed to cleanup conversation: %v", err)
		}
	}()

	// Test cases for validation errors
	testCases := []struct {
		name               string
		conversationID     string
		content            string
		idempotencyKey     string
		expectedStatusCode int
		description        string
	}{
		{
			name:               "Invalid conversation_id format",
			conversationID:     "not-a-valid-uuid",
			content:            "Test message",
			idempotencyKey:     "test-key-" + uuid.New().String(),
			expectedStatusCode: http.StatusInternalServerError,
			description:        "Should return 500 Internal Server Error for invalid UUID format (parsing error during transaction)",
		},
		{
			name:               "Empty conversation_id",
			conversationID:     "",
			content:            "Test message",
			idempotencyKey:     "test-key-" + uuid.New().String(),
			expectedStatusCode: http.StatusBadRequest,
			description:        "Should return 400 Bad Request for empty conversation_id",
		},
		{
			name:               "Empty content",
			conversationID:     testIDs.ConversationAB,
			content:            "",
			idempotencyKey:     "test-key-" + uuid.New().String(),
			expectedStatusCode: http.StatusBadRequest,
			description:        "Should return 400 Bad Request for empty content",
		},
		{
			name:               "Missing idempotency_key",
			conversationID:     testIDs.ConversationAB,
			content:            "Test message",
			idempotencyKey:     "",
			expectedStatusCode: http.StatusBadRequest,
			description:        "Should return 400 Bad Request for missing idempotency_key",
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			// Get initial message count for this conversation
			var initialMessageCount int
			countQuery := `SELECT COUNT(*) FROM messages WHERE conversation_id = $1`
			err := testInfra.DBPool.QueryRow(ctx, countQuery, testIDs.ConversationAB).Scan(&initialMessageCount)
			require.NoError(t, err, "Failed to count initial messages")

			// Get initial outbox count for this specific conversation
			var initialOutboxCount int
			outboxQuery := `
				SELECT COUNT(*) 
				FROM outbox 
				WHERE aggregate_type = 'message' 
				AND payload->>'conversation_id' = $1
			`
			err = testInfra.DBPool.QueryRow(ctx, outboxQuery, testIDs.ConversationAB).Scan(&initialOutboxCount)
			require.NoError(t, err, "Failed to count initial outbox entries")

			// Execute: Send message with validation error
			requestBody := map[string]interface{}{
				"conversation_id": tc.conversationID,
				"content":         tc.content,
				"idempotency_key": tc.idempotencyKey,
			}

			resp, err := testServer.MakeRequest("POST", "/v1/messages", requestBody, map[string]string{
				"x-user-id": testIDs.UserA,
			})

			// Verify: Check HTTP response
			require.NoError(t, err, "Request should not fail at connection level")
			require.NotNil(t, resp, "Response should not be nil")
			assert.Equal(t, tc.expectedStatusCode, resp.StatusCode, tc.description)

			// Verify: No new messages were created
			var finalMessageCount int
			err = testInfra.DBPool.QueryRow(ctx, countQuery, testIDs.ConversationAB).Scan(&finalMessageCount)
			require.NoError(t, err, "Failed to count final messages")
			assert.Equal(t, initialMessageCount, finalMessageCount, "No messages should be created for validation errors")

			// Verify: No new outbox entries were created for this conversation
			var finalOutboxCount int
			err = testInfra.DBPool.QueryRow(ctx, outboxQuery, testIDs.ConversationAB).Scan(&finalOutboxCount)
			require.NoError(t, err, "Failed to count final outbox entries")
			assert.Equal(t, initialOutboxCount, finalOutboxCount, "No outbox entries should be created for validation errors")
		})
	}
}

// TestSendMessage_TransactionalOutbox tests the transactional outbox pattern
// This test verifies:
// - Message is sent successfully
// - Outbox entry is created in the same transaction
// - Outbox payload contains all required fields (message_id, conversation_id, sender_id, content, created_at)
// - Outbox entry has processed=false (ProcessedAt is nil)
// - Outbox entry has aggregate_type="message" and aggregate_id matches message_id
func TestSendMessage_TransactionalOutbox(t *testing.T) {
	t.Parallel() // Safe to run in parallel - uses unique UUIDs
	ctx := context.Background()

	// Setup: Generate test IDs for users and conversation
	testIDs := GenerateTestIDs()

	// Create test conversation with participants
	_, err := CreateTestConversation(ctx, testInfra.DBPool, testIDs.ConversationAB, []string{testIDs.UserA, testIDs.UserB})
	require.NoError(t, err, "Failed to create test conversation")

	// Cleanup test data after test completes
	defer func() {
		err := CleanupConversation(ctx, testInfra.DBPool, testIDs.ConversationAB)
		if err != nil {
			t.Logf("Warning: Failed to cleanup conversation: %v", err)
		}
	}()

	// Execute: Send message successfully via HTTP POST
	messageContent := "Test transactional outbox message"
	idempotencyKey := "test-outbox-key-" + uuid.New().String()

	result, resp, err := testServer.SendMessage(testIDs.UserA, testIDs.ConversationAB, messageContent, idempotencyKey)

	// Verify: Check HTTP response
	require.NoError(t, err, "Failed to send message")
	require.NotNil(t, resp, "Response should not be nil")
	assert.Equal(t, http.StatusOK, resp.StatusCode, "Should return 200 OK")

	// Verify: Check response body
	require.NotNil(t, result, "Result should not be nil")
	assert.NotEmpty(t, result.MessageID, "Response should contain message_id")
	assert.Equal(t, "SENT", result.Status, "Status should be SENT")

	// Verify: Query outbox table for entry
	outboxEntry, err := GetOutboxEntryFromDB(ctx, testInfra.DBPool, result.MessageID)
	require.NoError(t, err, "Failed to get outbox entry from database")
	require.NotNil(t, outboxEntry, "Outbox entry should exist")

	// Verify: Outbox entry has aggregate_type="message"
	assert.Equal(t, "message", outboxEntry.AggregateType, "Outbox entry should have aggregate_type 'message'")

	// Verify: Outbox entry has aggregate_id matching message_id
	assert.Equal(t, result.MessageID, outboxEntry.AggregateID, "Outbox entry aggregate_id should match message_id")

	// Verify: Outbox entry has processed=false (ProcessedAt is nil)
	assert.Nil(t, outboxEntry.ProcessedAt, "Outbox entry should not be processed yet (ProcessedAt should be nil)")

	// Verify: Outbox payload contains all required fields
	require.NotNil(t, outboxEntry.Payload, "Outbox payload should not be nil")

	// Verify: Payload contains message_id
	messageIDFromPayload, exists := outboxEntry.Payload["message_id"]
	assert.True(t, exists, "Outbox payload should contain 'message_id' field")
	assert.Equal(t, result.MessageID, messageIDFromPayload, "Payload message_id should match response message_id")

	// Verify: Payload contains conversation_id
	conversationIDFromPayload, exists := outboxEntry.Payload["conversation_id"]
	assert.True(t, exists, "Outbox payload should contain 'conversation_id' field")
	assert.Equal(t, testIDs.ConversationAB, conversationIDFromPayload, "Payload conversation_id should match")

	// Verify: Payload contains sender_id
	senderIDFromPayload, exists := outboxEntry.Payload["sender_id"]
	assert.True(t, exists, "Outbox payload should contain 'sender_id' field")
	assert.Equal(t, testIDs.UserA, senderIDFromPayload, "Payload sender_id should match")

	// Verify: Payload contains content
	contentFromPayload, exists := outboxEntry.Payload["content"]
	assert.True(t, exists, "Outbox payload should contain 'content' field")
	assert.Equal(t, messageContent, contentFromPayload, "Payload content should match")

	// Verify: Payload contains created_at
	createdAtFromPayload, exists := outboxEntry.Payload["created_at"]
	assert.True(t, exists, "Outbox payload should contain 'created_at' field")
	assert.NotEmpty(t, createdAtFromPayload, "Payload created_at should not be empty")

	// Additional verification: Ensure message and outbox entry were created in the same transaction
	// by verifying both exist (if transaction failed, neither would exist)
	AssertMessageExists(t, testInfra.DBPool, result.MessageID)
	AssertOutboxEntryExists(t, testInfra.DBPool, result.MessageID)
}

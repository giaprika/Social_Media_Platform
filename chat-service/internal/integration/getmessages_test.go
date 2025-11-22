package integration

import (
	"context"
	"fmt"
	"net/http"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestGetMessages_Success tests the complete GetMessages flow
// This test verifies:
// - Messages are retrieved successfully via HTTP GET
// - Response returns 200 OK
// - All 5 messages are returned in descending order by created_at
// - Message fields (id, conversation_id, sender_id, content, created_at) are correct
func TestGetMessages_Success(t *testing.T) {
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

	// Create 5 test messages with different timestamps
	// We'll create them with specific timestamps to ensure predictable ordering
	baseTime := time.Now().Add(-1 * time.Hour)
	expectedMessages := make([]*TestMessage, 5)
	
	for i := 0; i < 5; i++ {
		messageID := uuid.New().String()
		content := fmt.Sprintf("Test message %d", i+1)
		// Create messages with timestamps 10 minutes apart
		timestamp := baseTime.Add(time.Duration(i*10) * time.Minute)
		
		msg, err := CreateTestMessageWithTimestamp(ctx, testInfra.DBPool, messageID, testIDs.ConversationAB, testIDs.UserA, content, timestamp)
		require.NoError(t, err, "Failed to create test message %d", i+1)
		expectedMessages[i] = msg
	}

	// Execute: Get messages via HTTP GET
	result, resp, err := testServer.GetMessages(testIDs.UserA, testIDs.ConversationAB, 0, "")

	// Verify: Check HTTP response
	require.NoError(t, err, "Failed to get messages")
	require.NotNil(t, resp, "Response should not be nil")
	assert.Equal(t, http.StatusOK, resp.StatusCode, "Should return 200 OK")

	// Verify: Check response body
	require.NotNil(t, result, "Result should not be nil")
	require.Len(t, result.Messages, 5, "Should return all 5 messages")

	// Verify: Messages are returned in descending order by created_at (newest first)
	// The last message created should be first in the response
	for i := 0; i < len(result.Messages); i++ {
		expectedIndex := len(expectedMessages) - 1 - i // Reverse order
		expectedMsg := expectedMessages[expectedIndex]
		actualMsg := result.Messages[i]

		// Verify message fields
		assert.Equal(t, expectedMsg.ID, actualMsg.ID, "Message %d: ID should match", i)
		assert.Equal(t, testIDs.ConversationAB, actualMsg.ConversationID, "Message %d: ConversationID should match", i)
		assert.Equal(t, testIDs.UserA, actualMsg.SenderID, "Message %d: SenderID should match", i)
		assert.Equal(t, expectedMsg.Content, actualMsg.Content, "Message %d: Content should match", i)
		assert.NotEmpty(t, actualMsg.CreatedAt, "Message %d: CreatedAt should not be empty", i)

		// Verify ordering: each message should have a later or equal timestamp than the next one
		if i < len(result.Messages)-1 {
			// Parse timestamps to compare
			currentTime, err := time.Parse(time.RFC3339Nano, result.Messages[i].CreatedAt)
			require.NoError(t, err, "Failed to parse timestamp for message %d", i)
			
			nextTime, err := time.Parse(time.RFC3339Nano, result.Messages[i+1].CreatedAt)
			require.NoError(t, err, "Failed to parse timestamp for message %d", i+1)
			
			assert.True(t, currentTime.After(nextTime) || currentTime.Equal(nextTime),
				"Message %d should have timestamp >= message %d (descending order)", i, i+1)
		}
	}
}

// TestGetMessages_Pagination tests the pagination functionality of GetMessages
// This test verifies:
// - Messages can be retrieved with a limit parameter
// - Only the specified number of messages are returned
// - A next_cursor is present when more messages exist
// - The next_cursor can be used as before_timestamp for the next page
// - The correct messages are returned on the second page
func TestGetMessages_Pagination(t *testing.T) {
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

	// Create 10 test messages with different timestamps
	// We'll create them with specific timestamps to ensure predictable ordering
	baseTime := time.Now().Add(-2 * time.Hour)
	expectedMessages := make([]*TestMessage, 10)
	
	for i := 0; i < 10; i++ {
		messageID := uuid.New().String()
		content := fmt.Sprintf("Test message %d", i+1)
		// Create messages with timestamps 5 minutes apart
		timestamp := baseTime.Add(time.Duration(i*5) * time.Minute)
		
		msg, err := CreateTestMessageWithTimestamp(ctx, testInfra.DBPool, messageID, testIDs.ConversationAB, testIDs.UserA, content, timestamp)
		require.NoError(t, err, "Failed to create test message %d", i+1)
		expectedMessages[i] = msg
	}

	// Execute: Get messages with limit=3
	result, resp, err := testServer.GetMessages(testIDs.UserA, testIDs.ConversationAB, 3, "")

	// Verify: Check HTTP response
	require.NoError(t, err, "Failed to get messages")
	require.NotNil(t, resp, "Response should not be nil")
	assert.Equal(t, http.StatusOK, resp.StatusCode, "Should return 200 OK")

	// Verify: Check response body - only 3 messages returned
	require.NotNil(t, result, "Result should not be nil")
	require.Len(t, result.Messages, 3, "Should return exactly 3 messages")

	// Verify: next_cursor is present (since there are more messages)
	assert.NotEmpty(t, result.NextCursor, "NextCursor should be present when more messages exist")

	// Verify: First 3 messages are the newest ones (in descending order)
	// Messages should be: message 10, message 9, message 8
	for i := 0; i < 3; i++ {
		expectedIndex := len(expectedMessages) - 1 - i // Start from the newest
		expectedMsg := expectedMessages[expectedIndex]
		actualMsg := result.Messages[i]

		assert.Equal(t, expectedMsg.ID, actualMsg.ID, "First page message %d: ID should match", i)
		assert.Equal(t, expectedMsg.Content, actualMsg.Content, "First page message %d: Content should match", i)
	}

	// Execute: Use next_cursor as before_timestamp for second request
	result2, resp2, err := testServer.GetMessages(testIDs.UserA, testIDs.ConversationAB, 3, result.NextCursor)

	// Verify: Check HTTP response for second page
	require.NoError(t, err, "Failed to get messages for second page")
	require.NotNil(t, resp2, "Response should not be nil for second page")
	assert.Equal(t, http.StatusOK, resp2.StatusCode, "Should return 200 OK for second page")

	// Verify: Check response body - next 3 messages returned
	require.NotNil(t, result2, "Result should not be nil for second page")
	require.Len(t, result2.Messages, 3, "Should return exactly 3 messages for second page")

	// Verify: next_cursor is present (since there are still more messages)
	assert.NotEmpty(t, result2.NextCursor, "NextCursor should be present when more messages exist on second page")

	// Verify: Second page contains the next 3 messages (message 7, message 6, message 5)
	for i := 0; i < 3; i++ {
		expectedIndex := len(expectedMessages) - 4 - i // Start from message 7 (index 6)
		expectedMsg := expectedMessages[expectedIndex]
		actualMsg := result2.Messages[i]

		assert.Equal(t, expectedMsg.ID, actualMsg.ID, "Second page message %d: ID should match", i)
		assert.Equal(t, expectedMsg.Content, actualMsg.Content, "Second page message %d: Content should match", i)
	}

	// Verify: Messages from first page are not in second page
	firstPageIDs := make(map[string]bool)
	for _, msg := range result.Messages {
		firstPageIDs[msg.ID] = true
	}
	
	for _, msg := range result2.Messages {
		assert.False(t, firstPageIDs[msg.ID], "Second page should not contain messages from first page")
	}

	// Verify: All messages are in descending order by timestamp
	for i := 0; i < len(result2.Messages)-1; i++ {
		currentTime, err := time.Parse(time.RFC3339Nano, result2.Messages[i].CreatedAt)
		require.NoError(t, err, "Failed to parse timestamp for message %d", i)
		
		nextTime, err := time.Parse(time.RFC3339Nano, result2.Messages[i+1].CreatedAt)
		require.NoError(t, err, "Failed to parse timestamp for message %d", i+1)
		
		assert.True(t, currentTime.After(nextTime) || currentTime.Equal(nextTime),
			"Message %d should have timestamp >= message %d (descending order)", i, i+1)
	}
}

// TestGetMessages_EmptyConversation tests retrieving messages from a conversation with no messages
// This test verifies:
// - A conversation with no messages returns 200 OK
// - The messages array is empty
// - The next_cursor is empty (no pagination needed)
func TestGetMessages_EmptyConversation(t *testing.T) {
	ctx := context.Background()

	// Setup: Generate test IDs for users and conversation
	testIDs := GenerateTestIDs()

	// Create test conversation with participants but NO messages
	_, err := CreateTestConversation(ctx, testInfra.DBPool, testIDs.ConversationAB, []string{testIDs.UserA, testIDs.UserB})
	require.NoError(t, err, "Failed to create test conversation")

	// Cleanup test data after test completes
	defer func() {
		err := CleanupConversation(ctx, testInfra.DBPool, testIDs.ConversationAB)
		if err != nil {
			t.Logf("Warning: Failed to cleanup conversation: %v", err)
		}
	}()

	// Execute: Get messages via HTTP GET (no messages exist)
	result, resp, err := testServer.GetMessages(testIDs.UserA, testIDs.ConversationAB, 0, "")

	// Verify: Check HTTP response
	require.NoError(t, err, "Failed to get messages")
	require.NotNil(t, resp, "Response should not be nil")
	assert.Equal(t, http.StatusOK, resp.StatusCode, "Should return 200 OK even for empty conversation")

	// Verify: Check response body
	require.NotNil(t, result, "Result should not be nil")
	
	// Verify: Messages array is empty
	assert.Empty(t, result.Messages, "Messages array should be empty for conversation with no messages")
	assert.Len(t, result.Messages, 0, "Should return 0 messages")

	// Verify: next_cursor is empty (no pagination needed)
	assert.Empty(t, result.NextCursor, "NextCursor should be empty when there are no messages")
}

// TestGetMessages_ValidationErrors tests validation error handling for GetMessages
// This test verifies:
// - Invalid conversation_id format returns 400 Bad Request
// - Invalid before_timestamp format returns 400 Bad Request
func TestGetMessages_ValidationErrors(t *testing.T) {
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
		beforeTimestamp    string
		expectedStatusCode int
		description        string
	}{
		{
			name:               "Invalid conversation_id format",
			conversationID:     "not-a-valid-uuid",
			beforeTimestamp:    "",
			expectedStatusCode: http.StatusBadRequest,
			description:        "Should return 400 Bad Request for invalid UUID format",
		},
		{
			name:               "Empty conversation_id",
			conversationID:     "",
			beforeTimestamp:    "",
			expectedStatusCode: http.StatusBadRequest,
			description:        "Should return 400 Bad Request for empty conversation_id",
		},
		{
			name:               "Invalid before_timestamp format",
			conversationID:     testIDs.ConversationAB,
			beforeTimestamp:    "not-a-valid-timestamp",
			expectedStatusCode: http.StatusBadRequest,
			description:        "Should return 400 Bad Request for invalid timestamp format",
		},
		{
			name:               "Invalid RFC3339 timestamp",
			conversationID:     testIDs.ConversationAB,
			beforeTimestamp:    "2024-13-45T99:99:99Z",
			expectedStatusCode: http.StatusBadRequest,
			description:        "Should return 400 Bad Request for malformed RFC3339 timestamp",
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			// Execute: Get messages with validation error
			result, resp, err := testServer.GetMessages(testIDs.UserA, tc.conversationID, 0, tc.beforeTimestamp)

			// Verify: Check HTTP response
			require.NoError(t, err, "Request should not fail at connection level")
			require.NotNil(t, resp, "Response should not be nil")
			assert.Equal(t, tc.expectedStatusCode, resp.StatusCode, tc.description)

			// Verify: No result returned for error cases
			assert.Nil(t, result, "Result should be nil for validation errors")
		})
	}
}

// TestGetMessages_LimitSanitization tests limit parameter sanitization
// This test verifies:
// - limit=0 defaults to 50
// - limit=200 caps at 100
// - negative limit defaults to 50
// - Correct number of messages returned in each case
func TestGetMessages_LimitSanitization(t *testing.T) {
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

	// Create 120 test messages to test all limit scenarios
	// This ensures we have enough messages to test:
	// - Default limit of 50
	// - Cap at 100
	baseTime := time.Now().Add(-3 * time.Hour)
	
	for i := 0; i < 120; i++ {
		messageID := uuid.New().String()
		content := fmt.Sprintf("Test message %d", i+1)
		// Create messages with timestamps 1 minute apart
		timestamp := baseTime.Add(time.Duration(i) * time.Minute)
		
		_, err := CreateTestMessageWithTimestamp(ctx, testInfra.DBPool, messageID, testIDs.ConversationAB, testIDs.UserA, content, timestamp)
		require.NoError(t, err, "Failed to create test message %d", i+1)
	}

	// Test cases for limit sanitization
	testCases := []struct {
		name           string
		limit          int32
		expectedCount  int
		description    string
	}{
		{
			name:          "Limit zero defaults to 50",
			limit:         0,
			expectedCount: 50,
			description:   "When limit=0, should default to 50 messages",
		},
		{
			name:          "Limit 200 caps at 100",
			limit:         200,
			expectedCount: 100,
			description:   "When limit=200, should cap at 100 messages",
		},
		{
			name:          "Negative limit defaults to 50",
			limit:         -10,
			expectedCount: 50,
			description:   "When limit is negative, should default to 50 messages",
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			// Execute: Get messages with specific limit
			result, resp, err := testServer.GetMessages(testIDs.UserA, testIDs.ConversationAB, tc.limit, "")

			// Verify: Check HTTP response
			require.NoError(t, err, "Failed to get messages")
			require.NotNil(t, resp, "Response should not be nil")
			assert.Equal(t, http.StatusOK, resp.StatusCode, "Should return 200 OK")

			// Verify: Check response body
			require.NotNil(t, result, "Result should not be nil")
			assert.Len(t, result.Messages, tc.expectedCount, tc.description)

			// Verify: Messages are in descending order by created_at
			for i := 0; i < len(result.Messages)-1; i++ {
				currentTime, err := time.Parse(time.RFC3339Nano, result.Messages[i].CreatedAt)
				require.NoError(t, err, "Failed to parse timestamp for message %d", i)
				
				nextTime, err := time.Parse(time.RFC3339Nano, result.Messages[i+1].CreatedAt)
				require.NoError(t, err, "Failed to parse timestamp for message %d", i+1)
				
				assert.True(t, currentTime.After(nextTime) || currentTime.Equal(nextTime),
					"Message %d should have timestamp >= message %d (descending order)", i, i+1)
			}

			// Verify: NextCursor is present since there are more messages
			assert.NotEmpty(t, result.NextCursor, "NextCursor should be present when more messages exist")
		})
	}
}

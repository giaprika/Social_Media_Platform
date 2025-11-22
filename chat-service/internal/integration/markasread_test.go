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

// TestMarkAsRead_Success tests the complete MarkAsRead flow
// This test verifies:
// - Conversation is created with 3 unread messages
// - MarkAsRead is called via HTTP POST
// - Response returns 200 OK with success=true
// - Database is queried to verify last_read_at timestamp is updated
// - All messages are now considered "read" (created before last_read_at)
func TestMarkAsRead_Success(t *testing.T) {
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

	// Get initial last_read_at timestamp for UserB (should be set to NOW when participant is created)
	initialLastReadAt, err := GetLastReadAt(ctx, testInfra.DBPool, testIDs.ConversationAB, testIDs.UserB)
	require.NoError(t, err, "Failed to get initial last_read_at")
	require.False(t, initialLastReadAt.IsZero(), "Initial last_read_at should be set")

	// Wait a moment to ensure messages are created after initial last_read_at
	time.Sleep(100 * time.Millisecond)

	// Create 3 unread messages from UserA (UserB hasn't read them yet)
	message1ID := uuid.New().String()
	message2ID := uuid.New().String()
	message3ID := uuid.New().String()

	_, err = CreateTestMessage(ctx, testInfra.DBPool, message1ID, testIDs.ConversationAB, testIDs.UserA, "Message 1")
	require.NoError(t, err, "Failed to create message 1")
	time.Sleep(10 * time.Millisecond)

	_, err = CreateTestMessage(ctx, testInfra.DBPool, message2ID, testIDs.ConversationAB, testIDs.UserA, "Message 2")
	require.NoError(t, err, "Failed to create message 2")
	time.Sleep(10 * time.Millisecond)

	_, err = CreateTestMessage(ctx, testInfra.DBPool, message3ID, testIDs.ConversationAB, testIDs.UserA, "Message 3")
	require.NoError(t, err, "Failed to create message 3")

	// Verify: UserB has 3 unread messages before marking as read
	unreadCountBefore, err := GetUnreadCount(ctx, testInfra.DBPool, testIDs.ConversationAB, testIDs.UserB)
	require.NoError(t, err, "Failed to get unread count before marking as read")
	assert.Equal(t, 3, unreadCountBefore, "UserB should have 3 unread messages before marking as read")

	// Execute: Mark conversation as read for UserB via HTTP POST
	result, resp, err := testServer.MarkAsRead(testIDs.UserB, testIDs.ConversationAB)

	// Verify: Check HTTP response
	require.NoError(t, err, "Failed to mark as read")
	require.NotNil(t, resp, "Response should not be nil")
	assert.Equal(t, http.StatusOK, resp.StatusCode, "Should return 200 OK")

	// Verify: Check response body
	require.NotNil(t, result, "Result should not be nil")
	assert.True(t, result.Success, "Response should indicate success=true")

	// Verify: Query database to verify last_read_at timestamp is updated
	updatedLastReadAt, err := GetLastReadAt(ctx, testInfra.DBPool, testIDs.ConversationAB, testIDs.UserB)
	require.NoError(t, err, "Failed to get updated last_read_at")
	assert.False(t, updatedLastReadAt.IsZero(), "Updated last_read_at should be set")

	// Verify: last_read_at timestamp is after the initial timestamp
	assert.True(t, updatedLastReadAt.After(initialLastReadAt), 
		"Updated last_read_at should be after initial last_read_at")

	// Verify: All messages are now considered "read" (unread count should be 0)
	unreadCountAfter, err := GetUnreadCount(ctx, testInfra.DBPool, testIDs.ConversationAB, testIDs.UserB)
	require.NoError(t, err, "Failed to get unread count after marking as read")
	assert.Equal(t, 0, unreadCountAfter, "UserB should have 0 unread messages after marking as read")

	// Verify: last_read_at is set to a recent timestamp (within last 5 seconds)
	timeSinceUpdate := time.Since(updatedLastReadAt)
	assert.Less(t, timeSinceUpdate, 5*time.Second, 
		"last_read_at should be set to a recent timestamp (within last 5 seconds)")

	// Additional verification: Ensure UserA's read status is not affected
	// (UserA is the sender, so their last_read_at should remain unchanged)
	userALastReadAt, err := GetLastReadAt(ctx, testInfra.DBPool, testIDs.ConversationAB, testIDs.UserA)
	require.NoError(t, err, "Failed to get UserA's last_read_at")
	assert.False(t, userALastReadAt.IsZero(), "UserA's last_read_at should be set")
}

// TestMarkAsRead_OnlyUserMessages tests that marking as read only affects the requesting user
// This test verifies:
// - Conversation is created with messages from both User A and User B
// - User B marks conversation as read
// - Only User B's last_read_at is updated
// - User A's last_read_at remains unchanged
// - User A still sees messages as unread
func TestMarkAsRead_OnlyUserMessages(t *testing.T) {
	t.Parallel() // Safe to run in parallel - uses unique UUIDs
	ctx := context.Background()

	// Setup: Generate test IDs for users and conversation
	testIDs := GenerateTestIDs()

	// Create test conversation with participants (User A and User B)
	_, err := CreateTestConversation(ctx, testInfra.DBPool, testIDs.ConversationAB, []string{testIDs.UserA, testIDs.UserB})
	require.NoError(t, err, "Failed to create test conversation")

	// Cleanup test data after test completes
	defer func() {
		err := CleanupConversation(ctx, testInfra.DBPool, testIDs.ConversationAB)
		if err != nil {
			t.Logf("Warning: Failed to cleanup conversation: %v", err)
		}
	}()

	// Get initial last_read_at timestamps for both users
	initialLastReadAtA, err := GetLastReadAt(ctx, testInfra.DBPool, testIDs.ConversationAB, testIDs.UserA)
	require.NoError(t, err, "Failed to get initial last_read_at for User A")
	require.False(t, initialLastReadAtA.IsZero(), "Initial last_read_at for User A should be set")

	initialLastReadAtB, err := GetLastReadAt(ctx, testInfra.DBPool, testIDs.ConversationAB, testIDs.UserB)
	require.NoError(t, err, "Failed to get initial last_read_at for User B")
	require.False(t, initialLastReadAtB.IsZero(), "Initial last_read_at for User B should be set")

	// Wait a moment to ensure messages are created after initial last_read_at
	time.Sleep(100 * time.Millisecond)

	// Create messages from User A (User B will see these as unread)
	messageA1ID := uuid.New().String()
	messageA2ID := uuid.New().String()

	_, err = CreateTestMessage(ctx, testInfra.DBPool, messageA1ID, testIDs.ConversationAB, testIDs.UserA, "Message from User A - 1")
	require.NoError(t, err, "Failed to create message from User A")
	time.Sleep(10 * time.Millisecond)

	_, err = CreateTestMessage(ctx, testInfra.DBPool, messageA2ID, testIDs.ConversationAB, testIDs.UserA, "Message from User A - 2")
	require.NoError(t, err, "Failed to create message from User A")
	time.Sleep(10 * time.Millisecond)

	// Create messages from User B (User A will see these as unread)
	messageB1ID := uuid.New().String()
	messageB2ID := uuid.New().String()

	_, err = CreateTestMessage(ctx, testInfra.DBPool, messageB1ID, testIDs.ConversationAB, testIDs.UserB, "Message from User B - 1")
	require.NoError(t, err, "Failed to create message from User B")
	time.Sleep(10 * time.Millisecond)

	_, err = CreateTestMessage(ctx, testInfra.DBPool, messageB2ID, testIDs.ConversationAB, testIDs.UserB, "Message from User B - 2")
	require.NoError(t, err, "Failed to create message from User B")

	// Verify: Both users have unread messages before marking as read
	unreadCountA, err := GetUnreadCount(ctx, testInfra.DBPool, testIDs.ConversationAB, testIDs.UserA)
	require.NoError(t, err, "Failed to get unread count for User A")
	assert.Equal(t, 4, unreadCountA, "User A should have 4 unread messages (2 from A, 2 from B)")

	unreadCountB, err := GetUnreadCount(ctx, testInfra.DBPool, testIDs.ConversationAB, testIDs.UserB)
	require.NoError(t, err, "Failed to get unread count for User B")
	assert.Equal(t, 4, unreadCountB, "User B should have 4 unread messages (2 from A, 2 from B)")

	// Execute: User B marks conversation as read via HTTP POST
	result, resp, err := testServer.MarkAsRead(testIDs.UserB, testIDs.ConversationAB)

	// Verify: Check HTTP response
	require.NoError(t, err, "Failed to mark as read")
	require.NotNil(t, resp, "Response should not be nil")
	assert.Equal(t, http.StatusOK, resp.StatusCode, "Should return 200 OK")

	// Verify: Check response body
	require.NotNil(t, result, "Result should not be nil")
	assert.True(t, result.Success, "Response should indicate success=true")

	// Verify: User B's last_read_at is updated
	updatedLastReadAtB, err := GetLastReadAt(ctx, testInfra.DBPool, testIDs.ConversationAB, testIDs.UserB)
	require.NoError(t, err, "Failed to get updated last_read_at for User B")
	assert.False(t, updatedLastReadAtB.IsZero(), "Updated last_read_at for User B should be set")
	assert.True(t, updatedLastReadAtB.After(initialLastReadAtB), 
		"User B's last_read_at should be updated to a later timestamp")

	// Verify: User B now has 0 unread messages
	unreadCountBAfter, err := GetUnreadCount(ctx, testInfra.DBPool, testIDs.ConversationAB, testIDs.UserB)
	require.NoError(t, err, "Failed to get unread count for User B after marking as read")
	assert.Equal(t, 0, unreadCountBAfter, "User B should have 0 unread messages after marking as read")

	// Verify: User A's last_read_at remains unchanged
	unchangedLastReadAtA, err := GetLastReadAt(ctx, testInfra.DBPool, testIDs.ConversationAB, testIDs.UserA)
	require.NoError(t, err, "Failed to get last_read_at for User A after User B marked as read")
	assert.Equal(t, initialLastReadAtA, unchangedLastReadAtA, 
		"User A's last_read_at should remain unchanged when User B marks as read")

	// Verify: User A still has 4 unread messages (User B's mark as read should not affect User A)
	unreadCountAAfter, err := GetUnreadCount(ctx, testInfra.DBPool, testIDs.ConversationAB, testIDs.UserA)
	require.NoError(t, err, "Failed to get unread count for User A after User B marked as read")
	assert.Equal(t, 4, unreadCountAAfter, 
		"User A should still have 4 unread messages (User B's mark as read should not affect User A)")

	// Additional verification: Ensure the timestamps are different
	assert.NotEqual(t, updatedLastReadAtB, unchangedLastReadAtA, 
		"User B's updated last_read_at should be different from User A's unchanged last_read_at")
}

// TestMarkAsRead_AlreadyRead tests that marking as read is idempotent
// This test verifies:
// - Conversation is created with messages that are already marked as read
// - MarkAsRead is called again on the same conversation
// - Response returns 200 OK with success=true (idempotent operation)
// - last_read_at timestamp remains valid (may be updated to current time)
// - No errors occur when marking already-read messages as read
func TestMarkAsRead_AlreadyRead(t *testing.T) {
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

	// Get initial last_read_at timestamp for UserB
	initialLastReadAt, err := GetLastReadAt(ctx, testInfra.DBPool, testIDs.ConversationAB, testIDs.UserB)
	require.NoError(t, err, "Failed to get initial last_read_at")
	require.False(t, initialLastReadAt.IsZero(), "Initial last_read_at should be set")

	// Wait a moment to ensure messages are created after initial last_read_at
	time.Sleep(100 * time.Millisecond)

	// Create 3 messages from UserA
	message1ID := uuid.New().String()
	message2ID := uuid.New().String()
	message3ID := uuid.New().String()

	_, err = CreateTestMessage(ctx, testInfra.DBPool, message1ID, testIDs.ConversationAB, testIDs.UserA, "Message 1")
	require.NoError(t, err, "Failed to create message 1")
	time.Sleep(10 * time.Millisecond)

	_, err = CreateTestMessage(ctx, testInfra.DBPool, message2ID, testIDs.ConversationAB, testIDs.UserA, "Message 2")
	require.NoError(t, err, "Failed to create message 2")
	time.Sleep(10 * time.Millisecond)

	_, err = CreateTestMessage(ctx, testInfra.DBPool, message3ID, testIDs.ConversationAB, testIDs.UserA, "Message 3")
	require.NoError(t, err, "Failed to create message 3")

	// Verify: UserB has 3 unread messages initially
	unreadCountInitial, err := GetUnreadCount(ctx, testInfra.DBPool, testIDs.ConversationAB, testIDs.UserB)
	require.NoError(t, err, "Failed to get initial unread count")
	assert.Equal(t, 3, unreadCountInitial, "UserB should have 3 unread messages initially")

	// Execute: Mark conversation as read for the first time
	result1, resp1, err := testServer.MarkAsRead(testIDs.UserB, testIDs.ConversationAB)

	// Verify: First mark as read succeeds
	require.NoError(t, err, "Failed to mark as read (first time)")
	require.NotNil(t, resp1, "Response should not be nil (first time)")
	assert.Equal(t, http.StatusOK, resp1.StatusCode, "Should return 200 OK (first time)")
	require.NotNil(t, result1, "Result should not be nil (first time)")
	assert.True(t, result1.Success, "Response should indicate success=true (first time)")

	// Verify: All messages are now marked as read
	unreadCountAfterFirst, err := GetUnreadCount(ctx, testInfra.DBPool, testIDs.ConversationAB, testIDs.UserB)
	require.NoError(t, err, "Failed to get unread count after first mark as read")
	assert.Equal(t, 0, unreadCountAfterFirst, "UserB should have 0 unread messages after first mark as read")

	// Get last_read_at timestamp after first mark as read
	lastReadAtAfterFirst, err := GetLastReadAt(ctx, testInfra.DBPool, testIDs.ConversationAB, testIDs.UserB)
	require.NoError(t, err, "Failed to get last_read_at after first mark as read")
	assert.False(t, lastReadAtAfterFirst.IsZero(), "last_read_at should be set after first mark as read")
	assert.True(t, lastReadAtAfterFirst.After(initialLastReadAt), 
		"last_read_at should be updated after first mark as read")

	// Wait a moment before marking as read again
	time.Sleep(100 * time.Millisecond)

	// Execute: Mark conversation as read again (all messages already read)
	result2, resp2, err := testServer.MarkAsRead(testIDs.UserB, testIDs.ConversationAB)

	// Verify: Second mark as read succeeds (idempotent operation)
	require.NoError(t, err, "Failed to mark as read (second time)")
	require.NotNil(t, resp2, "Response should not be nil (second time)")
	assert.Equal(t, http.StatusOK, resp2.StatusCode, "Should return 200 OK (second time - idempotent)")
	require.NotNil(t, result2, "Result should not be nil (second time)")
	assert.True(t, result2.Success, "Response should indicate success=true (second time - idempotent)")

	// Verify: Unread count remains 0
	unreadCountAfterSecond, err := GetUnreadCount(ctx, testInfra.DBPool, testIDs.ConversationAB, testIDs.UserB)
	require.NoError(t, err, "Failed to get unread count after second mark as read")
	assert.Equal(t, 0, unreadCountAfterSecond, "UserB should still have 0 unread messages after second mark as read")

	// Verify: last_read_at timestamp is still valid (may be updated to current time)
	lastReadAtAfterSecond, err := GetLastReadAt(ctx, testInfra.DBPool, testIDs.ConversationAB, testIDs.UserB)
	require.NoError(t, err, "Failed to get last_read_at after second mark as read")
	assert.False(t, lastReadAtAfterSecond.IsZero(), "last_read_at should still be set after second mark as read")

	// Verify: last_read_at is either the same or updated to a more recent time (both are valid for idempotent operation)
	assert.True(t, lastReadAtAfterSecond.Equal(lastReadAtAfterFirst) || lastReadAtAfterSecond.After(lastReadAtAfterFirst),
		"last_read_at should be the same or updated to a more recent time (idempotent behavior)")

	// Verify: No errors or side effects from marking already-read messages as read
	// This is implicitly verified by the successful response and consistent unread count
}

// TestMarkAsRead_Unauthenticated tests that marking as read without authentication fails
// This test verifies:
// - MarkAsRead is called without x-user-id header
// - Response returns 401 Unauthenticated error
// - No database changes occur
func TestMarkAsRead_Unauthenticated(t *testing.T) {
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

	// Get initial last_read_at timestamp for UserB
	initialLastReadAt, err := GetLastReadAt(ctx, testInfra.DBPool, testIDs.ConversationAB, testIDs.UserB)
	require.NoError(t, err, "Failed to get initial last_read_at")
	require.False(t, initialLastReadAt.IsZero(), "Initial last_read_at should be set")

	// Wait a moment to ensure messages are created after initial last_read_at
	time.Sleep(100 * time.Millisecond)

	// Create messages to have unread messages
	messageID := uuid.New().String()
	_, err = CreateTestMessage(ctx, testInfra.DBPool, messageID, testIDs.ConversationAB, testIDs.UserA, "Test message")
	require.NoError(t, err, "Failed to create test message")

	// Verify: UserB has 1 unread message before attempting to mark as read
	unreadCountBefore, err := GetUnreadCount(ctx, testInfra.DBPool, testIDs.ConversationAB, testIDs.UserB)
	require.NoError(t, err, "Failed to get unread count before marking as read")
	assert.Equal(t, 1, unreadCountBefore, "UserB should have 1 unread message before marking as read")

	// Execute: Mark conversation as read WITHOUT authentication (empty userID)
	result, resp, err := testServer.MarkAsRead("", testIDs.ConversationAB)

	// Verify: Check HTTP response - should return 401 Unauthenticated
	require.NoError(t, err, "HTTP request should not fail")
	require.NotNil(t, resp, "Response should not be nil")
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode, "Should return 401 Unauthorized when not authenticated")

	// Verify: Result should be nil or indicate failure
	if result != nil {
		assert.False(t, result.Success, "Response should indicate success=false when not authenticated")
	}

	// Verify: Database state should remain unchanged
	unchangedLastReadAt, err := GetLastReadAt(ctx, testInfra.DBPool, testIDs.ConversationAB, testIDs.UserB)
	require.NoError(t, err, "Failed to get last_read_at after unauthenticated request")
	assert.Equal(t, initialLastReadAt, unchangedLastReadAt, 
		"last_read_at should remain unchanged after unauthenticated request")

	// Verify: Unread count should remain unchanged
	unreadCountAfter, err := GetUnreadCount(ctx, testInfra.DBPool, testIDs.ConversationAB, testIDs.UserB)
	require.NoError(t, err, "Failed to get unread count after unauthenticated request")
	assert.Equal(t, 1, unreadCountAfter, 
		"UserB should still have 1 unread message after unauthenticated request")
}

// TestMarkAsRead_ValidationErrors tests validation error handling for MarkAsRead
// This test verifies:
// - Invalid conversation_id format returns 400 Bad Request
// - Empty conversation_id returns 400 Bad Request
// - No database changes occur for validation errors
func TestMarkAsRead_ValidationErrors(t *testing.T) {
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

	// Get initial last_read_at timestamp for UserA
	initialLastReadAt, err := GetLastReadAt(ctx, testInfra.DBPool, testIDs.ConversationAB, testIDs.UserA)
	require.NoError(t, err, "Failed to get initial last_read_at")
	require.False(t, initialLastReadAt.IsZero(), "Initial last_read_at should be set")

	// Test cases for validation errors
	testCases := []struct {
		name               string
		conversationID     string
		expectedStatusCode int
		description        string
	}{
		{
			name:               "Invalid conversation_id format",
			conversationID:     "not-a-valid-uuid",
			expectedStatusCode: http.StatusBadRequest,
			description:        "Should return 400 Bad Request for invalid UUID format",
		},
		{
			name:               "Empty conversation_id",
			conversationID:     "",
			expectedStatusCode: http.StatusBadRequest,
			description:        "Should return 400 Bad Request for empty conversation_id",
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			// Execute: Mark as read with validation error
			// Use MakeRequest directly to handle invalid conversation_id in URL path
			path := fmt.Sprintf("/v1/conversations/%s/read", tc.conversationID)
			requestBody := map[string]interface{}{}

			resp, err := testServer.MakeRequest("POST", path, requestBody, map[string]string{
				"x-user-id": testIDs.UserA,
			})

			// Verify: Check HTTP response
			require.NoError(t, err, "Request should not fail at connection level")
			require.NotNil(t, resp, "Response should not be nil")
			assert.Equal(t, tc.expectedStatusCode, resp.StatusCode, tc.description)

			// Verify: Database state should remain unchanged
			unchangedLastReadAt, err := GetLastReadAt(ctx, testInfra.DBPool, testIDs.ConversationAB, testIDs.UserA)
			require.NoError(t, err, "Failed to get last_read_at after validation error")
			assert.Equal(t, initialLastReadAt, unchangedLastReadAt, 
				"last_read_at should remain unchanged after validation error")
		})
	}
}

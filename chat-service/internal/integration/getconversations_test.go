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

// TestGetConversations_Success tests the complete GetConversations flow
// This test verifies:
// - User with 3 conversations can retrieve all of them
// - Response contains all 3 conversations
// - Each conversation has last_message_content and last_message_at
// - Conversations are returned in correct order (by last_message_at descending)
func TestGetConversations_Success(t *testing.T) {
	t.Parallel() // Safe to run in parallel - uses unique UUIDs
	ctx := context.Background()

	// Setup: Generate test IDs for users and conversations
	testIDs := GenerateTestIDs()

	// Create 3 conversations for UserA with different users
	// Conversation 1: UserA and UserB
	_, err := CreateTestConversation(ctx, testInfra.DBPool, testIDs.ConversationAB, []string{testIDs.UserA, testIDs.UserB})
	require.NoError(t, err, "Failed to create conversation AB")

	// Conversation 2: UserA and UserC
	_, err = CreateTestConversation(ctx, testInfra.DBPool, testIDs.ConversationAC, []string{testIDs.UserA, testIDs.UserC})
	require.NoError(t, err, "Failed to create conversation AC")

	// Conversation 3: UserA, UserB, and UserC (group conversation)
	conversationABC := uuid.New().String()
	_, err = CreateTestConversation(ctx, testInfra.DBPool, conversationABC, []string{testIDs.UserA, testIDs.UserB, testIDs.UserC})
	require.NoError(t, err, "Failed to create conversation ABC")

	// Cleanup test data after test completes
	defer func() {
		err := CleanupConversations(ctx, testInfra.DBPool, []string{
			testIDs.ConversationAB,
			testIDs.ConversationAC,
			conversationABC,
		})
		if err != nil {
			t.Logf("Warning: Failed to cleanup conversations: %v", err)
		}
	}()

	// Add messages to each conversation with different timestamps
	// This ensures we can verify last_message_content and last_message_at
	
	// Message 1: In ConversationAB (oldest)
	time.Sleep(10 * time.Millisecond)
	msg1ID := uuid.New().String()
	msg1Content := "Hello from UserB in conversation AB"
	_, err = CreateTestMessage(ctx, testInfra.DBPool, msg1ID, testIDs.ConversationAB, testIDs.UserB, msg1Content)
	require.NoError(t, err, "Failed to create message 1")

	// Message 2: In ConversationAC (middle)
	time.Sleep(10 * time.Millisecond)
	msg2ID := uuid.New().String()
	msg2Content := "Hello from UserC in conversation AC"
	_, err = CreateTestMessage(ctx, testInfra.DBPool, msg2ID, testIDs.ConversationAC, testIDs.UserC, msg2Content)
	require.NoError(t, err, "Failed to create message 2")

	// Message 3: In ConversationABC (newest)
	time.Sleep(10 * time.Millisecond)
	msg3ID := uuid.New().String()
	msg3Content := "Hello from UserA in group conversation"
	_, err = CreateTestMessage(ctx, testInfra.DBPool, msg3ID, conversationABC, testIDs.UserA, msg3Content)
	require.NoError(t, err, "Failed to create message 3")

	// Execute: Get conversations for UserA via HTTP GET
	result, resp, err := testServer.GetConversations(testIDs.UserA, 0, "")

	// Verify: Check HTTP response
	require.NoError(t, err, "Failed to get conversations")
	require.NotNil(t, resp, "Response should not be nil")
	assert.Equal(t, http.StatusOK, resp.StatusCode, "Should return 200 OK")

	// Verify: Check response body
	require.NotNil(t, result, "Result should not be nil")
	require.NotNil(t, result.Conversations, "Conversations array should not be nil")

	// Verify: All 3 conversations returned
	assert.Equal(t, 3, len(result.Conversations), "Should return all 3 conversations for UserA")

	// Verify: Conversations are ordered by last_message_at descending (newest first)
	// ConversationABC should be first (newest message)
	// ConversationAC should be second
	// ConversationAB should be third (oldest message)
	assert.Equal(t, conversationABC, result.Conversations[0].ID, "First conversation should be ABC (newest message)")
	assert.Equal(t, testIDs.ConversationAC, result.Conversations[1].ID, "Second conversation should be AC")
	assert.Equal(t, testIDs.ConversationAB, result.Conversations[2].ID, "Third conversation should be AB (oldest message)")

	// Verify: Each conversation has last_message_content and last_message_at
	for i, conv := range result.Conversations {
		assert.NotEmpty(t, conv.ID, "Conversation %d should have an ID", i)
		assert.NotEmpty(t, conv.LastMessageContent, "Conversation %d should have last_message_content", i)
		assert.NotEmpty(t, conv.LastMessageAt, "Conversation %d should have last_message_at", i)
	}

	// Verify: Specific last_message_content for each conversation
	assert.Equal(t, msg3Content, result.Conversations[0].LastMessageContent, 
		"ConversationABC should have correct last_message_content")
	assert.Equal(t, msg2Content, result.Conversations[1].LastMessageContent, 
		"ConversationAC should have correct last_message_content")
	assert.Equal(t, msg1Content, result.Conversations[2].LastMessageContent, 
		"ConversationAB should have correct last_message_content")

	// Verify: last_message_at timestamps are in descending order
	// Parse timestamps and verify ordering
	time1, err := time.Parse(time.RFC3339Nano, result.Conversations[0].LastMessageAt)
	require.NoError(t, err, "Should be able to parse first conversation's last_message_at")
	
	time2, err := time.Parse(time.RFC3339Nano, result.Conversations[1].LastMessageAt)
	require.NoError(t, err, "Should be able to parse second conversation's last_message_at")
	
	time3, err := time.Parse(time.RFC3339Nano, result.Conversations[2].LastMessageAt)
	require.NoError(t, err, "Should be able to parse third conversation's last_message_at")

	assert.True(t, time1.After(time2) || time1.Equal(time2), 
		"First conversation should have newer or equal last_message_at than second")
	assert.True(t, time2.After(time3) || time2.Equal(time3), 
		"Second conversation should have newer or equal last_message_at than third")
}

// TestGetConversations_UnreadCount tests the unread count functionality
// This test verifies:
// - Conversation with 5 messages shows correct unread count
// - After marking 2 messages as read, unread_count=3
// - After marking all as read, unread_count=0
// - Unread count updates correctly after marking messages as read
func TestGetConversations_UnreadCount(t *testing.T) {
	t.Parallel() // Safe to run in parallel - uses unique UUIDs
	ctx := context.Background()

	// Setup: Generate test IDs
	testIDs := GenerateTestIDs()

	// Create conversation with UserA and UserB
	_, err := CreateTestConversation(ctx, testInfra.DBPool, testIDs.ConversationAB, []string{testIDs.UserA, testIDs.UserB})
	require.NoError(t, err, "Failed to create conversation")

	// Cleanup test data after test completes
	defer func() {
		err := CleanupConversations(ctx, testInfra.DBPool, []string{testIDs.ConversationAB})
		if err != nil {
			t.Logf("Warning: Failed to cleanup conversations: %v", err)
		}
	}()

	// Create 5 messages in the conversation from UserB
	messages, err := CreateMultipleTestMessages(ctx, testInfra.DBPool, testIDs.ConversationAB, testIDs.UserB, 5)
	require.NoError(t, err, "Failed to create test messages")
	require.Len(t, messages, 5, "Should have created 5 messages")

	// Execute: Get conversations for UserA (should see 5 unread messages)
	result, resp, err := testServer.GetConversations(testIDs.UserA, 0, "")
	require.NoError(t, err, "Failed to get conversations")
	require.NotNil(t, resp, "Response should not be nil")
	assert.Equal(t, http.StatusOK, resp.StatusCode, "Should return 200 OK")

	// Verify: Check unread count is 5
	require.NotNil(t, result, "Result should not be nil")
	require.NotNil(t, result.Conversations, "Conversations array should not be nil")
	require.Equal(t, 1, len(result.Conversations), "Should return 1 conversation")
	assert.Equal(t, int32(5), result.Conversations[0].UnreadCount, "Should have 5 unread messages")

	// Verify using database helper
	unreadCount, err := GetUnreadCount(ctx, testInfra.DBPool, testIDs.ConversationAB, testIDs.UserA)
	require.NoError(t, err, "Failed to get unread count from database")
	assert.Equal(t, 5, unreadCount, "Database should show 5 unread messages")

	// Mark 2 messages as read by updating last_read_at to the timestamp of the 2nd message
	// This will mark messages 0 and 1 as read, leaving 3 unread
	secondMessageTime := messages[1].CreatedAt
	_, err = testInfra.DBPool.Exec(ctx, `
		UPDATE conversation_participants
		SET last_read_at = $1
		WHERE conversation_id = $2 AND user_id = $3
	`, secondMessageTime, testIDs.ConversationAB, testIDs.UserA)
	require.NoError(t, err, "Failed to update last_read_at")

	// Execute: Get conversations again (should see 3 unread messages)
	result, resp, err = testServer.GetConversations(testIDs.UserA, 0, "")
	require.NoError(t, err, "Failed to get conversations")
	require.NotNil(t, resp, "Response should not be nil")
	assert.Equal(t, http.StatusOK, resp.StatusCode, "Should return 200 OK")

	// Verify: Check unread count is 3
	require.NotNil(t, result, "Result should not be nil")
	require.NotNil(t, result.Conversations, "Conversations array should not be nil")
	require.Equal(t, 1, len(result.Conversations), "Should return 1 conversation")
	assert.Equal(t, int32(3), result.Conversations[0].UnreadCount, "Should have 3 unread messages after marking 2 as read")

	// Verify using database helper
	unreadCount, err = GetUnreadCount(ctx, testInfra.DBPool, testIDs.ConversationAB, testIDs.UserA)
	require.NoError(t, err, "Failed to get unread count from database")
	assert.Equal(t, 3, unreadCount, "Database should show 3 unread messages")

	// Mark all messages as read using the MarkAsRead API
	markAsReadResult, markAsReadResp, err := testServer.MarkAsRead(testIDs.UserA, testIDs.ConversationAB)
	require.NoError(t, err, "Failed to mark as read")
	require.NotNil(t, markAsReadResp, "MarkAsRead response should not be nil")
	assert.Equal(t, http.StatusOK, markAsReadResp.StatusCode, "MarkAsRead should return 200 OK")
	require.NotNil(t, markAsReadResult, "MarkAsRead result should not be nil")
	assert.True(t, markAsReadResult.Success, "MarkAsRead should return success=true")

	// Execute: Get conversations again (should see 0 unread messages)
	result, resp, err = testServer.GetConversations(testIDs.UserA, 0, "")
	require.NoError(t, err, "Failed to get conversations")
	require.NotNil(t, resp, "Response should not be nil")
	assert.Equal(t, http.StatusOK, resp.StatusCode, "Should return 200 OK")

	// Verify: Check unread count is 0
	require.NotNil(t, result, "Result should not be nil")
	require.NotNil(t, result.Conversations, "Conversations array should not be nil")
	require.Equal(t, 1, len(result.Conversations), "Should return 1 conversation")
	assert.Equal(t, int32(0), result.Conversations[0].UnreadCount, "Should have 0 unread messages after marking all as read")

	// Verify using database helper
	unreadCount, err = GetUnreadCount(ctx, testInfra.DBPool, testIDs.ConversationAB, testIDs.UserA)
	require.NoError(t, err, "Failed to get unread count from database")
	assert.Equal(t, 0, unreadCount, "Database should show 0 unread messages")
}

// TestGetConversations_OnlyUserConversations tests that users only see their own conversations
// This test verifies:
// - User A has private conversations that User B cannot see
// - User B has private conversations that User A cannot see
// - Both users can see shared conversations they participate in
// - GetConversations properly filters by participant
func TestGetConversations_OnlyUserConversations(t *testing.T) {
	t.Parallel() // Safe to run in parallel - uses unique UUIDs
	ctx := context.Background()

	// Setup: Generate test IDs
	testIDs := GenerateTestIDs()

	// Create User A's private conversation (UserA and UserC only)
	conversationAC := uuid.New().String()
	_, err := CreateTestConversation(ctx, testInfra.DBPool, conversationAC, []string{testIDs.UserA, testIDs.UserC})
	require.NoError(t, err, "Failed to create User A's private conversation")

	// Create User B's private conversation (UserB and UserC only)
	conversationBC := uuid.New().String()
	_, err = CreateTestConversation(ctx, testInfra.DBPool, conversationBC, []string{testIDs.UserB, testIDs.UserC})
	require.NoError(t, err, "Failed to create User B's private conversation")

	// Create shared conversation (UserA and UserB)
	conversationAB := uuid.New().String()
	_, err = CreateTestConversation(ctx, testInfra.DBPool, conversationAB, []string{testIDs.UserA, testIDs.UserB})
	require.NoError(t, err, "Failed to create shared conversation")

	// Cleanup test data after test completes
	defer func() {
		err := CleanupConversations(ctx, testInfra.DBPool, []string{
			conversationAC,
			conversationBC,
			conversationAB,
		})
		if err != nil {
			t.Logf("Warning: Failed to cleanup conversations: %v", err)
		}
	}()

	// Add messages to each conversation to ensure they appear in results
	// Message in User A's private conversation
	msgAC := uuid.New().String()
	_, err = CreateTestMessage(ctx, testInfra.DBPool, msgAC, conversationAC, testIDs.UserA, "Private message from A to C")
	require.NoError(t, err, "Failed to create message in conversation AC")

	time.Sleep(10 * time.Millisecond)

	// Message in User B's private conversation
	msgBC := uuid.New().String()
	_, err = CreateTestMessage(ctx, testInfra.DBPool, msgBC, conversationBC, testIDs.UserB, "Private message from B to C")
	require.NoError(t, err, "Failed to create message in conversation BC")

	time.Sleep(10 * time.Millisecond)

	// Message in shared conversation
	msgAB := uuid.New().String()
	_, err = CreateTestMessage(ctx, testInfra.DBPool, msgAB, conversationAB, testIDs.UserA, "Shared message from A to B")
	require.NoError(t, err, "Failed to create message in conversation AB")

	// Execute: Get conversations for User A
	resultA, respA, err := testServer.GetConversations(testIDs.UserA, 0, "")
	require.NoError(t, err, "Failed to get conversations for User A")
	require.NotNil(t, respA, "Response for User A should not be nil")
	assert.Equal(t, http.StatusOK, respA.StatusCode, "Should return 200 OK for User A")

	// Verify: User A should see 2 conversations (AC and AB)
	require.NotNil(t, resultA, "Result for User A should not be nil")
	require.NotNil(t, resultA.Conversations, "Conversations array for User A should not be nil")
	assert.Equal(t, 2, len(resultA.Conversations), "User A should see 2 conversations (AC and AB)")

	// Verify: User A's conversations include AC and AB, but not BC
	conversationIDsA := make(map[string]bool)
	for _, conv := range resultA.Conversations {
		conversationIDsA[conv.ID] = true
	}
	assert.True(t, conversationIDsA[conversationAC], "User A should see conversation AC")
	assert.True(t, conversationIDsA[conversationAB], "User A should see shared conversation AB")
	assert.False(t, conversationIDsA[conversationBC], "User A should NOT see User B's private conversation BC")

	// Execute: Get conversations for User B
	resultB, respB, err := testServer.GetConversations(testIDs.UserB, 0, "")
	require.NoError(t, err, "Failed to get conversations for User B")
	require.NotNil(t, respB, "Response for User B should not be nil")
	assert.Equal(t, http.StatusOK, respB.StatusCode, "Should return 200 OK for User B")

	// Verify: User B should see 2 conversations (BC and AB)
	require.NotNil(t, resultB, "Result for User B should not be nil")
	require.NotNil(t, resultB.Conversations, "Conversations array for User B should not be nil")
	assert.Equal(t, 2, len(resultB.Conversations), "User B should see 2 conversations (BC and AB)")

	// Verify: User B's conversations include BC and AB, but not AC
	conversationIDsB := make(map[string]bool)
	for _, conv := range resultB.Conversations {
		conversationIDsB[conv.ID] = true
	}
	assert.True(t, conversationIDsB[conversationBC], "User B should see conversation BC")
	assert.True(t, conversationIDsB[conversationAB], "User B should see shared conversation AB")
	assert.False(t, conversationIDsB[conversationAC], "User B should NOT see User A's private conversation AC")

	// Verify: Both users see the shared conversation AB
	assert.True(t, conversationIDsA[conversationAB] && conversationIDsB[conversationAB], 
		"Both User A and User B should see the shared conversation AB")
}

// TestGetConversations_Pagination tests the pagination functionality for GetConversations
// This test verifies:
// - User with 10 conversations can retrieve them in pages
// - First request with limit=3 returns 3 conversations and a next_cursor
// - Second request with cursor returns the next 3 conversations
// - Conversations are returned in correct order (by last_message_at descending)
// - Pagination cursor works correctly
func TestGetConversations_Pagination(t *testing.T) {
	t.Parallel() // Safe to run in parallel - uses unique UUIDs
	ctx := context.Background()

	// Setup: Generate test IDs
	testIDs := GenerateTestIDs()

	// Create 10 conversations for UserA with different timestamps
	conversationIDs := make([]string, 10)
	for i := 0; i < 10; i++ {
		conversationIDs[i] = uuid.New().String()
		
		// Create conversation with UserA and UserB
		_, err := CreateTestConversation(ctx, testInfra.DBPool, conversationIDs[i], []string{testIDs.UserA, testIDs.UserB})
		require.NoError(t, err, "Failed to create conversation %d", i)
		
		// Add a message to each conversation with increasing timestamps
		// This ensures conversations are ordered by last_message_at
		time.Sleep(10 * time.Millisecond)
		messageID := uuid.New().String()
		messageContent := fmt.Sprintf("Message in conversation %d", i)
		_, err = CreateTestMessage(ctx, testInfra.DBPool, messageID, conversationIDs[i], testIDs.UserB, messageContent)
		require.NoError(t, err, "Failed to create message for conversation %d", i)
	}

	// Cleanup test data after test completes
	defer func() {
		err := CleanupConversations(ctx, testInfra.DBPool, conversationIDs)
		if err != nil {
			t.Logf("Warning: Failed to cleanup conversations: %v", err)
		}
	}()

	// Execute: Get first page of conversations with limit=3
	result1, resp1, err := testServer.GetConversations(testIDs.UserA, 3, "")
	require.NoError(t, err, "Failed to get first page of conversations")
	require.NotNil(t, resp1, "First response should not be nil")
	assert.Equal(t, http.StatusOK, resp1.StatusCode, "First request should return 200 OK")

	// Verify: First page has 3 conversations
	require.NotNil(t, result1, "First result should not be nil")
	require.NotNil(t, result1.Conversations, "First conversations array should not be nil")
	assert.Equal(t, 3, len(result1.Conversations), "First page should return 3 conversations")

	// Verify: next_cursor is present for pagination
	assert.NotEmpty(t, result1.NextCursor, "First page should have next_cursor for pagination")

	// Verify: Conversations are ordered by last_message_at descending (newest first)
	// The last conversation created (index 9) should be first
	assert.Equal(t, conversationIDs[9], result1.Conversations[0].ID, "First conversation should be the newest (index 9)")
	assert.Equal(t, conversationIDs[8], result1.Conversations[1].ID, "Second conversation should be index 8")
	assert.Equal(t, conversationIDs[7], result1.Conversations[2].ID, "Third conversation should be index 7")

	// Verify: Each conversation has required fields
	for i, conv := range result1.Conversations {
		assert.NotEmpty(t, conv.ID, "Conversation %d should have an ID", i)
		assert.NotEmpty(t, conv.LastMessageContent, "Conversation %d should have last_message_content", i)
		assert.NotEmpty(t, conv.LastMessageAt, "Conversation %d should have last_message_at", i)
	}

	// Execute: Get second page using the cursor from first page
	result2, resp2, err := testServer.GetConversations(testIDs.UserA, 3, result1.NextCursor)
	require.NoError(t, err, "Failed to get second page of conversations")
	require.NotNil(t, resp2, "Second response should not be nil")
	assert.Equal(t, http.StatusOK, resp2.StatusCode, "Second request should return 200 OK")

	// Verify: Second page has 3 conversations
	require.NotNil(t, result2, "Second result should not be nil")
	require.NotNil(t, result2.Conversations, "Second conversations array should not be nil")
	assert.Equal(t, 3, len(result2.Conversations), "Second page should return 3 conversations")

	// Verify: Second page has next_cursor (since there are more conversations)
	assert.NotEmpty(t, result2.NextCursor, "Second page should have next_cursor since there are more conversations")

	// Verify: Second page has correct conversations (index 6, 5, 4)
	assert.Equal(t, conversationIDs[6], result2.Conversations[0].ID, "First conversation on second page should be index 6")
	assert.Equal(t, conversationIDs[5], result2.Conversations[1].ID, "Second conversation on second page should be index 5")
	assert.Equal(t, conversationIDs[4], result2.Conversations[2].ID, "Third conversation on second page should be index 4")

	// Verify: No overlap between first and second page
	firstPageIDs := make(map[string]bool)
	for _, conv := range result1.Conversations {
		firstPageIDs[conv.ID] = true
	}
	for _, conv := range result2.Conversations {
		assert.False(t, firstPageIDs[conv.ID], "Second page should not contain conversations from first page")
	}

	// Execute: Get third page to verify pagination continues
	result3, resp3, err := testServer.GetConversations(testIDs.UserA, 3, result2.NextCursor)
	require.NoError(t, err, "Failed to get third page of conversations")
	require.NotNil(t, resp3, "Third response should not be nil")
	assert.Equal(t, http.StatusOK, resp3.StatusCode, "Third request should return 200 OK")

	// Verify: Third page has 3 conversations
	require.NotNil(t, result3, "Third result should not be nil")
	require.NotNil(t, result3.Conversations, "Third conversations array should not be nil")
	assert.Equal(t, 3, len(result3.Conversations), "Third page should return 3 conversations")

	// Verify: Third page has correct conversations (index 3, 2, 1)
	assert.Equal(t, conversationIDs[3], result3.Conversations[0].ID, "First conversation on third page should be index 3")
	assert.Equal(t, conversationIDs[2], result3.Conversations[1].ID, "Second conversation on third page should be index 2")
	assert.Equal(t, conversationIDs[1], result3.Conversations[2].ID, "Third conversation on third page should be index 1")

	// Execute: Get fourth page (should have 1 conversation remaining)
	result4, resp4, err := testServer.GetConversations(testIDs.UserA, 3, result3.NextCursor)
	require.NoError(t, err, "Failed to get fourth page of conversations")
	require.NotNil(t, resp4, "Fourth response should not be nil")
	assert.Equal(t, http.StatusOK, resp4.StatusCode, "Fourth request should return 200 OK")

	// Verify: Fourth page has 1 conversation (the last one)
	require.NotNil(t, result4, "Fourth result should not be nil")
	require.NotNil(t, result4.Conversations, "Fourth conversations array should not be nil")
	assert.Equal(t, 1, len(result4.Conversations), "Fourth page should return 1 conversation (the last one)")

	// Verify: Fourth page has the oldest conversation (index 0)
	assert.Equal(t, conversationIDs[0], result4.Conversations[0].ID, "Fourth page should have the oldest conversation (index 0)")

	// Note: The API may return a next_cursor even on the last page (based on the last item's timestamp)
	// This is acceptable behavior - the cursor would return an empty result if used

	// Verify: All 10 conversations were returned across all pages
	allConversationIDs := make(map[string]bool)
	for _, conv := range result1.Conversations {
		allConversationIDs[conv.ID] = true
	}
	for _, conv := range result2.Conversations {
		allConversationIDs[conv.ID] = true
	}
	for _, conv := range result3.Conversations {
		allConversationIDs[conv.ID] = true
	}
	for _, conv := range result4.Conversations {
		allConversationIDs[conv.ID] = true
	}
	assert.Equal(t, 10, len(allConversationIDs), "All 10 conversations should be returned across all pages")

	// Verify: All created conversations are in the results
	for i, convID := range conversationIDs {
		assert.True(t, allConversationIDs[convID], "Conversation %d should be in the results", i)
	}
}

// TestGetConversations_Unauthenticated tests that GetConversations requires authentication
// This test verifies:
// - GetConversations without x-user-id header returns 401 Unauthenticated error
// - No conversations are returned without authentication
func TestGetConversations_Unauthenticated(t *testing.T) {
	t.Parallel() // Safe to run in parallel - no database setup needed
	// Execute: Get conversations without x-user-id header
	// Pass empty string as userID to simulate missing authentication header
	result, resp, err := testServer.GetConversations("", 0, "")

	// Verify: Should return 401 Unauthenticated error
	require.NoError(t, err, "HTTP request should not fail")
	require.NotNil(t, resp, "Response should not be nil")
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode, "Should return 401 Unauthorized when x-user-id header is missing")

	// Verify: Result should be nil or empty since authentication failed
	if result != nil && result.Conversations != nil {
		assert.Empty(t, result.Conversations, "Should not return any conversations without authentication")
	}
}

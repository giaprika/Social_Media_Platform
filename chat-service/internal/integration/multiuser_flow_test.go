package integration

import (
	"context"
	"fmt"
	"net/http"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestMultiUserConversation_CompleteFlow tests a complete multi-user conversation flow
// This test verifies:
// - User A sends message to conversation
// - User B retrieves messages and sees User A's message
// - User B sends reply
// - User A retrieves messages and sees both messages
// - Both users get their conversations list
// - Conversation appears for both users
// - Participant tracking in conversation_participants table
func TestMultiUserConversation_CompleteFlow(t *testing.T) {
	t.Parallel() // Safe to run in parallel - uses unique UUIDs
	ctx := context.Background()

	// Setup: Generate test IDs for User A and User B
	testIDs := GenerateTestIDs()

	// Create test conversation with both users as participants
	_, err := CreateTestConversation(ctx, testInfra.DBPool, testIDs.ConversationAB, []string{testIDs.UserA, testIDs.UserB})
	require.NoError(t, err, "Failed to create test conversation")

	// Cleanup test data after test completes
	defer func() {
		err := CleanupConversation(ctx, testInfra.DBPool, testIDs.ConversationAB)
		if err != nil {
			t.Logf("Warning: Failed to cleanup conversation: %v", err)
		}
	}()

	// Step 1: User A sends message to conversation
	messageContentA := "Hello from User A!"
	idempotencyKeyA := "test-multiuser-a-" + uuid.New().String()

	resultA, respA, err := testServer.SendMessage(testIDs.UserA, testIDs.ConversationAB, messageContentA, idempotencyKeyA)

	// Verify: User A's message sent successfully
	require.NoError(t, err, "User A should be able to send message")
	require.NotNil(t, respA, "Response should not be nil")
	assert.Equal(t, http.StatusOK, respA.StatusCode, "User A's message should return 200 OK")
	require.NotNil(t, resultA, "Result should not be nil")
	assert.NotEmpty(t, resultA.MessageID, "User A's message should have message_id")
	assert.Equal(t, "SENT", resultA.Status, "User A's message status should be SENT")

	// Verify: User A's message exists in database
	AssertMessageExists(t, testInfra.DBPool, resultA.MessageID)

	// Step 2: User B retrieves messages and sees User A's message
	messagesB1, respB1, err := testServer.GetMessages(testIDs.UserB, testIDs.ConversationAB, 50, "")

	// Verify: User B can retrieve messages
	require.NoError(t, err, "User B should be able to retrieve messages")
	require.NotNil(t, respB1, "Response should not be nil")
	assert.Equal(t, http.StatusOK, respB1.StatusCode, "User B's GetMessages should return 200 OK")
	require.NotNil(t, messagesB1, "Messages result should not be nil")

	// Verify: User B sees User A's message
	require.Len(t, messagesB1.Messages, 1, "User B should see 1 message")
	assert.Equal(t, resultA.MessageID, messagesB1.Messages[0].ID, "User B should see User A's message")
	assert.Equal(t, testIDs.UserA, messagesB1.Messages[0].SenderID, "Message should be from User A")
	assert.Equal(t, messageContentA, messagesB1.Messages[0].Content, "Message content should match")
	assert.Equal(t, testIDs.ConversationAB, messagesB1.Messages[0].ConversationID, "Message should belong to correct conversation")

	// Step 3: User B sends reply
	messageContentB := "Hello from User B! Nice to hear from you."
	idempotencyKeyB := "test-multiuser-b-" + uuid.New().String()

	resultB, respB2, err := testServer.SendMessage(testIDs.UserB, testIDs.ConversationAB, messageContentB, idempotencyKeyB)

	// Verify: User B's message sent successfully
	require.NoError(t, err, "User B should be able to send message")
	require.NotNil(t, respB2, "Response should not be nil")
	assert.Equal(t, http.StatusOK, respB2.StatusCode, "User B's message should return 200 OK")
	require.NotNil(t, resultB, "Result should not be nil")
	assert.NotEmpty(t, resultB.MessageID, "User B's message should have message_id")
	assert.Equal(t, "SENT", resultB.Status, "User B's message status should be SENT")

	// Verify: User B's message exists in database
	AssertMessageExists(t, testInfra.DBPool, resultB.MessageID)

	// Step 4: User A retrieves messages and sees both messages
	messagesA, respA2, err := testServer.GetMessages(testIDs.UserA, testIDs.ConversationAB, 50, "")

	// Verify: User A can retrieve messages
	require.NoError(t, err, "User A should be able to retrieve messages")
	require.NotNil(t, respA2, "Response should not be nil")
	assert.Equal(t, http.StatusOK, respA2.StatusCode, "User A's GetMessages should return 200 OK")
	require.NotNil(t, messagesA, "Messages result should not be nil")

	// Verify: User A sees both messages (in descending order by created_at)
	require.Len(t, messagesA.Messages, 2, "User A should see 2 messages")

	// Messages are returned in descending order (newest first)
	// So User B's message should be first, User A's message should be second
	assert.Equal(t, resultB.MessageID, messagesA.Messages[0].ID, "First message should be User B's message (newest)")
	assert.Equal(t, testIDs.UserB, messagesA.Messages[0].SenderID, "First message should be from User B")
	assert.Equal(t, messageContentB, messagesA.Messages[0].Content, "First message content should match User B's message")

	assert.Equal(t, resultA.MessageID, messagesA.Messages[1].ID, "Second message should be User A's message (oldest)")
	assert.Equal(t, testIDs.UserA, messagesA.Messages[1].SenderID, "Second message should be from User A")
	assert.Equal(t, messageContentA, messagesA.Messages[1].Content, "Second message content should match User A's message")

	// Step 5: Both users get their conversations list
	// User A gets conversations
	conversationsA, respConvA, err := testServer.GetConversations(testIDs.UserA, 50, "")

	// Verify: User A can retrieve conversations
	require.NoError(t, err, "User A should be able to retrieve conversations")
	require.NotNil(t, respConvA, "Response should not be nil")
	assert.Equal(t, http.StatusOK, respConvA.StatusCode, "User A's GetConversations should return 200 OK")
	require.NotNil(t, conversationsA, "Conversations result should not be nil")

	// Verify: Conversation appears for User A
	require.GreaterOrEqual(t, len(conversationsA.Conversations), 1, "User A should have at least 1 conversation")
	
	// Find the test conversation in User A's list
	var foundConvA bool
	var convA *Conversation
	for i := range conversationsA.Conversations {
		if conversationsA.Conversations[i].ID == testIDs.ConversationAB {
			foundConvA = true
			convA = &conversationsA.Conversations[i]
			break
		}
	}
	assert.True(t, foundConvA, "User A should see the conversation in their list")
	require.NotNil(t, convA, "Conversation should be found for User A")

	// Verify: Conversation has correct last message (User B's message)
	assert.Equal(t, messageContentB, convA.LastMessageContent, "User A should see User B's message as last message")
	assert.NotEmpty(t, convA.LastMessageAt, "Last message timestamp should be set")

	// User B gets conversations
	conversationsB, respConvB, err := testServer.GetConversations(testIDs.UserB, 50, "")

	// Verify: User B can retrieve conversations
	require.NoError(t, err, "User B should be able to retrieve conversations")
	require.NotNil(t, respConvB, "Response should not be nil")
	assert.Equal(t, http.StatusOK, respConvB.StatusCode, "User B's GetConversations should return 200 OK")
	require.NotNil(t, conversationsB, "Conversations result should not be nil")

	// Verify: Conversation appears for User B
	require.GreaterOrEqual(t, len(conversationsB.Conversations), 1, "User B should have at least 1 conversation")
	
	// Find the test conversation in User B's list
	var foundConvB bool
	var convB *Conversation
	for i := range conversationsB.Conversations {
		if conversationsB.Conversations[i].ID == testIDs.ConversationAB {
			foundConvB = true
			convB = &conversationsB.Conversations[i]
			break
		}
	}
	assert.True(t, foundConvB, "User B should see the conversation in their list")
	require.NotNil(t, convB, "Conversation should be found for User B")

	// Verify: Conversation has correct last message (User B's message)
	assert.Equal(t, messageContentB, convB.LastMessageContent, "User B should see User B's message as last message")
	assert.NotEmpty(t, convB.LastMessageAt, "Last message timestamp should be set")

	// Step 6: Verify participant tracking in conversation_participants table
	AssertConversationParticipants(t, testInfra.DBPool, testIDs.ConversationAB, []string{testIDs.UserA, testIDs.UserB})

	// Additional verification: Verify both participants have last_read_at set
	// (they were added as participants when the conversation was created)
	lastReadAtA, err := GetLastReadAt(ctx, testInfra.DBPool, testIDs.ConversationAB, testIDs.UserA)
	require.NoError(t, err, "Should be able to get User A's last_read_at")
	assert.False(t, lastReadAtA.IsZero(), "User A should have last_read_at set")

	lastReadAtB, err := GetLastReadAt(ctx, testInfra.DBPool, testIDs.ConversationAB, testIDs.UserB)
	require.NoError(t, err, "Should be able to get User B's last_read_at")
	assert.False(t, lastReadAtB.IsZero(), "User B should have last_read_at set")
}

// TestMultiUserConversation_UnreadCounts tests unread count tracking across multiple users
// This test verifies:
// - User A sends 3 messages to conversation
// - User B gets conversations (verify unread_count=3)
// - User B marks conversation as read
// - User B gets conversations (verify unread_count=0)
// - User A sends another message
// - User B gets conversations (verify unread_count=1)
func TestMultiUserConversation_UnreadCounts(t *testing.T) {
	t.Parallel() // Safe to run in parallel - uses unique UUIDs
	ctx := context.Background()

	// Setup: Generate test IDs for User A and User B
	testIDs := GenerateTestIDs()

	// Create test conversation with both users as participants
	_, err := CreateTestConversation(ctx, testInfra.DBPool, testIDs.ConversationAB, []string{testIDs.UserA, testIDs.UserB})
	require.NoError(t, err, "Failed to create test conversation")

	// Cleanup test data after test completes
	defer func() {
		err := CleanupConversation(ctx, testInfra.DBPool, testIDs.ConversationAB)
		if err != nil {
			t.Logf("Warning: Failed to cleanup conversation: %v", err)
		}
	}()

	// Step 1: User A sends 3 messages to conversation
	var messageIDs []string
	for i := 1; i <= 3; i++ {
		messageContent := fmt.Sprintf("Message %d from User A", i)
		idempotencyKey := fmt.Sprintf("test-unread-%d-%s", i, uuid.New().String())

		result, resp, err := testServer.SendMessage(testIDs.UserA, testIDs.ConversationAB, messageContent, idempotencyKey)

		// Verify: Message sent successfully
		require.NoError(t, err, "User A should be able to send message %d", i)
		require.NotNil(t, resp, "Response should not be nil")
		assert.Equal(t, http.StatusOK, resp.StatusCode, "Message %d should return 200 OK", i)
		require.NotNil(t, result, "Result should not be nil")
		assert.NotEmpty(t, result.MessageID, "Message %d should have message_id", i)

		messageIDs = append(messageIDs, result.MessageID)
	}

	// Step 2: User B gets conversations (verify unread_count=3)
	conversations1, resp1, err := testServer.GetConversations(testIDs.UserB, 50, "")

	// Verify: User B can retrieve conversations
	require.NoError(t, err, "User B should be able to retrieve conversations")
	require.NotNil(t, resp1, "Response should not be nil")
	assert.Equal(t, http.StatusOK, resp1.StatusCode, "GetConversations should return 200 OK")
	require.NotNil(t, conversations1, "Conversations result should not be nil")

	// Find the test conversation in User B's list
	var foundConv1 bool
	var conv1 *Conversation
	for i := range conversations1.Conversations {
		if conversations1.Conversations[i].ID == testIDs.ConversationAB {
			foundConv1 = true
			conv1 = &conversations1.Conversations[i]
			break
		}
	}
	assert.True(t, foundConv1, "User B should see the conversation in their list")
	require.NotNil(t, conv1, "Conversation should be found for User B")

	// Verify: Unread count should be 3
	assert.Equal(t, int32(3), conv1.UnreadCount, "User B should have 3 unread messages")

	// Step 3: User B marks conversation as read
	markReadResult, markReadResp, err := testServer.MarkAsRead(testIDs.UserB, testIDs.ConversationAB)

	// Verify: Mark as read succeeded
	require.NoError(t, err, "User B should be able to mark conversation as read")
	require.NotNil(t, markReadResp, "Response should not be nil")
	assert.Equal(t, http.StatusOK, markReadResp.StatusCode, "MarkAsRead should return 200 OK")
	require.NotNil(t, markReadResult, "Result should not be nil")
	assert.True(t, markReadResult.Success, "MarkAsRead should return success=true")

	// Step 4: User B gets conversations (verify unread_count=0)
	conversations2, resp2, err := testServer.GetConversations(testIDs.UserB, 50, "")

	// Verify: User B can retrieve conversations
	require.NoError(t, err, "User B should be able to retrieve conversations")
	require.NotNil(t, resp2, "Response should not be nil")
	assert.Equal(t, http.StatusOK, resp2.StatusCode, "GetConversations should return 200 OK")
	require.NotNil(t, conversations2, "Conversations result should not be nil")

	// Find the test conversation in User B's list
	var foundConv2 bool
	var conv2 *Conversation
	for i := range conversations2.Conversations {
		if conversations2.Conversations[i].ID == testIDs.ConversationAB {
			foundConv2 = true
			conv2 = &conversations2.Conversations[i]
			break
		}
	}
	assert.True(t, foundConv2, "User B should see the conversation in their list")
	require.NotNil(t, conv2, "Conversation should be found for User B")

	// Verify: Unread count should be 0
	assert.Equal(t, int32(0), conv2.UnreadCount, "User B should have 0 unread messages after marking as read")

	// Step 5: User A sends another message
	messageContent4 := "Message 4 from User A"
	idempotencyKey4 := "test-unread-4-" + uuid.New().String()

	result4, resp4, err := testServer.SendMessage(testIDs.UserA, testIDs.ConversationAB, messageContent4, idempotencyKey4)

	// Verify: Message sent successfully
	require.NoError(t, err, "User A should be able to send message 4")
	require.NotNil(t, resp4, "Response should not be nil")
	assert.Equal(t, http.StatusOK, resp4.StatusCode, "Message 4 should return 200 OK")
	require.NotNil(t, result4, "Result should not be nil")
	assert.NotEmpty(t, result4.MessageID, "Message 4 should have message_id")

	// Step 6: User B gets conversations (verify unread_count=1)
	conversations3, resp3, err := testServer.GetConversations(testIDs.UserB, 50, "")

	// Verify: User B can retrieve conversations
	require.NoError(t, err, "User B should be able to retrieve conversations")
	require.NotNil(t, resp3, "Response should not be nil")
	assert.Equal(t, http.StatusOK, resp3.StatusCode, "GetConversations should return 200 OK")
	require.NotNil(t, conversations3, "Conversations result should not be nil")

	// Find the test conversation in User B's list
	var foundConv3 bool
	var conv3 *Conversation
	for i := range conversations3.Conversations {
		if conversations3.Conversations[i].ID == testIDs.ConversationAB {
			foundConv3 = true
			conv3 = &conversations3.Conversations[i]
			break
		}
	}
	assert.True(t, foundConv3, "User B should see the conversation in their list")
	require.NotNil(t, conv3, "Conversation should be found for User B")

	// Verify: Unread count should be 1
	assert.Equal(t, int32(1), conv3.UnreadCount, "User B should have 1 unread message after User A sends another message")

	// Additional verification: Verify unread count using database helper
	unreadCount, err := GetUnreadCount(ctx, testInfra.DBPool, testIDs.ConversationAB, testIDs.UserB)
	require.NoError(t, err, "Should be able to get unread count from database")
	assert.Equal(t, 1, unreadCount, "Database should show 1 unread message for User B")
}

// TestMultiUserConversation_ParticipantTracking tests participant tracking when users send messages
// This test verifies:
// - Create new conversation (without pre-adding participants)
// - User A sends first message
// - Verify User A added to conversation_participants
// - User B sends message to same conversation
// - Verify User B added to conversation_participants
// - Verify both users see conversation in their lists
func TestMultiUserConversation_ParticipantTracking(t *testing.T) {
	t.Parallel() // Safe to run in parallel - uses unique UUIDs
	ctx := context.Background()

	// Setup: Generate test IDs for User A and User B
	testIDs := GenerateTestIDs()

	// Create test conversation WITHOUT participants initially
	// This simulates a conversation that exists but participants are added dynamically
	_, err := CreateTestConversation(ctx, testInfra.DBPool, testIDs.ConversationAB, []string{})
	require.NoError(t, err, "Failed to create test conversation")

	// Cleanup test data after test completes
	defer func() {
		err := CleanupConversation(ctx, testInfra.DBPool, testIDs.ConversationAB)
		if err != nil {
			t.Logf("Warning: Failed to cleanup conversation: %v", err)
		}
	}()

	// Verify: Initially no participants in the conversation
	AssertConversationParticipants(t, testInfra.DBPool, testIDs.ConversationAB, []string{})

	// Step 1: User A sends first message
	messageContentA := "First message from User A"
	idempotencyKeyA := "test-participant-a-" + uuid.New().String()

	resultA, respA, err := testServer.SendMessage(testIDs.UserA, testIDs.ConversationAB, messageContentA, idempotencyKeyA)

	// Verify: User A's message sent successfully
	require.NoError(t, err, "User A should be able to send message")
	require.NotNil(t, respA, "Response should not be nil")
	assert.Equal(t, http.StatusOK, respA.StatusCode, "User A's message should return 200 OK")
	require.NotNil(t, resultA, "Result should not be nil")
	assert.NotEmpty(t, resultA.MessageID, "User A's message should have message_id")
	assert.Equal(t, "SENT", resultA.Status, "User A's message status should be SENT")

	// Verify: User A's message exists in database
	AssertMessageExists(t, testInfra.DBPool, resultA.MessageID)

	// Step 2: Verify User A added to conversation_participants
	AssertConversationParticipants(t, testInfra.DBPool, testIDs.ConversationAB, []string{testIDs.UserA})

	// Verify User A has last_read_at set (participant was added)
	lastReadAtA, err := GetLastReadAt(ctx, testInfra.DBPool, testIDs.ConversationAB, testIDs.UserA)
	require.NoError(t, err, "Should be able to get User A's last_read_at")
	assert.False(t, lastReadAtA.IsZero(), "User A should have last_read_at set after sending message")

	// Step 3: User B sends message to same conversation
	messageContentB := "Reply from User B"
	idempotencyKeyB := "test-participant-b-" + uuid.New().String()

	resultB, respB, err := testServer.SendMessage(testIDs.UserB, testIDs.ConversationAB, messageContentB, idempotencyKeyB)

	// Verify: User B's message sent successfully
	require.NoError(t, err, "User B should be able to send message")
	require.NotNil(t, respB, "Response should not be nil")
	assert.Equal(t, http.StatusOK, respB.StatusCode, "User B's message should return 200 OK")
	require.NotNil(t, resultB, "Result should not be nil")
	assert.NotEmpty(t, resultB.MessageID, "User B's message should have message_id")
	assert.Equal(t, "SENT", resultB.Status, "User B's message status should be SENT")

	// Verify: User B's message exists in database
	AssertMessageExists(t, testInfra.DBPool, resultB.MessageID)

	// Step 4: Verify User B added to conversation_participants
	AssertConversationParticipants(t, testInfra.DBPool, testIDs.ConversationAB, []string{testIDs.UserA, testIDs.UserB})

	// Verify User B has last_read_at set (participant was added)
	lastReadAtB, err := GetLastReadAt(ctx, testInfra.DBPool, testIDs.ConversationAB, testIDs.UserB)
	require.NoError(t, err, "Should be able to get User B's last_read_at")
	assert.False(t, lastReadAtB.IsZero(), "User B should have last_read_at set after sending message")

	// Step 5: Verify both users see conversation in their lists
	// User A gets conversations
	conversationsA, respConvA, err := testServer.GetConversations(testIDs.UserA, 50, "")

	// Verify: User A can retrieve conversations
	require.NoError(t, err, "User A should be able to retrieve conversations")
	require.NotNil(t, respConvA, "Response should not be nil")
	assert.Equal(t, http.StatusOK, respConvA.StatusCode, "User A's GetConversations should return 200 OK")
	require.NotNil(t, conversationsA, "Conversations result should not be nil")

	// Verify: Conversation appears for User A
	require.GreaterOrEqual(t, len(conversationsA.Conversations), 1, "User A should have at least 1 conversation")
	
	// Find the test conversation in User A's list
	var foundConvA bool
	var convA *Conversation
	for i := range conversationsA.Conversations {
		if conversationsA.Conversations[i].ID == testIDs.ConversationAB {
			foundConvA = true
			convA = &conversationsA.Conversations[i]
			break
		}
	}
	assert.True(t, foundConvA, "User A should see the conversation in their list")
	require.NotNil(t, convA, "Conversation should be found for User A")

	// Verify: Conversation has correct last message (User B's message)
	assert.Equal(t, messageContentB, convA.LastMessageContent, "User A should see User B's message as last message")
	assert.NotEmpty(t, convA.LastMessageAt, "Last message timestamp should be set")

	// User B gets conversations
	conversationsB, respConvB, err := testServer.GetConversations(testIDs.UserB, 50, "")

	// Verify: User B can retrieve conversations
	require.NoError(t, err, "User B should be able to retrieve conversations")
	require.NotNil(t, respConvB, "Response should not be nil")
	assert.Equal(t, http.StatusOK, respConvB.StatusCode, "User B's GetConversations should return 200 OK")
	require.NotNil(t, conversationsB, "Conversations result should not be nil")

	// Verify: Conversation appears for User B
	require.GreaterOrEqual(t, len(conversationsB.Conversations), 1, "User B should have at least 1 conversation")
	
	// Find the test conversation in User B's list
	var foundConvB bool
	var convB *Conversation
	for i := range conversationsB.Conversations {
		if conversationsB.Conversations[i].ID == testIDs.ConversationAB {
			foundConvB = true
			convB = &conversationsB.Conversations[i]
			break
		}
	}
	assert.True(t, foundConvB, "User B should see the conversation in their list")
	require.NotNil(t, convB, "Conversation should be found for User B")

	// Verify: Conversation has correct last message (User B's message)
	assert.Equal(t, messageContentB, convB.LastMessageContent, "User B should see User B's message as last message")
	assert.NotEmpty(t, convB.LastMessageAt, "Last message timestamp should be set")

	// Additional verification: Verify both participants are tracked correctly
	// This is the core of the participant tracking test
	AssertConversationParticipants(t, testInfra.DBPool, testIDs.ConversationAB, []string{testIDs.UserA, testIDs.UserB})
}

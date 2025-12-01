package integration

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestGenerateTestIDs verifies that GenerateTestIDs creates unique UUIDs
func TestGenerateTestIDs(t *testing.T) {
	// Generate test IDs
	ids1 := GenerateTestIDs()
	ids2 := GenerateTestIDs()

	// Verify all IDs are valid UUIDs
	_, err := uuid.Parse(ids1.UserA)
	require.NoError(t, err, "UserA should be a valid UUID")
	
	_, err = uuid.Parse(ids1.UserB)
	require.NoError(t, err, "UserB should be a valid UUID")
	
	_, err = uuid.Parse(ids1.UserC)
	require.NoError(t, err, "UserC should be a valid UUID")
	
	_, err = uuid.Parse(ids1.ConversationAB)
	require.NoError(t, err, "ConversationAB should be a valid UUID")
	
	_, err = uuid.Parse(ids1.ConversationAC)
	require.NoError(t, err, "ConversationAC should be a valid UUID")
	
	_, err = uuid.Parse(ids1.ConversationBC)
	require.NoError(t, err, "ConversationBC should be a valid UUID")

	// Verify IDs are unique within the same set
	uniqueIDs := map[string]bool{
		ids1.UserA:          true,
		ids1.UserB:          true,
		ids1.UserC:          true,
		ids1.ConversationAB: true,
		ids1.ConversationAC: true,
		ids1.ConversationBC: true,
	}
	assert.Equal(t, 6, len(uniqueIDs), "All IDs should be unique within the same set")

	// Verify IDs are different between two calls
	assert.NotEqual(t, ids1.UserA, ids2.UserA, "UserA should be different between calls")
	assert.NotEqual(t, ids1.ConversationAB, ids2.ConversationAB, "ConversationAB should be different between calls")
}

// TestCreateTestUser verifies that CreateTestUser works correctly
func TestCreateTestUser(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Cleanup before test
	err := testInfra.CleanupTestData(ctx)
	require.NoError(t, err, "Failed to cleanup test data")

	// Generate test ID
	userID := uuid.New().String()

	// Create test user
	user, err := CreateTestUser(ctx, testInfra.DBPool, userID)
	require.NoError(t, err, "CreateTestUser should not return an error")
	require.NotNil(t, user, "User should not be nil")
	assert.Equal(t, userID, user.ID, "User ID should match")
}

// TestCreateTestConversation verifies that CreateTestConversation creates a conversation with participants
func TestCreateTestConversation(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Cleanup before test
	err := testInfra.CleanupTestData(ctx)
	require.NoError(t, err, "Failed to cleanup test data")

	// Generate test IDs
	ids := GenerateTestIDs()
	participants := []string{ids.UserA, ids.UserB}

	// Create test conversation
	conversation, err := CreateTestConversation(ctx, testInfra.DBPool, ids.ConversationAB, participants)
	require.NoError(t, err, "CreateTestConversation should not return an error")
	require.NotNil(t, conversation, "Conversation should not be nil")
	assert.Equal(t, ids.ConversationAB, conversation.ID, "Conversation ID should match")
	assert.Equal(t, participants, conversation.Participants, "Participants should match")
	assert.False(t, conversation.CreatedAt.IsZero(), "CreatedAt should be set")

	// Verify conversation exists in database
	var conversationID string
	err = testInfra.DBPool.QueryRow(ctx, `
		SELECT id FROM conversations WHERE id = $1
	`, ids.ConversationAB).Scan(&conversationID)
	require.NoError(t, err, "Conversation should exist in database")
	assert.Equal(t, ids.ConversationAB, conversationID, "Conversation ID should match in database")

	// Verify participants exist in database
	var participantCount int
	err = testInfra.DBPool.QueryRow(ctx, `
		SELECT COUNT(*) FROM conversation_participants WHERE conversation_id = $1
	`, ids.ConversationAB).Scan(&participantCount)
	require.NoError(t, err, "Should be able to count participants")
	assert.Equal(t, 2, participantCount, "Should have 2 participants")

	// Verify each participant
	for _, participantID := range participants {
		var userID string
		err = testInfra.DBPool.QueryRow(ctx, `
			SELECT user_id FROM conversation_participants 
			WHERE conversation_id = $1 AND user_id = $2
		`, ids.ConversationAB, participantID).Scan(&userID)
		require.NoError(t, err, "Participant %s should exist in database", participantID)
		assert.Equal(t, participantID, userID, "Participant ID should match")
	}

	// Cleanup after test
	err = testInfra.CleanupTestData(ctx)
	require.NoError(t, err, "Failed to cleanup test data")
}

// TestCreateTestMessage verifies that CreateTestMessage creates a message and updates conversation
func TestCreateTestMessage(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Cleanup before test
	err := testInfra.CleanupTestData(ctx)
	require.NoError(t, err, "Failed to cleanup test data")

	// Generate test IDs
	ids := GenerateTestIDs()
	participants := []string{ids.UserA, ids.UserB}

	// Create test conversation first
	_, err = CreateTestConversation(ctx, testInfra.DBPool, ids.ConversationAB, participants)
	require.NoError(t, err, "Failed to create test conversation")

	// Create test message
	messageID := uuid.New().String()
	content := "Hello, this is a test message"
	message, err := CreateTestMessage(ctx, testInfra.DBPool, messageID, ids.ConversationAB, ids.UserA, content)
	require.NoError(t, err, "CreateTestMessage should not return an error")
	require.NotNil(t, message, "Message should not be nil")
	assert.Equal(t, messageID, message.ID, "Message ID should match")
	assert.Equal(t, ids.ConversationAB, message.ConversationID, "Conversation ID should match")
	assert.Equal(t, ids.UserA, message.SenderID, "Sender ID should match")
	assert.Equal(t, content, message.Content, "Content should match")
	assert.False(t, message.CreatedAt.IsZero(), "CreatedAt should be set")

	// Verify message exists in database
	var dbMessageID, dbContent string
	err = testInfra.DBPool.QueryRow(ctx, `
		SELECT id, content FROM messages WHERE id = $1
	`, messageID).Scan(&dbMessageID, &dbContent)
	require.NoError(t, err, "Message should exist in database")
	assert.Equal(t, messageID, dbMessageID, "Message ID should match in database")
	assert.Equal(t, content, dbContent, "Content should match in database")

	// Verify conversation was updated with last_message_content and last_message_at
	var lastMessageContent string
	var lastMessageAt time.Time
	err = testInfra.DBPool.QueryRow(ctx, `
		SELECT last_message_content, last_message_at FROM conversations WHERE id = $1
	`, ids.ConversationAB).Scan(&lastMessageContent, &lastMessageAt)
	require.NoError(t, err, "Should be able to query conversation")
	assert.Equal(t, content, lastMessageContent, "Last message content should be updated")
	assert.False(t, lastMessageAt.IsZero(), "Last message at should be set")

	// Cleanup after test
	err = testInfra.CleanupTestData(ctx)
	require.NoError(t, err, "Failed to cleanup test data")
}

// TestCreateTestMessageWithTimestamp verifies that CreateTestMessageWithTimestamp creates a message with specific timestamp
func TestCreateTestMessageWithTimestamp(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Cleanup before test
	err := testInfra.CleanupTestData(ctx)
	require.NoError(t, err, "Failed to cleanup test data")

	// Generate test IDs
	ids := GenerateTestIDs()
	participants := []string{ids.UserA, ids.UserB}

	// Create test conversation first
	_, err = CreateTestConversation(ctx, testInfra.DBPool, ids.ConversationAB, participants)
	require.NoError(t, err, "Failed to create test conversation")

	// Create test message with specific timestamp
	messageID := uuid.New().String()
	content := "Message with specific timestamp"
	specificTime := time.Date(2024, 1, 15, 10, 30, 0, 0, time.UTC)
	
	message, err := CreateTestMessageWithTimestamp(ctx, testInfra.DBPool, messageID, ids.ConversationAB, ids.UserA, content, specificTime)
	require.NoError(t, err, "CreateTestMessageWithTimestamp should not return an error")
	require.NotNil(t, message, "Message should not be nil")
	assert.Equal(t, messageID, message.ID, "Message ID should match")
	assert.Equal(t, specificTime.Unix(), message.CreatedAt.Unix(), "CreatedAt should match specific time")

	// Verify message timestamp in database
	var dbCreatedAt time.Time
	err = testInfra.DBPool.QueryRow(ctx, `
		SELECT created_at FROM messages WHERE id = $1
	`, messageID).Scan(&dbCreatedAt)
	require.NoError(t, err, "Message should exist in database")
	assert.Equal(t, specificTime.Unix(), dbCreatedAt.Unix(), "Timestamp should match in database")

	// Cleanup after test
	err = testInfra.CleanupTestData(ctx)
	require.NoError(t, err, "Failed to cleanup test data")
}

// TestCreateMultipleTestMessages verifies that CreateMultipleTestMessages creates multiple messages
func TestCreateMultipleTestMessages(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Cleanup before test
	err := testInfra.CleanupTestData(ctx)
	require.NoError(t, err, "Failed to cleanup test data")

	// Generate test IDs
	ids := GenerateTestIDs()
	participants := []string{ids.UserA, ids.UserB}

	// Create test conversation first
	_, err = CreateTestConversation(ctx, testInfra.DBPool, ids.ConversationAB, participants)
	require.NoError(t, err, "Failed to create test conversation")

	// Create multiple test messages
	messageCount := 5
	messages, err := CreateMultipleTestMessages(ctx, testInfra.DBPool, ids.ConversationAB, ids.UserA, messageCount)
	require.NoError(t, err, "CreateMultipleTestMessages should not return an error")
	require.Len(t, messages, messageCount, "Should create correct number of messages")

	// Verify all messages have unique IDs
	uniqueIDs := make(map[string]bool)
	for _, msg := range messages {
		assert.False(t, uniqueIDs[msg.ID], "Message ID should be unique")
		uniqueIDs[msg.ID] = true
		assert.Equal(t, ids.ConversationAB, msg.ConversationID, "All messages should belong to same conversation")
		assert.Equal(t, ids.UserA, msg.SenderID, "All messages should be from same sender")
		assert.NotEmpty(t, msg.Content, "Message content should not be empty")
	}

	// Verify messages exist in database
	var dbMessageCount int
	err = testInfra.DBPool.QueryRow(ctx, `
		SELECT COUNT(*) FROM messages WHERE conversation_id = $1
	`, ids.ConversationAB).Scan(&dbMessageCount)
	require.NoError(t, err, "Should be able to count messages")
	assert.Equal(t, messageCount, dbMessageCount, "Should have correct number of messages in database")

	// Verify messages have different timestamps (due to sleep in CreateMultipleTestMessages)
	for i := 1; i < len(messages); i++ {
		assert.True(t, messages[i].CreatedAt.After(messages[i-1].CreatedAt), 
			"Message %d should have later timestamp than message %d", i, i-1)
	}

	// Cleanup after test
	err = testInfra.CleanupTestData(ctx)
	require.NoError(t, err, "Failed to cleanup test data")
}

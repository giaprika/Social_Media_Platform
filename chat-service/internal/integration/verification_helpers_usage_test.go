package integration

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestAssertMessageExists verifies the AssertMessageExists helper
func TestAssertMessageExists(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Cleanup before test
	err := testInfra.CleanupTestData(ctx)
	require.NoError(t, err)

	// Create test data
	ids := GenerateTestIDs()
	_, err = CreateTestConversation(ctx, testInfra.DBPool, ids.ConversationAB, []string{ids.UserA, ids.UserB})
	require.NoError(t, err)

	messageID := uuid.New().String()
	_, err = CreateTestMessage(ctx, testInfra.DBPool, messageID, ids.ConversationAB, ids.UserA, "Test message")
	require.NoError(t, err)

	// Test: Message should exist
	AssertMessageExists(t, testInfra.DBPool, messageID)

	// Cleanup
	err = testInfra.CleanupTestData(ctx)
	require.NoError(t, err)
}

// TestAssertOutboxEntryExists verifies the AssertOutboxEntryExists helper
func TestAssertOutboxEntryExists(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Cleanup before test
	err := testInfra.CleanupTestData(ctx)
	require.NoError(t, err)

	// Create outbox entry directly
	aggregateID := uuid.New().String()
	_, err = testInfra.DBPool.Exec(ctx, `
		INSERT INTO outbox (aggregate_type, aggregate_id, payload)
		VALUES ($1, $2, $3)
	`, "message", aggregateID, `{"test": "data"}`)
	require.NoError(t, err)

	// Test: Outbox entry should exist
	AssertOutboxEntryExists(t, testInfra.DBPool, aggregateID)

	// Cleanup
	err = testInfra.CleanupTestData(ctx)
	require.NoError(t, err)
}

// TestAssertConversationParticipants verifies the AssertConversationParticipants helper
func TestAssertConversationParticipants(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Cleanup before test
	err := testInfra.CleanupTestData(ctx)
	require.NoError(t, err)

	// Create test conversation with participants
	ids := GenerateTestIDs()
	participants := []string{ids.UserA, ids.UserB, ids.UserC}
	_, err = CreateTestConversation(ctx, testInfra.DBPool, ids.ConversationAB, participants)
	require.NoError(t, err)

	// Test: Verify all participants exist
	AssertConversationParticipants(t, testInfra.DBPool, ids.ConversationAB, participants)

	// Cleanup
	err = testInfra.CleanupTestData(ctx)
	require.NoError(t, err)
}

// TestGetUnreadCount verifies the GetUnreadCount helper
func TestGetUnreadCount(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Cleanup before test
	err := testInfra.CleanupTestData(ctx)
	require.NoError(t, err)

	// Create test conversation
	ids := GenerateTestIDs()
	_, err = CreateTestConversation(ctx, testInfra.DBPool, ids.ConversationAB, []string{ids.UserA, ids.UserB})
	require.NoError(t, err)

	// Initially, unread count should be 0 (no messages yet)
	unreadCount, err := GetUnreadCount(ctx, testInfra.DBPool, ids.ConversationAB, ids.UserA)
	require.NoError(t, err)
	assert.Equal(t, 0, unreadCount, "Should have 0 unread messages initially")

	// Create 3 messages
	for i := 0; i < 3; i++ {
		messageID := uuid.New().String()
		_, err = CreateTestMessage(ctx, testInfra.DBPool, messageID, ids.ConversationAB, ids.UserB, "Test message")
		require.NoError(t, err)
		time.Sleep(10 * time.Millisecond) // Ensure different timestamps
	}

	// Now unread count should be 3
	unreadCount, err = GetUnreadCount(ctx, testInfra.DBPool, ids.ConversationAB, ids.UserA)
	require.NoError(t, err)
	assert.Equal(t, 3, unreadCount, "Should have 3 unread messages")

	// Update last_read_at to mark messages as read
	_, err = testInfra.DBPool.Exec(ctx, `
		UPDATE conversation_participants
		SET last_read_at = NOW()
		WHERE conversation_id = $1 AND user_id = $2
	`, ids.ConversationAB, ids.UserA)
	require.NoError(t, err)

	// Now unread count should be 0
	unreadCount, err = GetUnreadCount(ctx, testInfra.DBPool, ids.ConversationAB, ids.UserA)
	require.NoError(t, err)
	assert.Equal(t, 0, unreadCount, "Should have 0 unread messages after marking as read")

	// Cleanup
	err = testInfra.CleanupTestData(ctx)
	require.NoError(t, err)
}

// TestGetMessageFromDB verifies the GetMessageFromDB helper
func TestGetMessageFromDB(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Cleanup before test
	err := testInfra.CleanupTestData(ctx)
	require.NoError(t, err)

	// Create test data
	ids := GenerateTestIDs()
	_, err = CreateTestConversation(ctx, testInfra.DBPool, ids.ConversationAB, []string{ids.UserA, ids.UserB})
	require.NoError(t, err)

	messageID := uuid.New().String()
	content := "Test message content"
	_, err = CreateTestMessage(ctx, testInfra.DBPool, messageID, ids.ConversationAB, ids.UserA, content)
	require.NoError(t, err)

	// Test: Fetch message details
	msg, err := GetMessageFromDB(ctx, testInfra.DBPool, messageID)
	require.NoError(t, err)
	require.NotNil(t, msg)

	assert.Equal(t, messageID, msg.ID)
	assert.Equal(t, ids.ConversationAB, msg.ConversationID)
	assert.Equal(t, ids.UserA, msg.SenderID)
	assert.Equal(t, content, msg.Content)
	assert.False(t, msg.CreatedAt.IsZero())

	// Test: Non-existent message
	nonExistentID := uuid.New().String()
	msg, err = GetMessageFromDB(ctx, testInfra.DBPool, nonExistentID)
	assert.Error(t, err)
	assert.Nil(t, msg)
	assert.Contains(t, err.Error(), "not found")

	// Cleanup
	err = testInfra.CleanupTestData(ctx)
	require.NoError(t, err)
}

// TestGetOutboxEntryFromDB verifies the GetOutboxEntryFromDB helper
func TestGetOutboxEntryFromDB(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Cleanup before test
	err := testInfra.CleanupTestData(ctx)
	require.NoError(t, err)

	// Create outbox entry
	aggregateID := uuid.New().String()
	payload := `{"message_id": "test-123", "content": "Hello"}`
	_, err = testInfra.DBPool.Exec(ctx, `
		INSERT INTO outbox (aggregate_type, aggregate_id, payload)
		VALUES ($1, $2, $3)
	`, "message", aggregateID, payload)
	require.NoError(t, err)

	// Test: Fetch outbox entry
	entry, err := GetOutboxEntryFromDB(ctx, testInfra.DBPool, aggregateID)
	require.NoError(t, err)
	require.NotNil(t, entry)

	assert.Equal(t, "message", entry.AggregateType)
	assert.Equal(t, aggregateID, entry.AggregateID)
	assert.NotNil(t, entry.Payload)
	assert.Equal(t, "test-123", entry.Payload["message_id"])
	assert.Equal(t, "Hello", entry.Payload["content"])
	assert.False(t, entry.CreatedAt.IsZero())
	assert.Nil(t, entry.ProcessedAt)

	// Test: Non-existent entry
	nonExistentID := uuid.New().String()
	entry, err = GetOutboxEntryFromDB(ctx, testInfra.DBPool, nonExistentID)
	assert.Error(t, err)
	assert.Nil(t, entry)
	assert.Contains(t, err.Error(), "not found")

	// Cleanup
	err = testInfra.CleanupTestData(ctx)
	require.NoError(t, err)
}

// TestAssertOutboxPayloadContains verifies the AssertOutboxPayloadContains helper
func TestAssertOutboxPayloadContains(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Cleanup before test
	err := testInfra.CleanupTestData(ctx)
	require.NoError(t, err)

	// Create outbox entry with specific payload
	aggregateID := uuid.New().String()
	payload := `{
		"message_id": "msg-123",
		"conversation_id": "conv-456",
		"sender_id": "user-789",
		"content": "Hello World",
		"created_at": "2024-01-15T10:30:00Z"
	}`
	_, err = testInfra.DBPool.Exec(ctx, `
		INSERT INTO outbox (aggregate_type, aggregate_id, payload)
		VALUES ($1, $2, $3)
	`, "message", aggregateID, payload)
	require.NoError(t, err)

	// Test: Verify payload contains expected fields
	expectedFields := map[string]interface{}{
		"message_id":      "msg-123",
		"conversation_id": "conv-456",
		"sender_id":       "user-789",
		"content":         "Hello World",
	}
	AssertOutboxPayloadContains(t, testInfra.DBPool, aggregateID, expectedFields)

	// Test: Verify payload contains fields without checking values (pass nil)
	fieldsToCheck := map[string]interface{}{
		"message_id":      nil,
		"conversation_id": nil,
		"created_at":      nil,
	}
	AssertOutboxPayloadContains(t, testInfra.DBPool, aggregateID, fieldsToCheck)

	// Cleanup
	err = testInfra.CleanupTestData(ctx)
	require.NoError(t, err)
}

// TestAssertMessageNotExists verifies the AssertMessageNotExists helper
func TestAssertMessageNotExists(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Cleanup before test
	err := testInfra.CleanupTestData(ctx)
	require.NoError(t, err)

	// Test: Non-existent message should pass
	nonExistentID := uuid.New().String()
	AssertMessageNotExists(t, testInfra.DBPool, nonExistentID)

	// Cleanup
	err = testInfra.CleanupTestData(ctx)
	require.NoError(t, err)
}

// TestAssertConversationLastMessage verifies the AssertConversationLastMessage helper
func TestAssertConversationLastMessage(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Cleanup before test
	err := testInfra.CleanupTestData(ctx)
	require.NoError(t, err)

	// Create test data
	ids := GenerateTestIDs()
	_, err = CreateTestConversation(ctx, testInfra.DBPool, ids.ConversationAB, []string{ids.UserA, ids.UserB})
	require.NoError(t, err)

	content := "This is the last message"
	messageID := uuid.New().String()
	_, err = CreateTestMessage(ctx, testInfra.DBPool, messageID, ids.ConversationAB, ids.UserA, content)
	require.NoError(t, err)

	// Test: Verify last message content
	AssertConversationLastMessage(t, testInfra.DBPool, ids.ConversationAB, content)

	// Cleanup
	err = testInfra.CleanupTestData(ctx)
	require.NoError(t, err)
}

// TestAssertMessagesMarkedAsRead verifies the AssertMessagesMarkedAsRead helper
func TestAssertMessagesMarkedAsRead(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Cleanup before test
	err := testInfra.CleanupTestData(ctx)
	require.NoError(t, err)

	// Create test data
	ids := GenerateTestIDs()
	_, err = CreateTestConversation(ctx, testInfra.DBPool, ids.ConversationAB, []string{ids.UserA, ids.UserB})
	require.NoError(t, err)

	// Create messages
	var messageIDs []string
	for i := 0; i < 3; i++ {
		messageID := uuid.New().String()
		messageIDs = append(messageIDs, messageID)
		_, err = CreateTestMessage(ctx, testInfra.DBPool, messageID, ids.ConversationAB, ids.UserB, "Test message")
		require.NoError(t, err)
		time.Sleep(10 * time.Millisecond)
	}

	// Mark messages as read by updating last_read_at
	_, err = testInfra.DBPool.Exec(ctx, `
		UPDATE conversation_participants
		SET last_read_at = NOW()
		WHERE conversation_id = $1 AND user_id = $2
	`, ids.ConversationAB, ids.UserA)
	require.NoError(t, err)

	// Test: Verify messages are marked as read
	AssertMessagesMarkedAsRead(t, testInfra.DBPool, ids.ConversationAB, ids.UserA, messageIDs)

	// Cleanup
	err = testInfra.CleanupTestData(ctx)
	require.NoError(t, err)
}

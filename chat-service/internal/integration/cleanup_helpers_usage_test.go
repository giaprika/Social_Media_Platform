package integration

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestCleanupConversation verifies that CleanupConversation deletes a conversation and all related data
func TestCleanupConversation(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Generate test IDs
	conversationID := uuid.New().String()
	messageID1 := uuid.New().String()
	messageID2 := uuid.New().String()
	userID1 := uuid.New().String()
	userID2 := uuid.New().String()

	// Insert test conversation
	_, err := testInfra.DBPool.Exec(ctx, `
		INSERT INTO conversations (id, last_message_content, last_message_at)
		VALUES ($1, 'Test message', NOW())
	`, conversationID)
	require.NoError(t, err, "Failed to insert test conversation")

	// Insert conversation participants
	_, err = testInfra.DBPool.Exec(ctx, `
		INSERT INTO conversation_participants (conversation_id, user_id, joined_at)
		VALUES ($1, $2, NOW()), ($1, $3, NOW())
	`, conversationID, userID1, userID2)
	require.NoError(t, err, "Failed to insert conversation participants")

	// Insert test messages
	_, err = testInfra.DBPool.Exec(ctx, `
		INSERT INTO messages (id, conversation_id, sender_id, content, created_at)
		VALUES 
			($1, $2, $3, 'Message 1', NOW()),
			($4, $2, $5, 'Message 2', NOW())
	`, messageID1, conversationID, userID1, messageID2, userID2)
	require.NoError(t, err, "Failed to insert test messages")

	// Insert outbox entries for messages
	_, err = testInfra.DBPool.Exec(ctx, `
		INSERT INTO outbox (id, aggregate_type, aggregate_id, payload, created_at)
		VALUES 
			($1, 'message', $2, '{"test": "data1"}', NOW()),
			($3, 'message', $4, '{"test": "data2"}', NOW())
	`, uuid.New().String(), messageID1, uuid.New().String(), messageID2)
	require.NoError(t, err, "Failed to insert outbox entries")

	// Verify data exists before cleanup
	var conversationCount int
	err = testInfra.DBPool.QueryRow(ctx, "SELECT COUNT(*) FROM conversations WHERE id = $1", conversationID).Scan(&conversationCount)
	require.NoError(t, err)
	assert.Equal(t, 1, conversationCount, "Expected 1 conversation before cleanup")

	var messageCount int
	err = testInfra.DBPool.QueryRow(ctx, "SELECT COUNT(*) FROM messages WHERE conversation_id = $1", conversationID).Scan(&messageCount)
	require.NoError(t, err)
	assert.Equal(t, 2, messageCount, "Expected 2 messages before cleanup")

	var participantCount int
	err = testInfra.DBPool.QueryRow(ctx, "SELECT COUNT(*) FROM conversation_participants WHERE conversation_id = $1", conversationID).Scan(&participantCount)
	require.NoError(t, err)
	assert.Equal(t, 2, participantCount, "Expected 2 participants before cleanup")

	var outboxCount int
	err = testInfra.DBPool.QueryRow(ctx, "SELECT COUNT(*) FROM outbox WHERE aggregate_id IN ($1, $2)", messageID1, messageID2).Scan(&outboxCount)
	require.NoError(t, err)
	assert.Equal(t, 2, outboxCount, "Expected 2 outbox entries before cleanup")

	// Run cleanup
	err = CleanupConversation(ctx, testInfra.DBPool, conversationID)
	require.NoError(t, err, "CleanupConversation should not return an error")

	// Verify all related data is deleted
	err = testInfra.DBPool.QueryRow(ctx, "SELECT COUNT(*) FROM conversations WHERE id = $1", conversationID).Scan(&conversationCount)
	require.NoError(t, err)
	assert.Equal(t, 0, conversationCount, "Expected 0 conversations after cleanup")

	err = testInfra.DBPool.QueryRow(ctx, "SELECT COUNT(*) FROM messages WHERE conversation_id = $1", conversationID).Scan(&messageCount)
	require.NoError(t, err)
	assert.Equal(t, 0, messageCount, "Expected 0 messages after cleanup (CASCADE delete)")

	err = testInfra.DBPool.QueryRow(ctx, "SELECT COUNT(*) FROM conversation_participants WHERE conversation_id = $1", conversationID).Scan(&participantCount)
	require.NoError(t, err)
	assert.Equal(t, 0, participantCount, "Expected 0 participants after cleanup (CASCADE delete)")

	err = testInfra.DBPool.QueryRow(ctx, "SELECT COUNT(*) FROM outbox WHERE aggregate_id IN ($1, $2)", messageID1, messageID2).Scan(&outboxCount)
	require.NoError(t, err)
	assert.Equal(t, 0, outboxCount, "Expected 0 outbox entries after cleanup")
}

// TestCleanupConversation_NonExistent verifies that cleaning up a non-existent conversation doesn't error
func TestCleanupConversation_NonExistent(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Try to cleanup a conversation that doesn't exist
	nonExistentID := uuid.New().String()
	err := CleanupConversation(ctx, testInfra.DBPool, nonExistentID)
	
	// Should not return an error - cleanup is idempotent
	assert.NoError(t, err, "Cleaning up non-existent conversation should not error")
}

// TestCleanupAllTestData verifies that CleanupAllTestData truncates all tables
func TestCleanupAllTestData(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Insert test data into multiple tables
	conversationID1 := uuid.New().String()
	conversationID2 := uuid.New().String()
	messageID1 := uuid.New().String()
	messageID2 := uuid.New().String()
	userID := uuid.New().String()

	// Insert conversations
	_, err := testInfra.DBPool.Exec(ctx, `
		INSERT INTO conversations (id, last_message_content, last_message_at)
		VALUES 
			($1, 'Test message 1', NOW()),
			($2, 'Test message 2', NOW())
	`, conversationID1, conversationID2)
	require.NoError(t, err, "Failed to insert test conversations")

	// Insert messages
	_, err = testInfra.DBPool.Exec(ctx, `
		INSERT INTO messages (id, conversation_id, sender_id, content, created_at)
		VALUES 
			($1, $2, $3, 'Message 1', NOW()),
			($4, $5, $3, 'Message 2', NOW())
	`, messageID1, conversationID1, userID, messageID2, conversationID2)
	require.NoError(t, err, "Failed to insert test messages")

	// Insert outbox entries
	_, err = testInfra.DBPool.Exec(ctx, `
		INSERT INTO outbox (id, aggregate_type, aggregate_id, payload, created_at)
		VALUES 
			($1, 'message', $2, '{"test": "data1"}', NOW()),
			($3, 'message', $4, '{"test": "data2"}', NOW())
	`, uuid.New().String(), messageID1, uuid.New().String(), messageID2)
	require.NoError(t, err, "Failed to insert outbox entries")

	// Insert conversation participants
	_, err = testInfra.DBPool.Exec(ctx, `
		INSERT INTO conversation_participants (conversation_id, user_id, joined_at)
		VALUES ($1, $2, NOW())
	`, conversationID1, userID)
	require.NoError(t, err, "Failed to insert conversation participants")

	// Verify data exists before cleanup
	var conversationCount int
	err = testInfra.DBPool.QueryRow(ctx, "SELECT COUNT(*) FROM conversations").Scan(&conversationCount)
	require.NoError(t, err)
	assert.GreaterOrEqual(t, conversationCount, 2, "Expected at least 2 conversations before cleanup")

	var messageCount int
	err = testInfra.DBPool.QueryRow(ctx, "SELECT COUNT(*) FROM messages").Scan(&messageCount)
	require.NoError(t, err)
	assert.GreaterOrEqual(t, messageCount, 2, "Expected at least 2 messages before cleanup")

	// Run cleanup
	err = CleanupAllTestData(ctx, testInfra.DBPool)
	require.NoError(t, err, "CleanupAllTestData should not return an error")

	// Verify all data is deleted
	err = testInfra.DBPool.QueryRow(ctx, "SELECT COUNT(*) FROM conversations").Scan(&conversationCount)
	require.NoError(t, err)
	assert.Equal(t, 0, conversationCount, "Expected 0 conversations after cleanup")

	err = testInfra.DBPool.QueryRow(ctx, "SELECT COUNT(*) FROM messages").Scan(&messageCount)
	require.NoError(t, err)
	assert.Equal(t, 0, messageCount, "Expected 0 messages after cleanup")

	var outboxCount int
	err = testInfra.DBPool.QueryRow(ctx, "SELECT COUNT(*) FROM outbox").Scan(&outboxCount)
	require.NoError(t, err)
	assert.Equal(t, 0, outboxCount, "Expected 0 outbox entries after cleanup")

	var participantCount int
	err = testInfra.DBPool.QueryRow(ctx, "SELECT COUNT(*) FROM conversation_participants").Scan(&participantCount)
	require.NoError(t, err)
	assert.Equal(t, 0, participantCount, "Expected 0 participants after cleanup")
}

// TestCleanupMessage verifies that CleanupMessage deletes a specific message and its outbox entry
func TestCleanupMessage(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Generate test IDs
	conversationID := uuid.New().String()
	messageID1 := uuid.New().String()
	messageID2 := uuid.New().String()
	userID := uuid.New().String()

	// Insert test conversation
	_, err := testInfra.DBPool.Exec(ctx, `
		INSERT INTO conversations (id, last_message_content, last_message_at)
		VALUES ($1, 'Test message', NOW())
	`, conversationID)
	require.NoError(t, err, "Failed to insert test conversation")

	// Insert test messages
	_, err = testInfra.DBPool.Exec(ctx, `
		INSERT INTO messages (id, conversation_id, sender_id, content, created_at)
		VALUES 
			($1, $2, $3, 'Message 1', NOW()),
			($4, $2, $3, 'Message 2', NOW())
	`, messageID1, conversationID, userID, messageID2)
	require.NoError(t, err, "Failed to insert test messages")

	// Insert outbox entries
	_, err = testInfra.DBPool.Exec(ctx, `
		INSERT INTO outbox (id, aggregate_type, aggregate_id, payload, created_at)
		VALUES 
			($1, 'message', $2, '{"test": "data1"}', NOW()),
			($3, 'message', $4, '{"test": "data2"}', NOW())
	`, uuid.New().String(), messageID1, uuid.New().String(), messageID2)
	require.NoError(t, err, "Failed to insert outbox entries")

	// Verify both messages exist
	var messageCount int
	err = testInfra.DBPool.QueryRow(ctx, "SELECT COUNT(*) FROM messages WHERE conversation_id = $1", conversationID).Scan(&messageCount)
	require.NoError(t, err)
	assert.Equal(t, 2, messageCount, "Expected 2 messages before cleanup")

	// Cleanup only the first message
	err = CleanupMessage(ctx, testInfra.DBPool, messageID1)
	require.NoError(t, err, "CleanupMessage should not return an error")

	// Verify only the first message is deleted
	err = testInfra.DBPool.QueryRow(ctx, "SELECT COUNT(*) FROM messages WHERE conversation_id = $1", conversationID).Scan(&messageCount)
	require.NoError(t, err)
	assert.Equal(t, 1, messageCount, "Expected 1 message after cleanup")

	// Verify the correct message was deleted
	var existingMessageID string
	err = testInfra.DBPool.QueryRow(ctx, "SELECT id FROM messages WHERE conversation_id = $1", conversationID).Scan(&existingMessageID)
	require.NoError(t, err)
	assert.Equal(t, messageID2, existingMessageID, "Expected message 2 to remain")

	// Verify outbox entry for message 1 is deleted
	var outboxCount int
	err = testInfra.DBPool.QueryRow(ctx, "SELECT COUNT(*) FROM outbox WHERE aggregate_id = $1", messageID1).Scan(&outboxCount)
	require.NoError(t, err)
	assert.Equal(t, 0, outboxCount, "Expected 0 outbox entries for deleted message")

	// Verify outbox entry for message 2 still exists
	err = testInfra.DBPool.QueryRow(ctx, "SELECT COUNT(*) FROM outbox WHERE aggregate_id = $1", messageID2).Scan(&outboxCount)
	require.NoError(t, err)
	assert.Equal(t, 1, outboxCount, "Expected 1 outbox entry for remaining message")

	// Cleanup test data
	err = CleanupConversation(ctx, testInfra.DBPool, conversationID)
	require.NoError(t, err)
}

// TestCleanupRedisKeys verifies that CleanupRedisKeys deletes specific Redis keys
func TestCleanupRedisKeys(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Set test keys in Redis
	key1 := "test-key-1-" + uuid.New().String()
	key2 := "test-key-2-" + uuid.New().String()
	key3 := "test-key-3-" + uuid.New().String()

	err := testInfra.RedisClient.Set(ctx, key1, "value1", 0).Err()
	require.NoError(t, err)
	err = testInfra.RedisClient.Set(ctx, key2, "value2", 0).Err()
	require.NoError(t, err)
	err = testInfra.RedisClient.Set(ctx, key3, "value3", 0).Err()
	require.NoError(t, err)

	// Verify keys exist
	val, err := testInfra.RedisClient.Get(ctx, key1).Result()
	require.NoError(t, err)
	assert.Equal(t, "value1", val)

	// Cleanup specific keys
	err = CleanupRedisKeys(ctx, testInfra, []string{key1, key2})
	require.NoError(t, err, "CleanupRedisKeys should not return an error")

	// Verify keys are deleted
	_, err = testInfra.RedisClient.Get(ctx, key1).Result()
	assert.Error(t, err, "Expected key1 to be deleted")

	_, err = testInfra.RedisClient.Get(ctx, key2).Result()
	assert.Error(t, err, "Expected key2 to be deleted")

	// Verify key3 still exists
	val, err = testInfra.RedisClient.Get(ctx, key3).Result()
	require.NoError(t, err)
	assert.Equal(t, "value3", val, "Expected key3 to still exist")

	// Cleanup remaining key
	err = CleanupRedisKeys(ctx, testInfra, []string{key3})
	require.NoError(t, err)
}

// TestCleanupRedisPattern verifies that CleanupRedisPattern deletes keys matching a pattern
func TestCleanupRedisPattern(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Set test keys with a common prefix
	prefix := "test-pattern-" + uuid.New().String()
	key1 := prefix + ":key1"
	key2 := prefix + ":key2"
	key3 := "other-key-" + uuid.New().String()

	err := testInfra.RedisClient.Set(ctx, key1, "value1", 0).Err()
	require.NoError(t, err)
	err = testInfra.RedisClient.Set(ctx, key2, "value2", 0).Err()
	require.NoError(t, err)
	err = testInfra.RedisClient.Set(ctx, key3, "value3", 0).Err()
	require.NoError(t, err)

	// Cleanup keys matching pattern
	pattern := prefix + ":*"
	err = CleanupRedisPattern(ctx, testInfra, pattern)
	require.NoError(t, err, "CleanupRedisPattern should not return an error")

	// Verify pattern-matched keys are deleted
	_, err = testInfra.RedisClient.Get(ctx, key1).Result()
	assert.Error(t, err, "Expected key1 to be deleted")

	_, err = testInfra.RedisClient.Get(ctx, key2).Result()
	assert.Error(t, err, "Expected key2 to be deleted")

	// Verify other key still exists
	val, err := testInfra.RedisClient.Get(ctx, key3).Result()
	require.NoError(t, err)
	assert.Equal(t, "value3", val, "Expected key3 to still exist")

	// Cleanup remaining key
	err = CleanupRedisKeys(ctx, testInfra, []string{key3})
	require.NoError(t, err)
}

// TestCleanupConversations verifies that CleanupConversations deletes multiple conversations
func TestCleanupConversations(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Generate test IDs
	conversationID1 := uuid.New().String()
	conversationID2 := uuid.New().String()
	conversationID3 := uuid.New().String()

	// Insert test conversations
	_, err := testInfra.DBPool.Exec(ctx, `
		INSERT INTO conversations (id, last_message_content, last_message_at)
		VALUES 
			($1, 'Test message 1', NOW()),
			($2, 'Test message 2', NOW()),
			($3, 'Test message 3', NOW())
	`, conversationID1, conversationID2, conversationID3)
	require.NoError(t, err, "Failed to insert test conversations")

	// Verify conversations exist
	var conversationCount int
	err = testInfra.DBPool.QueryRow(ctx, "SELECT COUNT(*) FROM conversations WHERE id IN ($1, $2, $3)", 
		conversationID1, conversationID2, conversationID3).Scan(&conversationCount)
	require.NoError(t, err)
	assert.Equal(t, 3, conversationCount, "Expected 3 conversations before cleanup")

	// Cleanup multiple conversations
	err = CleanupConversations(ctx, testInfra.DBPool, []string{conversationID1, conversationID2})
	require.NoError(t, err, "CleanupConversations should not return an error")

	// Verify only specified conversations are deleted
	err = testInfra.DBPool.QueryRow(ctx, "SELECT COUNT(*) FROM conversations WHERE id IN ($1, $2)", 
		conversationID1, conversationID2).Scan(&conversationCount)
	require.NoError(t, err)
	assert.Equal(t, 0, conversationCount, "Expected 0 conversations after cleanup")

	// Verify conversation 3 still exists
	err = testInfra.DBPool.QueryRow(ctx, "SELECT COUNT(*) FROM conversations WHERE id = $1", 
		conversationID3).Scan(&conversationCount)
	require.NoError(t, err)
	assert.Equal(t, 1, conversationCount, "Expected conversation 3 to still exist")

	// Cleanup remaining conversation
	err = CleanupConversation(ctx, testInfra.DBPool, conversationID3)
	require.NoError(t, err)
}

package integration

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestInfrastructureSetup verifies that the test infrastructure is properly initialized
func TestInfrastructureSetup(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Verify testInfra is initialized
	require.NotNil(t, testInfra, "test infrastructure should be initialized")
	require.NotNil(t, testInfra.DBPool, "database pool should be initialized")
	require.NotNil(t, testInfra.RedisClient, "Redis client should be initialized")
	require.NotNil(t, testInfra.PostgresContainer, "PostgreSQL container should be running")
	require.NotNil(t, testInfra.RedisContainer, "Redis container should be running")

	// Verify database connection
	err := testInfra.DBPool.Ping(ctx)
	require.NoError(t, err, "should be able to ping database")

	// Verify Redis connection
	err = testInfra.RedisClient.Ping(ctx).Err()
	require.NoError(t, err, "should be able to ping Redis")

	// Verify connection strings are set
	assert.NotEmpty(t, testInfra.DBConnString, "database connection string should be set")
	assert.NotEmpty(t, testInfra.RedisAddr, "Redis address should be set")
}

// TestCleanupTestData verifies that the cleanup function properly truncates tables and clears Redis
func TestCleanupTestData(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Insert test data into conversations table
	_, err := testInfra.DBPool.Exec(ctx, `
		INSERT INTO conversations (id, last_message_content, last_message_at)
		VALUES ('00000000-0000-0000-0000-000000000001', 'Test message', NOW())
	`)
	require.NoError(t, err, "Failed to insert test conversation")

	// Insert test data into messages table
	_, err = testInfra.DBPool.Exec(ctx, `
		INSERT INTO messages (id, conversation_id, sender_id, content, created_at)
		VALUES (
			'00000000-0000-0000-0000-000000000002',
			'00000000-0000-0000-0000-000000000001',
			'00000000-0000-0000-0000-000000000003',
			'Test message content',
			NOW()
		)
	`)
	require.NoError(t, err, "Failed to insert test message")

	// Insert test data into outbox table
	_, err = testInfra.DBPool.Exec(ctx, `
		INSERT INTO outbox (id, aggregate_type, aggregate_id, payload, created_at)
		VALUES (
			'00000000-0000-0000-0000-000000000004',
			'message',
			'00000000-0000-0000-0000-000000000002',
			'{"test": "data"}',
			NOW()
		)
	`)
	require.NoError(t, err, "Failed to insert test outbox entry")

	// Set test data in Redis
	err = testInfra.RedisClient.Set(ctx, "test-key", "test-value", 0).Err()
	require.NoError(t, err, "Failed to set Redis key")

	// Verify data exists before cleanup
	var conversationCount int
	err = testInfra.DBPool.QueryRow(ctx, "SELECT COUNT(*) FROM conversations").Scan(&conversationCount)
	require.NoError(t, err)
	assert.Equal(t, 1, conversationCount, "Expected 1 conversation before cleanup")

	var messageCount int
	err = testInfra.DBPool.QueryRow(ctx, "SELECT COUNT(*) FROM messages").Scan(&messageCount)
	require.NoError(t, err)
	assert.Equal(t, 1, messageCount, "Expected 1 message before cleanup")

	var outboxCount int
	err = testInfra.DBPool.QueryRow(ctx, "SELECT COUNT(*) FROM outbox").Scan(&outboxCount)
	require.NoError(t, err)
	assert.Equal(t, 1, outboxCount, "Expected 1 outbox entry before cleanup")

	redisVal, err := testInfra.RedisClient.Get(ctx, "test-key").Result()
	require.NoError(t, err)
	assert.Equal(t, "test-value", redisVal, "Expected Redis key to exist before cleanup")

	// Run cleanup
	err = testInfra.CleanupTestData(ctx)
	require.NoError(t, err, "CleanupTestData should not return an error")

	// Verify all data is cleaned up
	err = testInfra.DBPool.QueryRow(ctx, "SELECT COUNT(*) FROM conversations").Scan(&conversationCount)
	require.NoError(t, err)
	assert.Equal(t, 0, conversationCount, "Expected 0 conversations after cleanup")

	err = testInfra.DBPool.QueryRow(ctx, "SELECT COUNT(*) FROM messages").Scan(&messageCount)
	require.NoError(t, err)
	assert.Equal(t, 0, messageCount, "Expected 0 messages after cleanup")

	err = testInfra.DBPool.QueryRow(ctx, "SELECT COUNT(*) FROM outbox").Scan(&outboxCount)
	require.NoError(t, err)
	assert.Equal(t, 0, outboxCount, "Expected 0 outbox entries after cleanup")

	// Verify Redis is flushed
	redisVal, err = testInfra.RedisClient.Get(ctx, "test-key").Result()
	assert.Error(t, err, "Expected Redis key to not exist after cleanup")
	assert.Equal(t, "", redisVal, "Expected empty value after cleanup")
}

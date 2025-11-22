package integration

import (
	"context"
	"encoding/json"
	"fmt"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// AssertMessageExists verifies that a message exists in the database
func AssertMessageExists(t *testing.T, db *pgxpool.Pool, messageID string) {
	t.Helper()
	ctx := context.Background()

	var exists bool
	query := `SELECT EXISTS(SELECT 1 FROM messages WHERE id = $1)`
	err := db.QueryRow(ctx, query, messageID).Scan(&exists)
	
	require.NoError(t, err, "Failed to check if message exists")
	assert.True(t, exists, "Message %s should exist in database", messageID)
}

// AssertOutboxEntryExists verifies that an outbox entry exists for the given aggregate_id
func AssertOutboxEntryExists(t *testing.T, db *pgxpool.Pool, aggregateID string) {
	t.Helper()
	ctx := context.Background()

	var exists bool
	query := `SELECT EXISTS(SELECT 1 FROM outbox WHERE aggregate_id = $1)`
	err := db.QueryRow(ctx, query, aggregateID).Scan(&exists)
	
	require.NoError(t, err, "Failed to check if outbox entry exists")
	assert.True(t, exists, "Outbox entry for aggregate_id %s should exist in database", aggregateID)
}

// AssertConversationParticipants verifies that the expected participants exist for a conversation
func AssertConversationParticipants(t *testing.T, db *pgxpool.Pool, conversationID string, expectedParticipants []string) {
	t.Helper()
	ctx := context.Background()

	// Query all participants for the conversation
	query := `
		SELECT user_id 
		FROM conversation_participants 
		WHERE conversation_id = $1
		ORDER BY user_id
	`
	
	rows, err := db.Query(ctx, query, conversationID)
	require.NoError(t, err, "Failed to query conversation participants")
	defer rows.Close()

	// Collect actual participants
	var actualParticipants []string
	for rows.Next() {
		var userID string
		err := rows.Scan(&userID)
		require.NoError(t, err, "Failed to scan participant")
		actualParticipants = append(actualParticipants, userID)
	}

	require.NoError(t, rows.Err(), "Error iterating over participants")

	// Verify count matches
	assert.Equal(t, len(expectedParticipants), len(actualParticipants), 
		"Conversation %s should have %d participants, but has %d", 
		conversationID, len(expectedParticipants), len(actualParticipants))

	// Verify each expected participant exists
	participantMap := make(map[string]bool)
	for _, p := range actualParticipants {
		participantMap[p] = true
	}

	for _, expectedParticipant := range expectedParticipants {
		assert.True(t, participantMap[expectedParticipant], 
			"Expected participant %s should exist in conversation %s", 
			expectedParticipant, conversationID)
	}
}

// GetUnreadCount queries the unread message count for a user in a conversation
func GetUnreadCount(ctx context.Context, db *pgxpool.Pool, conversationID, userID string) (int, error) {
	// Get the user's last_read_at timestamp
	var lastReadAt time.Time
	query := `
		SELECT last_read_at 
		FROM conversation_participants 
		WHERE conversation_id = $1 AND user_id = $2
	`
	
	err := db.QueryRow(ctx, query, conversationID, userID).Scan(&lastReadAt)
	if err != nil {
		if err == pgx.ErrNoRows {
			return 0, fmt.Errorf("user %s is not a participant in conversation %s", userID, conversationID)
		}
		return 0, fmt.Errorf("failed to get last_read_at: %w", err)
	}

	// Count messages created after last_read_at
	var unreadCount int
	countQuery := `
		SELECT COUNT(*) 
		FROM messages 
		WHERE conversation_id = $1 
		AND created_at > $2
	`
	
	err = db.QueryRow(ctx, countQuery, conversationID, lastReadAt).Scan(&unreadCount)
	if err != nil {
		return 0, fmt.Errorf("failed to count unread messages: %w", err)
	}

	return unreadCount, nil
}

// MessageDetails contains detailed information about a message from the database
type MessageDetails struct {
	ID             string
	ConversationID string
	SenderID       string
	Content        string
	CreatedAt      time.Time
}

// GetMessageFromDB fetches and returns complete message details from the database
func GetMessageFromDB(ctx context.Context, db *pgxpool.Pool, messageID string) (*MessageDetails, error) {
	query := `
		SELECT id, conversation_id, sender_id, content, created_at
		FROM messages
		WHERE id = $1
	`
	
	var msg MessageDetails
	err := db.QueryRow(ctx, query, messageID).Scan(
		&msg.ID,
		&msg.ConversationID,
		&msg.SenderID,
		&msg.Content,
		&msg.CreatedAt,
	)
	
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, fmt.Errorf("message %s not found", messageID)
		}
		return nil, fmt.Errorf("failed to fetch message: %w", err)
	}

	return &msg, nil
}

// OutboxEntryDetails contains detailed information about an outbox entry
type OutboxEntryDetails struct {
	ID            string
	AggregateType string
	AggregateID   string
	Payload       map[string]interface{}
	CreatedAt     time.Time
	ProcessedAt   *time.Time
}

// GetOutboxEntryFromDB fetches and returns complete outbox entry details
func GetOutboxEntryFromDB(ctx context.Context, db *pgxpool.Pool, aggregateID string) (*OutboxEntryDetails, error) {
	query := `
		SELECT id, aggregate_type, aggregate_id, payload, created_at, processed_at
		FROM outbox
		WHERE aggregate_id = $1
		ORDER BY created_at DESC
		LIMIT 1
	`
	
	var entry OutboxEntryDetails
	var payloadJSON []byte
	
	err := db.QueryRow(ctx, query, aggregateID).Scan(
		&entry.ID,
		&entry.AggregateType,
		&entry.AggregateID,
		&payloadJSON,
		&entry.CreatedAt,
		&entry.ProcessedAt,
	)
	
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, fmt.Errorf("outbox entry for aggregate_id %s not found", aggregateID)
		}
		return nil, fmt.Errorf("failed to fetch outbox entry: %w", err)
	}

	// Parse JSON payload
	if err := json.Unmarshal(payloadJSON, &entry.Payload); err != nil {
		return nil, fmt.Errorf("failed to parse outbox payload: %w", err)
	}

	return &entry, nil
}

// AssertOutboxPayloadContains verifies that an outbox entry contains expected fields in its payload
func AssertOutboxPayloadContains(t *testing.T, db *pgxpool.Pool, aggregateID string, expectedFields map[string]interface{}) {
	t.Helper()
	ctx := context.Background()

	entry, err := GetOutboxEntryFromDB(ctx, db, aggregateID)
	require.NoError(t, err, "Failed to get outbox entry")
	require.NotNil(t, entry, "Outbox entry should not be nil")

	// Verify each expected field
	for key, expectedValue := range expectedFields {
		actualValue, exists := entry.Payload[key]
		assert.True(t, exists, "Outbox payload should contain field '%s'", key)
		
		if expectedValue != nil {
			assert.Equal(t, expectedValue, actualValue, 
				"Outbox payload field '%s' should have expected value", key)
		}
	}
}

// AssertMessageNotExists verifies that a message does NOT exist in the database
func AssertMessageNotExists(t *testing.T, db *pgxpool.Pool, messageID string) {
	t.Helper()
	ctx := context.Background()

	var exists bool
	query := `SELECT EXISTS(SELECT 1 FROM messages WHERE id = $1)`
	err := db.QueryRow(ctx, query, messageID).Scan(&exists)
	
	require.NoError(t, err, "Failed to check if message exists")
	assert.False(t, exists, "Message %s should NOT exist in database", messageID)
}

// AssertOutboxEntryNotExists verifies that an outbox entry does NOT exist
func AssertOutboxEntryNotExists(t *testing.T, db *pgxpool.Pool, aggregateID string) {
	t.Helper()
	ctx := context.Background()

	var exists bool
	query := `SELECT EXISTS(SELECT 1 FROM outbox WHERE aggregate_id = $1)`
	err := db.QueryRow(ctx, query, aggregateID).Scan(&exists)
	
	require.NoError(t, err, "Failed to check if outbox entry exists")
	assert.False(t, exists, "Outbox entry for aggregate_id %s should NOT exist in database", aggregateID)
}

// AssertConversationLastMessage verifies the last_message_content and last_message_at fields
func AssertConversationLastMessage(t *testing.T, db *pgxpool.Pool, conversationID, expectedContent string) {
	t.Helper()
	ctx := context.Background()

	var lastMessageContent string
	var lastMessageAt time.Time
	query := `
		SELECT last_message_content, last_message_at 
		FROM conversations 
		WHERE id = $1
	`
	
	err := db.QueryRow(ctx, query, conversationID).Scan(&lastMessageContent, &lastMessageAt)
	require.NoError(t, err, "Failed to query conversation")
	
	assert.Equal(t, expectedContent, lastMessageContent, 
		"Conversation %s should have expected last_message_content", conversationID)
	assert.False(t, lastMessageAt.IsZero(), 
		"Conversation %s should have last_message_at set", conversationID)
}

// AssertMessagesMarkedAsRead verifies that messages are marked as read for a user
func AssertMessagesMarkedAsRead(t *testing.T, db *pgxpool.Pool, conversationID, userID string, messageIDs []string) {
	t.Helper()
	ctx := context.Background()

	// Get the user's last_read_at timestamp
	var lastReadAt time.Time
	query := `
		SELECT last_read_at 
		FROM conversation_participants 
		WHERE conversation_id = $1 AND user_id = $2
	`
	
	err := db.QueryRow(ctx, query, conversationID, userID).Scan(&lastReadAt)
	require.NoError(t, err, "Failed to get last_read_at for user")
	assert.False(t, lastReadAt.IsZero(), "last_read_at should be set")

	// Verify that all specified messages were created before or at last_read_at
	for _, messageID := range messageIDs {
		var createdAt time.Time
		msgQuery := `SELECT created_at FROM messages WHERE id = $1`
		err := db.QueryRow(ctx, msgQuery, messageID).Scan(&createdAt)
		require.NoError(t, err, "Failed to get message created_at")
		
		assert.True(t, createdAt.Before(lastReadAt) || createdAt.Equal(lastReadAt),
			"Message %s should be marked as read (created_at <= last_read_at)", messageID)
	}
}

// AssertRedisIdempotencyKeyExists verifies that an idempotency key exists in Redis
func AssertRedisIdempotencyKeyExists(t *testing.T, infra *TestInfrastructure, idempotencyKey string) {
	t.Helper()
	ctx := context.Background()

	// Build the full Redis key with prefix (matching pkg/idempotency/idempotency.go)
	redisKey := "idempotency:" + idempotencyKey

	// Check if key exists in Redis
	exists, err := infra.RedisClient.Exists(ctx, redisKey).Result()
	require.NoError(t, err, "Failed to check if Redis key exists")
	assert.Equal(t, int64(1), exists, "Idempotency key %s should exist in Redis", idempotencyKey)
}

// AssertRedisIdempotencyKeyNotExists verifies that an idempotency key does NOT exist in Redis
func AssertRedisIdempotencyKeyNotExists(t *testing.T, infra *TestInfrastructure, idempotencyKey string) {
	t.Helper()
	ctx := context.Background()

	// Build the full Redis key with prefix
	redisKey := "idempotency:" + idempotencyKey

	// Check if key exists in Redis
	exists, err := infra.RedisClient.Exists(ctx, redisKey).Result()
	require.NoError(t, err, "Failed to check if Redis key exists")
	assert.Equal(t, int64(0), exists, "Idempotency key %s should NOT exist in Redis", idempotencyKey)
}

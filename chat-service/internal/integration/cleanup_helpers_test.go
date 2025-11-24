package integration

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

// cleanup_helpers_test.go provides helper functions for cleaning up test data
// in integration tests. These functions ensure proper cleanup of conversations,
// messages, outbox entries, and Redis keys to maintain test isolation.
//
// Key functions:
// - CleanupConversation: Deletes a single conversation and all related data
// - CleanupAllTestData: Truncates all tables for complete cleanup
// - CleanupMessage: Deletes a specific message and its outbox entry
// - CleanupRedisKeys: Deletes specific Redis keys
// - CleanupRedisPattern: Deletes Redis keys matching a pattern
//
// All cleanup functions handle errors gracefully and use transactions where
// appropriate to ensure atomic operations.

// CleanupConversation deletes a conversation and all related data
// This includes:
// - Outbox entries for messages in the conversation (manual deletion)
// - Messages in the conversation (manual deletion - FK doesn't have CASCADE)
// - Conversation participants (CASCADE via FK on conversation_participants.conversation_id)
// - The conversation itself
func CleanupConversation(ctx context.Context, db *pgxpool.Pool, conversationID string) error {
	// Start a transaction to ensure all deletions happen atomically
	tx, err := db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback(ctx) // Rollback if we don't commit

	// First, delete outbox entries for messages in this conversation
	// We need to do this manually because outbox doesn't have a FK to messages
	deleteOutboxQuery := `
		DELETE FROM outbox
		WHERE aggregate_type = 'message'
		AND aggregate_id IN (
			SELECT id FROM messages WHERE conversation_id = $1
		)
	`
	if _, err := tx.Exec(ctx, deleteOutboxQuery, conversationID); err != nil {
		return fmt.Errorf("failed to delete outbox entries: %w", err)
	}

	// Delete messages in the conversation
	// The FK constraint doesn't have ON DELETE CASCADE, so we need to delete manually
	deleteMessagesQuery := `DELETE FROM messages WHERE conversation_id = $1`
	if _, err := tx.Exec(ctx, deleteMessagesQuery, conversationID); err != nil {
		return fmt.Errorf("failed to delete messages: %w", err)
	}

	// Delete conversation participants
	// This has CASCADE on the FK, but we'll delete explicitly for clarity
	deleteParticipantsQuery := `DELETE FROM conversation_participants WHERE conversation_id = $1`
	if _, err := tx.Exec(ctx, deleteParticipantsQuery, conversationID); err != nil {
		return fmt.Errorf("failed to delete conversation participants: %w", err)
	}

	// Finally, delete the conversation itself
	deleteConversationQuery := `DELETE FROM conversations WHERE id = $1`
	result, err := tx.Exec(ctx, deleteConversationQuery, conversationID)
	if err != nil {
		return fmt.Errorf("failed to delete conversation: %w", err)
	}

	// Check if conversation was actually deleted
	rowsAffected := result.RowsAffected()
	if rowsAffected == 0 {
		// Not an error - conversation might not exist, which is fine for cleanup
		// Just commit the transaction (other cleanup might have happened)
		if err := tx.Commit(ctx); err != nil {
			return fmt.Errorf("failed to commit transaction: %w", err)
		}
		return nil
	}

	// Commit the transaction
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("failed to commit transaction: %w", err)
	}

	return nil
}

// CleanupAllTestData truncates all tables to remove all test data
// This is useful for cleaning up between test runs or after a test suite completes
// Tables are truncated in reverse dependency order to avoid foreign key violations
func CleanupAllTestData(ctx context.Context, db *pgxpool.Pool) error {
	// Truncate tables in reverse dependency order
	// Using CASCADE to automatically handle dependent rows
	tables := []string{
		"outbox",                    // No dependencies
		"conversation_participants", // Depends on conversations
		"messages",                  // Depends on conversations
		"conversations",             // Base table
	}

	for _, table := range tables {
		query := fmt.Sprintf("TRUNCATE TABLE %s CASCADE", table)
		if _, err := db.Exec(ctx, query); err != nil {
			return fmt.Errorf("failed to truncate table %s: %w", table, err)
		}
	}

	return nil
}

// CleanupConversations deletes multiple conversations and their related data
// This is a convenience function for cleaning up multiple conversations at once
func CleanupConversations(ctx context.Context, db *pgxpool.Pool, conversationIDs []string) error {
	for _, conversationID := range conversationIDs {
		if err := CleanupConversation(ctx, db, conversationID); err != nil {
			// Log the error but continue with other conversations
			// Return the first error encountered
			return fmt.Errorf("failed to cleanup conversation %s: %w", conversationID, err)
		}
	}
	return nil
}

// CleanupMessage deletes a specific message and its outbox entry
// This is useful for cleaning up individual messages without deleting the entire conversation
func CleanupMessage(ctx context.Context, db *pgxpool.Pool, messageID string) error {
	tx, err := db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	// Delete outbox entry for this message
	deleteOutboxQuery := `
		DELETE FROM outbox
		WHERE aggregate_type = 'message'
		AND aggregate_id = $1
	`
	if _, err := tx.Exec(ctx, deleteOutboxQuery, messageID); err != nil {
		return fmt.Errorf("failed to delete outbox entry: %w", err)
	}

	// Delete the message
	deleteMessageQuery := `DELETE FROM messages WHERE id = $1`
	if _, err := tx.Exec(ctx, deleteMessageQuery, messageID); err != nil {
		return fmt.Errorf("failed to delete message: %w", err)
	}

	// Commit the transaction
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("failed to commit transaction: %w", err)
	}

	return nil
}

// CleanupRedisKeys deletes specific Redis keys
// This is useful for cleaning up idempotency keys or other Redis data
func CleanupRedisKeys(ctx context.Context, infra *TestInfrastructure, keys []string) error {
	if len(keys) == 0 {
		return nil
	}

	if err := infra.RedisClient.Del(ctx, keys...).Err(); err != nil {
		return fmt.Errorf("failed to delete Redis keys: %w", err)
	}

	return nil
}

// CleanupRedisPattern deletes Redis keys matching a pattern
// This is useful for cleaning up all keys with a specific prefix
func CleanupRedisPattern(ctx context.Context, infra *TestInfrastructure, pattern string) error {
	// Get all keys matching the pattern
	keys, err := infra.RedisClient.Keys(ctx, pattern).Result()
	if err != nil {
		return fmt.Errorf("failed to get Redis keys: %w", err)
	}

	if len(keys) == 0 {
		return nil
	}

	// Delete all matching keys
	if err := infra.RedisClient.Del(ctx, keys...).Err(); err != nil {
		return fmt.Errorf("failed to delete Redis keys: %w", err)
	}

	return nil
}

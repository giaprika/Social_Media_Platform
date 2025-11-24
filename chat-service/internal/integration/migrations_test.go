package integration

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestMigrations verifies that migrations run successfully and create expected schema
func TestMigrations(t *testing.T) {
	ctx := context.Background()

	// Verify that testInfra was set up (migrations run in TestMain)
	require.NotNil(t, testInfra, "test infrastructure should be initialized")
	require.NotNil(t, testInfra.DBPool, "database pool should be initialized")

	// Verify all expected tables exist
	expectedTables := []string{"conversations", "messages", "outbox", "conversation_participants"}

	for _, table := range expectedTables {
		var exists bool
		query := `
			SELECT EXISTS (
				SELECT FROM information_schema.tables 
				WHERE table_schema = 'public' 
				AND table_name = $1
			)
		`
		err := testInfra.DBPool.QueryRow(ctx, query, table).Scan(&exists)
		require.NoError(t, err, "should be able to query for table %s", table)
		assert.True(t, exists, "table %s should exist after migrations", table)
	}

	// Verify conversations table has expected columns
	t.Run("conversations table structure", func(t *testing.T) {
		expectedColumns := []string{"id", "created_at", "last_message_content", "last_message_at"}
		for _, column := range expectedColumns {
			var exists bool
			query := `
				SELECT EXISTS (
					SELECT FROM information_schema.columns 
					WHERE table_schema = 'public' 
					AND table_name = 'conversations'
					AND column_name = $1
				)
			`
			err := testInfra.DBPool.QueryRow(ctx, query, column).Scan(&exists)
			require.NoError(t, err, "should be able to query for column %s", column)
			assert.True(t, exists, "column %s should exist in conversations table", column)
		}
	})

	// Verify messages table has expected columns
	t.Run("messages table structure", func(t *testing.T) {
		expectedColumns := []string{"id", "conversation_id", "sender_id", "content", "created_at"}
		for _, column := range expectedColumns {
			var exists bool
			query := `
				SELECT EXISTS (
					SELECT FROM information_schema.columns 
					WHERE table_schema = 'public' 
					AND table_name = 'messages'
					AND column_name = $1
				)
			`
			err := testInfra.DBPool.QueryRow(ctx, query, column).Scan(&exists)
			require.NoError(t, err, "should be able to query for column %s", column)
			assert.True(t, exists, "column %s should exist in messages table", column)
		}
	})

	// Verify outbox table has expected columns
	t.Run("outbox table structure", func(t *testing.T) {
		expectedColumns := []string{"id", "aggregate_type", "aggregate_id", "payload", "created_at", "processed_at"}
		for _, column := range expectedColumns {
			var exists bool
			query := `
				SELECT EXISTS (
					SELECT FROM information_schema.columns 
					WHERE table_schema = 'public' 
					AND table_name = 'outbox'
					AND column_name = $1
				)
			`
			err := testInfra.DBPool.QueryRow(ctx, query, column).Scan(&exists)
			require.NoError(t, err, "should be able to query for column %s", column)
			assert.True(t, exists, "column %s should exist in outbox table", column)
		}
	})

	// Verify conversation_participants table has expected columns
	t.Run("conversation_participants table structure", func(t *testing.T) {
		expectedColumns := []string{"conversation_id", "user_id", "last_read_at", "joined_at"}
		for _, column := range expectedColumns {
			var exists bool
			query := `
				SELECT EXISTS (
					SELECT FROM information_schema.columns 
					WHERE table_schema = 'public' 
					AND table_name = 'conversation_participants'
					AND column_name = $1
				)
			`
			err := testInfra.DBPool.QueryRow(ctx, query, column).Scan(&exists)
			require.NoError(t, err, "should be able to query for column %s", column)
			assert.True(t, exists, "column %s should exist in conversation_participants table", column)
		}
	})

	// Verify indexes exist
	t.Run("indexes exist", func(t *testing.T) {
		expectedIndexes := []string{"idx_outbox_unprocessed", "idx_conversations_last_message_at"}
		for _, index := range expectedIndexes {
			var exists bool
			query := `
				SELECT EXISTS (
					SELECT FROM pg_indexes 
					WHERE schemaname = 'public' 
					AND indexname = $1
				)
			`
			err := testInfra.DBPool.QueryRow(ctx, query, index).Scan(&exists)
			require.NoError(t, err, "should be able to query for index %s", index)
			assert.True(t, exists, "index %s should exist", index)
		}
	})
}

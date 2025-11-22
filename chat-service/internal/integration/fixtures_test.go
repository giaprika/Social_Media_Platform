package integration

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// TestIDs holds unique UUIDs for a test run
type TestIDs struct {
	UserA          string
	UserB          string
	UserC          string
	ConversationAB string
	ConversationAC string
	ConversationBC string
}

// GenerateTestIDs creates a new set of unique UUIDs for test isolation
func GenerateTestIDs() *TestIDs {
	return &TestIDs{
		UserA:          uuid.New().String(),
		UserB:          uuid.New().String(),
		UserC:          uuid.New().String(),
		ConversationAB: uuid.New().String(),
		ConversationAC: uuid.New().String(),
		ConversationBC: uuid.New().String(),
	}
}

// TestUser represents a test user (simplified since we don't have a users table yet)
type TestUser struct {
	ID string
}

// TestConversation represents a test conversation with participants
type TestConversation struct {
	ID           string
	Participants []string
	CreatedAt    time.Time
}

// TestMessage represents a test message
type TestMessage struct {
	ID             string
	ConversationID string
	SenderID       string
	Content        string
	CreatedAt      time.Time
}

// CreateTestUser creates a test user (currently just returns a user with the given ID)
// This is a placeholder for when we have a users table
func CreateTestUser(ctx context.Context, db *pgxpool.Pool, userID string) (*TestUser, error) {
	// For now, we don't have a users table, so we just return a TestUser struct
	// In the future, this would insert into a users table
	return &TestUser{
		ID: userID,
	}, nil
}

// CreateTestConversation creates a conversation and adds participants
func CreateTestConversation(ctx context.Context, db *pgxpool.Pool, conversationID string, participantIDs []string) (*TestConversation, error) {
	// Start a transaction
	tx, err := db.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	// Insert conversation
	var createdAt time.Time
	err = tx.QueryRow(ctx, `
		INSERT INTO conversations (id, created_at)
		VALUES ($1, NOW())
		RETURNING created_at
	`, conversationID).Scan(&createdAt)
	if err != nil {
		return nil, fmt.Errorf("failed to insert conversation: %w", err)
	}

	// Insert participants with last_read_at set to 1 hour ago
	// This ensures that test messages created with CreateMultipleTestMessages
	// (which start from 10 minutes ago) will be unread
	lastReadAt := time.Now().Add(-1 * time.Hour)
	for _, participantID := range participantIDs {
		_, err = tx.Exec(ctx, `
			INSERT INTO conversation_participants (conversation_id, user_id, joined_at, last_read_at)
			VALUES ($1, $2, NOW(), $3)
		`, conversationID, participantID, lastReadAt)
		if err != nil {
			return nil, fmt.Errorf("failed to insert participant %s: %w", participantID, err)
		}
	}

	// Commit transaction
	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("failed to commit transaction: %w", err)
	}

	return &TestConversation{
		ID:           conversationID,
		Participants: participantIDs,
		CreatedAt:    createdAt,
	}, nil
}

// CreateTestMessage creates a message directly in the database
func CreateTestMessage(ctx context.Context, db *pgxpool.Pool, messageID, conversationID, senderID, content string) (*TestMessage, error) {
	// Start a transaction
	tx, err := db.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	// Insert message
	var createdAt time.Time
	err = tx.QueryRow(ctx, `
		INSERT INTO messages (id, conversation_id, sender_id, content, created_at)
		VALUES ($1, $2, $3, $4, NOW())
		RETURNING created_at
	`, messageID, conversationID, senderID, content).Scan(&createdAt)
	if err != nil {
		return nil, fmt.Errorf("failed to insert message: %w", err)
	}

	// Update conversation's last_message_content and last_message_at
	_, err = tx.Exec(ctx, `
		UPDATE conversations
		SET last_message_content = $1, last_message_at = $2
		WHERE id = $3
	`, content, createdAt, conversationID)
	if err != nil {
		return nil, fmt.Errorf("failed to update conversation: %w", err)
	}

	// Commit transaction
	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("failed to commit transaction: %w", err)
	}

	return &TestMessage{
		ID:             messageID,
		ConversationID: conversationID,
		SenderID:       senderID,
		Content:        content,
		CreatedAt:      createdAt,
	}, nil
}

// CreateTestMessageWithTimestamp creates a message with a specific timestamp
// Useful for testing pagination and ordering
func CreateTestMessageWithTimestamp(ctx context.Context, db *pgxpool.Pool, messageID, conversationID, senderID, content string, createdAt time.Time) (*TestMessage, error) {
	// Start a transaction
	tx, err := db.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	// Insert message with specific timestamp
	_, err = tx.Exec(ctx, `
		INSERT INTO messages (id, conversation_id, sender_id, content, created_at)
		VALUES ($1, $2, $3, $4, $5)
	`, messageID, conversationID, senderID, content, createdAt)
	if err != nil {
		return nil, fmt.Errorf("failed to insert message: %w", err)
	}

	// Update conversation's last_message_content and last_message_at
	_, err = tx.Exec(ctx, `
		UPDATE conversations
		SET last_message_content = $1, last_message_at = $2
		WHERE id = $3
	`, content, createdAt, conversationID)
	if err != nil {
		return nil, fmt.Errorf("failed to update conversation: %w", err)
	}

	// Commit transaction
	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("failed to commit transaction: %w", err)
	}

	return &TestMessage{
		ID:             messageID,
		ConversationID: conversationID,
		SenderID:       senderID,
		Content:        content,
		CreatedAt:      createdAt,
	}, nil
}

// CreateMultipleTestMessages creates multiple messages for a conversation
// This is a convenience helper for tests that need multiple messages
func CreateMultipleTestMessages(ctx context.Context, db *pgxpool.Pool, conversationID, senderID string, count int) ([]*TestMessage, error) {
	messages := make([]*TestMessage, 0, count)
	// Start from 10 minutes ago to ensure messages are in the past
	// This allows MarkAsRead with NOW() to work correctly
	baseTime := time.Now().Add(-10 * time.Minute)
	
	for i := 0; i < count; i++ {
		messageID := uuid.New().String()
		content := fmt.Sprintf("Test message %d", i+1)
		
		// Use explicit timestamps with 1 second intervals to ensure ordering
		createdAt := baseTime.Add(time.Duration(i) * time.Second)
		
		msg, err := CreateTestMessageWithTimestamp(ctx, db, messageID, conversationID, senderID, content, createdAt)
		if err != nil {
			return nil, fmt.Errorf("failed to create message %d: %w", i, err)
		}
		
		messages = append(messages, msg)
	}
	
	return messages, nil
}

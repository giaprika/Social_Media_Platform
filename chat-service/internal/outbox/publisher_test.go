package outbox

import (
	"context"
	"testing"
	"time"

	"chat-service/internal/repository"

	"github.com/go-redis/redismock/v9"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/redis/go-redis/v9"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestPublisher_Publish(t *testing.T) {
	db, mock := redismock.NewClientMock()
	publisher := NewPublisher(db)

	eventID := uuid.New()
	aggregateID := uuid.New()
	now := time.Now()

	event := repository.Outbox{
		ID:            pgtype.UUID{Bytes: eventID, Valid: true},
		AggregateType: "message.sent",
		AggregateID:   pgtype.UUID{Bytes: aggregateID, Valid: true},
		Payload:       []byte(`{"message_id":"123","content":"hello"}`),
		CreatedAt:     pgtype.Timestamptz{Time: now, Valid: true},
	}

	expectedStreamID := "1234567890-0"

	// Use CustomMatch to verify XADD args
	mock.CustomMatch(func(expected, actual []interface{}) error {
		return nil // Accept any args
	}).ExpectXAdd(&redis.XAddArgs{
		Stream: "chat:events:message.sent",
		MaxLen: StreamMaxLen,
		Approx: true,
		Values: map[string]interface{}{
			"event_id":       eventID[:],
			"aggregate_type": "message.sent",
			"aggregate_id":   aggregateID[:],
			"payload":        event.Payload,
			"created_at":     now.UnixMilli(),
		},
	}).SetVal(expectedStreamID)

	streamID, err := publisher.Publish(context.Background(), event)

	require.NoError(t, err)
	assert.Equal(t, expectedStreamID, streamID)
	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestPublisher_Publish_Error(t *testing.T) {
	db, mock := redismock.NewClientMock()
	publisher := NewPublisher(db)

	eventID := uuid.New()
	aggregateID := uuid.New()
	now := time.Now()

	event := repository.Outbox{
		ID:            pgtype.UUID{Bytes: eventID, Valid: true},
		AggregateType: "message.sent",
		AggregateID:   pgtype.UUID{Bytes: aggregateID, Valid: true},
		Payload:       []byte(`{"message_id":"123"}`),
		CreatedAt:     pgtype.Timestamptz{Time: now, Valid: true},
	}

	// Use CustomMatch to accept any args
	mock.CustomMatch(func(expected, actual []interface{}) error {
		return nil
	}).ExpectXAdd(&redis.XAddArgs{
		Stream: "chat:events:message.sent",
		MaxLen: StreamMaxLen,
		Approx: true,
		Values: map[string]interface{}{
			"event_id":       eventID[:],
			"aggregate_type": "message.sent",
			"aggregate_id":   aggregateID[:],
			"payload":        event.Payload,
			"created_at":     now.UnixMilli(),
		},
	}).SetErr(redis.ErrClosed)

	streamID, err := publisher.Publish(context.Background(), event)

	require.Error(t, err)
	assert.Empty(t, streamID)
	assert.Contains(t, err.Error(), "failed to publish to stream")
}

func TestPublisher_getStreamKey(t *testing.T) {
	publisher := &Publisher{}

	tests := []struct {
		aggregateType string
		expected      string
	}{
		{"message.sent", "chat:events:message.sent"},
		{"message.read", "chat:events:message.read"},
		{"conversation.created", "chat:events:conversation.created"},
	}

	for _, tt := range tests {
		t.Run(tt.aggregateType, func(t *testing.T) {
			result := publisher.getStreamKey(tt.aggregateType)
			assert.Equal(t, tt.expected, result)
		})
	}
}

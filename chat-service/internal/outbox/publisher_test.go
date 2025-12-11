package outbox

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"chat-service/internal/repository"

	"github.com/go-redis/redismock/v9"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
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

	// Build expected payload
	expectedPayload := EventPayload{
		EventID:       event.ID.String(),
		AggregateType: event.AggregateType,
		AggregateID:   event.AggregateID.String(),
		Payload:       event.Payload,
		CreatedAt:     now.UnixMilli(),
	}
	expectedJSON, _ := json.Marshal(expectedPayload)

	// Expect PUBLISH command
	mock.ExpectPublish(ChannelName, expectedJSON).SetVal(1)

	result, err := publisher.Publish(context.Background(), event)

	require.NoError(t, err)
	assert.Equal(t, "1", result) // 1 subscriber received the message
	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestPublisher_Publish_NoSubscribers(t *testing.T) {
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

	expectedPayload := EventPayload{
		EventID:       event.ID.String(),
		AggregateType: event.AggregateType,
		AggregateID:   event.AggregateID.String(),
		Payload:       event.Payload,
		CreatedAt:     now.UnixMilli(),
	}
	expectedJSON, _ := json.Marshal(expectedPayload)

	// Expect PUBLISH command - returns 0 when no subscribers
	mock.ExpectPublish(ChannelName, expectedJSON).SetVal(0)

	result, err := publisher.Publish(context.Background(), event)

	require.NoError(t, err)
	assert.Equal(t, "0", result) // 0 subscribers
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

	expectedPayload := EventPayload{
		EventID:       event.ID.String(),
		AggregateType: event.AggregateType,
		AggregateID:   event.AggregateID.String(),
		Payload:       event.Payload,
		CreatedAt:     now.UnixMilli(),
	}
	expectedJSON, _ := json.Marshal(expectedPayload)

	// Expect PUBLISH command to fail
	mock.ExpectPublish(ChannelName, expectedJSON).SetErr(assert.AnError)

	result, err := publisher.Publish(context.Background(), event)

	require.Error(t, err)
	assert.Empty(t, result)
	assert.Contains(t, err.Error(), "failed to publish to channel")
}

func TestEventPayload_JSON(t *testing.T) {
	payload := EventPayload{
		EventID:       "test-event-id",
		AggregateType: "message.sent",
		AggregateID:   "test-aggregate-id",
		Payload:       json.RawMessage(`{"content":"hello"}`),
		CreatedAt:     1234567890,
	}

	data, err := json.Marshal(payload)
	require.NoError(t, err)

	var decoded EventPayload
	err = json.Unmarshal(data, &decoded)
	require.NoError(t, err)

	assert.Equal(t, payload.EventID, decoded.EventID)
	assert.Equal(t, payload.AggregateType, decoded.AggregateType)
	assert.Equal(t, payload.AggregateID, decoded.AggregateID)
	assert.Equal(t, payload.CreatedAt, decoded.CreatedAt)
	assert.JSONEq(t, `{"content":"hello"}`, string(decoded.Payload))
}

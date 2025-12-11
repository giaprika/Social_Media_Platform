package outbox

import (
	"context"
	"encoding/json"
	"fmt"

	"chat-service/internal/repository"

	"github.com/redis/go-redis/v9"
)

const (
	// ChannelName is the Redis Pub/Sub channel for chat events.
	ChannelName = "chat:events"
)

// EventPayload represents the JSON payload published to Redis Pub/Sub.
type EventPayload struct {
	EventID       string `json:"event_id"`
	AggregateType string `json:"aggregate_type"`
	AggregateID   string `json:"aggregate_id"`
	Payload       json.RawMessage `json:"payload"`
	CreatedAt     int64  `json:"created_at"`
}

// Publisher publishes outbox events to Redis Pub/Sub.
type Publisher struct {
	redis *redis.Client
}

// NewPublisher creates a new Redis Pub/Sub publisher.
func NewPublisher(redisClient *redis.Client) *Publisher {
	return &Publisher{
		redis: redisClient,
	}
}

// Publish publishes an outbox event to the Redis Pub/Sub channel.
// Returns the number of subscribers that received the message.
func (p *Publisher) Publish(ctx context.Context, event repository.Outbox) (string, error) {
	payload := EventPayload{
		EventID:       event.ID.String(),
		AggregateType: event.AggregateType,
		AggregateID:   event.AggregateID.String(),
		Payload:       event.Payload,
		CreatedAt:     event.CreatedAt.Time.UnixMilli(),
	}

	jsonData, err := json.Marshal(payload)
	if err != nil {
		return "", fmt.Errorf("failed to marshal event payload: %w", err)
	}

	result, err := p.redis.Publish(ctx, ChannelName, jsonData).Result()
	if err != nil {
		return "", fmt.Errorf("failed to publish to channel %s: %w", ChannelName, err)
	}

	return fmt.Sprintf("%d", result), nil
}

// PublisherInterface defines the interface for event publishing (for testing).
type PublisherInterface interface {
	Publish(ctx context.Context, event repository.Outbox) (string, error)
}

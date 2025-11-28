package outbox

import (
	"context"
	"fmt"

	"chat-service/internal/repository"

	"github.com/redis/go-redis/v9"
)

const (
	// StreamMaxLen is the maximum length of the Redis Stream (approximate trimming).
	StreamMaxLen int64 = 10000

	// StreamKeyPrefix is the prefix for Redis Stream keys.
	StreamKeyPrefix = "chat:events:"
)

// Publisher publishes outbox events to Redis Streams.
type Publisher struct {
	redis *redis.Client
}

// NewPublisher creates a new Redis Streams publisher.
func NewPublisher(redisClient *redis.Client) *Publisher {
	return &Publisher{
		redis: redisClient,
	}
}

// Publish publishes an outbox event to the appropriate Redis Stream.
// Stream key format: chat:events:{aggregate_type} (e.g., chat:events:message.sent)
// Returns the stream entry ID on success.
func (p *Publisher) Publish(ctx context.Context, event repository.Outbox) (string, error) {
	streamKey := p.getStreamKey(event.AggregateType)

	// Build the message fields
	values := map[string]interface{}{
		"event_id":       event.ID.Bytes[:],
		"aggregate_type": event.AggregateType,
		"aggregate_id":   event.AggregateID.Bytes[:],
		"payload":        event.Payload,
		"created_at":     event.CreatedAt.Time.UnixMilli(),
	}

	// XADD with MAXLEN ~ 10000 (approximate trimming for performance)
	result, err := p.redis.XAdd(ctx, &redis.XAddArgs{
		Stream: streamKey,
		MaxLen: StreamMaxLen,
		Approx: true, // Use ~ for approximate trimming (better performance)
		Values: values,
	}).Result()

	if err != nil {
		return "", fmt.Errorf("failed to publish to stream %s: %w", streamKey, err)
	}

	return result, nil
}

// getStreamKey returns the Redis Stream key for a given aggregate type.
func (p *Publisher) getStreamKey(aggregateType string) string {
	return StreamKeyPrefix + aggregateType
}

// PublisherInterface defines the interface for event publishing (for testing).
type PublisherInterface interface {
	Publish(ctx context.Context, event repository.Outbox) (string, error)
}

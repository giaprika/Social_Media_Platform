package ws

import (
	"context"
	"encoding/json"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
)

const (
	// ChannelName is the Redis Pub/Sub channel for chat events.
	ChannelName = "chat:events"

	// Reconnection settings
	initialReconnectDelay = 1 * time.Second
	maxReconnectDelay     = 30 * time.Second
	reconnectBackoffMulti = 2
)

// EventPayload represents the JSON payload received from Redis Pub/Sub.
type EventPayload struct {
	EventID       string          `json:"event_id"`
	AggregateType string          `json:"aggregate_type"`
	AggregateID   string          `json:"aggregate_id"`
	Payload       json.RawMessage `json:"payload"`
	CreatedAt     int64           `json:"created_at"`
}

// MessagePayload represents the inner payload for message events.
type MessagePayload struct {
	MessageID      string `json:"message_id"`
	ConversationID string `json:"conversation_id"`
	SenderID       string `json:"sender_id"`
	Content        string `json:"content"`
	CreatedAt      int64  `json:"created_at"`
}

// EventHandler is called when an event is received from Redis Pub/Sub.
type EventHandler func(ctx context.Context, event EventPayload)

// Subscriber subscribes to Redis Pub/Sub channel and processes events.
type Subscriber struct {
	redis   *redis.Client
	logger  *zap.Logger
	handler EventHandler
	pubsub  *redis.PubSub

	mu      sync.Mutex
	running bool
	cancel  context.CancelFunc
}

// NewSubscriber creates a new Redis Pub/Sub subscriber.
func NewSubscriber(redisClient *redis.Client, logger *zap.Logger, handler EventHandler) *Subscriber {
	return &Subscriber{
		redis:   redisClient,
		logger:  logger,
		handler: handler,
	}
}


// Start begins listening to the Redis Pub/Sub channel.
// This method is non-blocking and starts a goroutine with auto-reconnection.
func (s *Subscriber) Start(ctx context.Context) error {
	s.mu.Lock()
	if s.running {
		s.mu.Unlock()
		return nil
	}
	s.running = true
	s.mu.Unlock()

	// Create cancellable context
	ctx, cancel := context.WithCancel(ctx)
	s.cancel = cancel

	// Initial subscription
	if err := s.subscribe(ctx); err != nil {
		s.mu.Lock()
		s.running = false
		s.mu.Unlock()
		return err
	}

	// Start listening goroutine with auto-reconnection
	go s.listenWithReconnect(ctx)

	return nil
}

// subscribe creates a new subscription to the Redis Pub/Sub channel.
func (s *Subscriber) subscribe(ctx context.Context) error {
	s.pubsub = s.redis.Subscribe(ctx, ChannelName)

	// Wait for subscription confirmation
	_, err := s.pubsub.Receive(ctx)
	if err != nil {
		return err
	}

	s.logger.Info("Subscribed to Redis Pub/Sub channel", zap.String("channel", ChannelName))
	return nil
}

// listenWithReconnect continuously reads messages and auto-reconnects on failure.
func (s *Subscriber) listenWithReconnect(ctx context.Context) {
	reconnectDelay := initialReconnectDelay

	for {
		// Check if we should stop
		select {
		case <-ctx.Done():
			s.logger.Info("Subscriber context cancelled, stopping listener")
			return
		default:
		}

		// Listen until channel closes
		s.listen(ctx)

		// Check again if we should stop (context might have been cancelled)
		select {
		case <-ctx.Done():
			s.logger.Info("Subscriber context cancelled during reconnect")
			return
		default:
		}

		// Channel closed unexpectedly, attempt reconnection
		s.logger.Warn("Pub/Sub connection lost, attempting reconnection",
			zap.Duration("delay", reconnectDelay),
		)

		// Wait before reconnecting with backoff
		select {
		case <-ctx.Done():
			return
		case <-time.After(reconnectDelay):
		}

		// Close old pubsub if exists
		if s.pubsub != nil {
			_ = s.pubsub.Close()
		}

		// Attempt to reconnect
		if err := s.subscribe(ctx); err != nil {
			s.logger.Error("Failed to reconnect to Redis Pub/Sub",
				zap.Error(err),
				zap.Duration("next_retry", reconnectDelay),
			)

			// Increase backoff delay
			reconnectDelay *= reconnectBackoffMulti
			if reconnectDelay > maxReconnectDelay {
				reconnectDelay = maxReconnectDelay
			}
			continue
		}

		// Successfully reconnected, reset delay
		s.logger.Info("Successfully reconnected to Redis Pub/Sub")
		reconnectDelay = initialReconnectDelay
	}
}

// listen reads messages from the Pub/Sub channel until it closes.
func (s *Subscriber) listen(ctx context.Context) {
	ch := s.pubsub.Channel()

	for {
		select {
		case <-ctx.Done():
			return

		case msg, ok := <-ch:
			if !ok {
				// Channel closed, return to trigger reconnection
				s.logger.Info("Pub/Sub channel closed")
				return
			}

			s.processMessage(ctx, msg)
		}
	}
}

// processMessage parses and handles a single message.
func (s *Subscriber) processMessage(ctx context.Context, msg *redis.Message) {
	var event EventPayload
	if err := json.Unmarshal([]byte(msg.Payload), &event); err != nil {
		s.logger.Error("Failed to unmarshal event",
			zap.Error(err),
			zap.String("payload", msg.Payload),
		)
		return
	}

	s.logger.Debug("Received event from Pub/Sub",
		zap.String("event_id", event.EventID),
		zap.String("aggregate_type", event.AggregateType),
		zap.String("aggregate_id", event.AggregateID),
	)

	// Call the handler
	if s.handler != nil {
		s.handler(ctx, event)
	}
}

// Stop gracefully stops the subscriber.
func (s *Subscriber) Stop() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if !s.running {
		return nil
	}

	s.running = false

	if s.cancel != nil {
		s.cancel()
	}

	if s.pubsub != nil {
		if err := s.pubsub.Close(); err != nil {
			s.logger.Error("Failed to close Pub/Sub", zap.Error(err))
			return err
		}
	}

	s.logger.Info("Subscriber stopped")
	return nil
}

// IsRunning returns whether the subscriber is currently running.
func (s *Subscriber) IsRunning() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.running
}

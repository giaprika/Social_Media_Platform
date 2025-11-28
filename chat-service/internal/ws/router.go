package ws

import (
	"context"
	"encoding/json"

	"go.uber.org/zap"
)

// InnerMessagePayload represents the inner payload containing receiver_ids.
// Used for partial decoding to extract routing information efficiently.
type InnerMessagePayload struct {
	EventType      string   `json:"event_type"`
	MessageID      string   `json:"message_id"`
	ConversationID string   `json:"conversation_id"`
	SenderID       string   `json:"sender_id"`
	ReceiverIDs    []string `json:"receiver_ids"`
	Content        string   `json:"content"`
	CreatedAt      string   `json:"created_at"`
}

// RouterMetrics tracks routing statistics.
type RouterMetrics interface {
	IncMessagesSent()
	IncMessagesDropped() // Real errors: channel full, write failed
	// Note: "User not on this gateway" is NOT counted - it's expected in multi-gateway setup
}

// Router handles message routing from Redis Pub/Sub to WebSocket clients.
// It performs local filtering - checking if receivers are connected to this gateway.
type Router struct {
	manager *ConnectionManager
	logger  *zap.Logger
	metrics RouterMetrics
}

// NewRouter creates a new message router.
func NewRouter(manager *ConnectionManager, logger *zap.Logger, metrics RouterMetrics) *Router {
	return &Router{
		manager: manager,
		logger:  logger,
		metrics: metrics,
	}
}

// HandleEvent processes an event received from Redis Pub/Sub.
// It extracts receiver_ids and dispatches to connected clients.
func (r *Router) HandleEvent(ctx context.Context, event EventPayload) {
	// Only handle message events
	if event.AggregateType != "message" {
		r.logger.Debug("Ignoring non-message event",
			zap.String("event_id", event.EventID),
			zap.String("aggregate_type", event.AggregateType),
		)
		return
	}

	// Parse inner payload to get receiver_ids
	var innerPayload InnerMessagePayload
	if err := json.Unmarshal(event.Payload, &innerPayload); err != nil {
		r.logger.Error("Failed to unmarshal inner payload",
			zap.String("event_id", event.EventID),
			zap.Error(err),
		)
		return
	}

	// Prepare the message to send to clients (full event)
	messageJSON, err := json.Marshal(event)
	if err != nil {
		r.logger.Error("Failed to marshal event for WebSocket",
			zap.String("event_id", event.EventID),
			zap.Error(err),
		)
		return
	}

	// Route to each receiver
	for _, receiverID := range innerPayload.ReceiverIDs {
		r.dispatchToUser(receiverID, messageJSON, event.EventID)
	}
}

// dispatchToUser attempts to send a message to a specific user.
// If the user is not connected to this gateway, the message is ignored (local filtering).
func (r *Router) dispatchToUser(userID string, message []byte, eventID string) {
	// Local lookup - check if user is connected to THIS gateway
	client, ok := r.manager.Get(userID)
	if !ok {
		// User not connected to this gateway - this is EXPECTED in multi-gateway setup
		// Don't count as "dropped" - it's just local filtering (ignore silently)
		r.logger.Debug("User not connected to this gateway, ignoring",
			zap.String("user_id", userID),
			zap.String("event_id", eventID),
		)
		// NO metric increment here - not an error!
		return
	}

	// Check if client is closed
	if client.IsClosed() {
		r.logger.Debug("Client connection closed, skipping",
			zap.String("user_id", userID),
			zap.String("event_id", eventID),
		)
		// Don't remove here - let the readPump/writePump handle cleanup
		if r.metrics != nil {
			r.metrics.IncMessagesDropped()
		}
		return
	}

	// Dispatch message through the client's send channel (thread-safe)
	// The writePump goroutine will handle actual WebSocket write
	select {
	case client.Send <- message:
		r.logger.Debug("Message dispatched to user",
			zap.String("user_id", userID),
			zap.String("event_id", eventID),
		)
		if r.metrics != nil {
			r.metrics.IncMessagesSent()
		}
	default:
		// Channel full - client is a "slow client" (network lag, app crashed but socket not closed)
		// MUST forcefully close this connection to prevent memory leak
		r.logger.Warn("Slow client detected, closing connection",
			zap.String("user_id", userID),
			zap.String("event_id", eventID),
		)
		if r.metrics != nil {
			r.metrics.IncMessagesDropped()
		}
		// Forcefully close the connection - this will trigger cleanup in readPump/writePump
		r.manager.Remove(userID, client)
	}
}

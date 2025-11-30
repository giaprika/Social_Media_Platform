package ws

import "time"

// Event types sent to WebSocket clients
const (
	// EventTypeWelcome is sent when a client connects successfully.
	// Client should use server_time to sync and fetch missed messages.
	EventTypeWelcome = "welcome"

	// EventTypeReconnected is sent when a client reconnects (had previous connection).
	// Client MUST call HTTP API to fetch messages since last_seen_at.
	EventTypeReconnected = "reconnected"

	// EventTypeMessage is for chat message events from Redis Pub/Sub.
	EventTypeMessage = "message"
)

// WelcomeEvent is sent to client upon successful WebSocket connection.
type WelcomeEvent struct {
	Type       string `json:"type"`
	ServerTime int64  `json:"server_time"` // Unix timestamp in milliseconds
	UserID     string `json:"user_id"`
	InstanceID string `json:"instance_id"` // Gateway instance for debugging
}

// ReconnectedEvent is sent when client reconnects after a disconnect.
// Client should fetch messages from last_seen_at to now.
type ReconnectedEvent struct {
	Type           string `json:"type"`
	ServerTime     int64  `json:"server_time"`      // Current server time (ms)
	UserID         string `json:"user_id"`
	PreviousConnAt int64  `json:"previous_conn_at"` // When previous connection was established (ms)
	GapDuration    int64  `json:"gap_duration_ms"`  // Duration of disconnect in milliseconds
	InstanceID     string `json:"instance_id"`
}

// NewWelcomeEvent creates a welcome event for a new connection.
func NewWelcomeEvent(userID string) *WelcomeEvent {
	return &WelcomeEvent{
		Type:       EventTypeWelcome,
		ServerTime: time.Now().UnixMilli(),
		UserID:     userID,
		InstanceID: GetInstanceID(),
	}
}

// NewReconnectedEvent creates a reconnected event with gap information.
func NewReconnectedEvent(userID string, previousConnAt time.Time) *ReconnectedEvent {
	now := time.Now()
	return &ReconnectedEvent{
		Type:           EventTypeReconnected,
		ServerTime:     now.UnixMilli(),
		UserID:         userID,
		PreviousConnAt: previousConnAt.UnixMilli(),
		GapDuration:    now.Sub(previousConnAt).Milliseconds(),
		InstanceID:     GetInstanceID(),
	}
}

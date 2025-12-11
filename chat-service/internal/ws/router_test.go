package ws

import (
	"context"
	"encoding/json"
	"sync/atomic"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"
)

// mockMetrics implements RouterMetrics for testing
type mockMetrics struct {
	messagesSent    int64
	messagesDropped int64
}

func (m *mockMetrics) IncMessagesSent() {
	atomic.AddInt64(&m.messagesSent, 1)
}

func (m *mockMetrics) IncMessagesDropped() {
	atomic.AddInt64(&m.messagesDropped, 1)
}

func (m *mockMetrics) GetMessagesSent() int64 {
	return atomic.LoadInt64(&m.messagesSent)
}

func (m *mockMetrics) GetMessagesDropped() int64 {
	return atomic.LoadInt64(&m.messagesDropped)
}

func TestRouter_HandleEvent_MessageRouting(t *testing.T) {
	logger := zap.NewNop()
	manager := NewConnectionManager()
	metrics := &mockMetrics{}
	router := NewRouter(manager, logger, metrics)

	// Create mock clients
	user1ID := "user-1"
	user2ID := "user-2"
	user3ID := "user-3" // Not connected

	client1 := &Client{Send: make(chan []byte, 10)}
	client2 := &Client{Send: make(chan []byte, 10)}

	manager.Add(user1ID, client1)
	manager.Add(user2ID, client2)

	// Create event with receiver_ids
	innerPayload := InnerMessagePayload{
		EventType:      "message.sent",
		MessageID:      "msg-123",
		ConversationID: "conv-456",
		SenderID:       "sender-789",
		ReceiverIDs:    []string{user1ID, user2ID, user3ID},
		Content:        "Hello!",
		CreatedAt:      time.Now().Format(time.RFC3339),
	}
	innerJSON, _ := json.Marshal(innerPayload)

	event := EventPayload{
		EventID:       "event-001",
		AggregateType: "message",
		AggregateID:   "msg-123",
		Payload:       innerJSON,
		CreatedAt:     time.Now().UnixMilli(),
	}

	// Handle the event
	router.HandleEvent(context.Background(), event)

	// Verify user1 received the message
	select {
	case msg := <-client1.Send:
		var received EventPayload
		err := json.Unmarshal(msg, &received)
		require.NoError(t, err)
		assert.Equal(t, event.EventID, received.EventID)
	case <-time.After(100 * time.Millisecond):
		t.Fatal("user1 did not receive message")
	}

	// Verify user2 received the message
	select {
	case msg := <-client2.Send:
		var received EventPayload
		err := json.Unmarshal(msg, &received)
		require.NoError(t, err)
		assert.Equal(t, event.EventID, received.EventID)
	case <-time.After(100 * time.Millisecond):
		t.Fatal("user2 did not receive message")
	}

	// Verify metrics
	assert.Equal(t, int64(2), metrics.GetMessagesSent())
	assert.Equal(t, int64(0), metrics.GetMessagesDropped()) // user3 not connected is NOT counted as dropped
}

func TestRouter_HandleEvent_IgnoresNonMessageEvents(t *testing.T) {
	logger := zap.NewNop()
	manager := NewConnectionManager()
	metrics := &mockMetrics{}
	router := NewRouter(manager, logger, metrics)

	// Create a connected client
	userID := "user-1"
	client := &Client{Send: make(chan []byte, 10)}
	manager.Add(userID, client)

	// Create non-message event
	event := EventPayload{
		EventID:       "event-001",
		AggregateType: "conversation", // Not "message"
		AggregateID:   "conv-123",
		Payload:       []byte(`{}`),
		CreatedAt:     time.Now().UnixMilli(),
	}

	// Handle the event
	router.HandleEvent(context.Background(), event)

	// Verify no message was sent
	select {
	case <-client.Send:
		t.Fatal("should not receive message for non-message event")
	case <-time.After(50 * time.Millisecond):
		// Expected - no message
	}

	assert.Equal(t, int64(0), metrics.GetMessagesSent())
	assert.Equal(t, int64(0), metrics.GetMessagesDropped())
}

func TestRouter_HandleEvent_ClosedClient(t *testing.T) {
	logger := zap.NewNop()
	manager := NewConnectionManager()
	metrics := &mockMetrics{}
	router := NewRouter(manager, logger, metrics)

	// Create a closed client
	userID := "user-1"
	client := &Client{Send: make(chan []byte, 10)}
	client.Close() // Close the client
	manager.Add(userID, client)

	// Create event
	innerPayload := InnerMessagePayload{
		ReceiverIDs: []string{userID},
	}
	innerJSON, _ := json.Marshal(innerPayload)

	event := EventPayload{
		EventID:       "event-001",
		AggregateType: "message",
		Payload:       innerJSON,
	}

	// Handle the event
	router.HandleEvent(context.Background(), event)

	// Verify message was dropped
	assert.Equal(t, int64(0), metrics.GetMessagesSent())
	assert.Equal(t, int64(1), metrics.GetMessagesDropped())
}

func TestRouter_HandleEvent_FullSendChannel(t *testing.T) {
	logger := zap.NewNop()
	manager := NewConnectionManager()
	metrics := &mockMetrics{}
	router := NewRouter(manager, logger, metrics)

	// Create client with full channel (size 1)
	userID := "user-1"
	client := &Client{Send: make(chan []byte, 1)}
	client.Send <- []byte("blocking message") // Fill the channel
	manager.Add(userID, client)

	// Create event
	innerPayload := InnerMessagePayload{
		ReceiverIDs: []string{userID},
	}
	innerJSON, _ := json.Marshal(innerPayload)

	event := EventPayload{
		EventID:       "event-001",
		AggregateType: "message",
		Payload:       innerJSON,
	}

	// Handle the event - should drop because channel is full AND close connection
	router.HandleEvent(context.Background(), event)

	// Verify message was dropped
	assert.Equal(t, int64(0), metrics.GetMessagesSent())
	assert.Equal(t, int64(1), metrics.GetMessagesDropped())

	// Verify client was removed (slow client handling)
	_, exists := manager.Get(userID)
	assert.False(t, exists, "slow client should be removed from manager")
}

func TestRouter_HandleEvent_InvalidPayload(t *testing.T) {
	logger := zap.NewNop()
	manager := NewConnectionManager()
	metrics := &mockMetrics{}
	router := NewRouter(manager, logger, metrics)

	// Create event with invalid inner payload
	event := EventPayload{
		EventID:       "event-001",
		AggregateType: "message",
		Payload:       []byte("invalid json"),
	}

	// Should not panic
	router.HandleEvent(context.Background(), event)

	assert.Equal(t, int64(0), metrics.GetMessagesSent())
	assert.Equal(t, int64(0), metrics.GetMessagesDropped())
}

func TestRouter_HandleEvent_EmptyReceiverIDs(t *testing.T) {
	logger := zap.NewNop()
	manager := NewConnectionManager()
	metrics := &mockMetrics{}
	router := NewRouter(manager, logger, metrics)

	// Create event with empty receiver_ids
	innerPayload := InnerMessagePayload{
		ReceiverIDs: []string{},
	}
	innerJSON, _ := json.Marshal(innerPayload)

	event := EventPayload{
		EventID:       "event-001",
		AggregateType: "message",
		Payload:       innerJSON,
	}

	// Handle the event
	router.HandleEvent(context.Background(), event)

	// No messages sent or dropped
	assert.Equal(t, int64(0), metrics.GetMessagesSent())
	assert.Equal(t, int64(0), metrics.GetMessagesDropped())
}

func TestRouter_NilMetrics(t *testing.T) {
	logger := zap.NewNop()
	manager := NewConnectionManager()
	router := NewRouter(manager, logger, nil) // nil metrics

	// Create connected client
	userID := "user-1"
	client := &Client{Send: make(chan []byte, 10)}
	manager.Add(userID, client)

	// Create event
	innerPayload := InnerMessagePayload{
		ReceiverIDs: []string{userID},
	}
	innerJSON, _ := json.Marshal(innerPayload)

	event := EventPayload{
		EventID:       "event-001",
		AggregateType: "message",
		Payload:       innerJSON,
	}

	// Should not panic with nil metrics
	router.HandleEvent(context.Background(), event)

	// Verify message was sent
	select {
	case <-client.Send:
		// Success
	case <-time.After(100 * time.Millisecond):
		t.Fatal("message not received")
	}
}

// mockConn is a minimal mock for websocket.Conn used in integration-like tests
type mockConn struct {
	*websocket.Conn
}

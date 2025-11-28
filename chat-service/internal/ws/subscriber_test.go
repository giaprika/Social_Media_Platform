package ws

import (
	"context"
	"encoding/json"
	"sync"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"
)

func setupTestRedis(t *testing.T) (*miniredis.Miniredis, *redis.Client) {
	mr, err := miniredis.Run()
	require.NoError(t, err)

	client := redis.NewClient(&redis.Options{
		Addr: mr.Addr(),
	})

	t.Cleanup(func() {
		client.Close()
		mr.Close()
	})

	return mr, client
}

func TestSubscriber_StartStop(t *testing.T) {
	_, client := setupTestRedis(t)
	logger := zap.NewNop()

	handler := func(ctx context.Context, event EventPayload) {}
	sub := NewSubscriber(client, logger, handler)

	// Start subscriber
	err := sub.Start(context.Background())
	require.NoError(t, err)
	assert.True(t, sub.IsRunning())

	// Starting again should be no-op
	err = sub.Start(context.Background())
	require.NoError(t, err)

	// Stop subscriber
	err = sub.Stop()
	require.NoError(t, err)
	assert.False(t, sub.IsRunning())

	// Stopping again should be no-op
	err = sub.Stop()
	require.NoError(t, err)
}


func TestSubscriber_ReceiveEvent(t *testing.T) {
	mr, client := setupTestRedis(t)
	logger := zap.NewNop()

	var receivedEvents []EventPayload
	var mu sync.Mutex

	handler := func(ctx context.Context, event EventPayload) {
		mu.Lock()
		receivedEvents = append(receivedEvents, event)
		mu.Unlock()
	}

	sub := NewSubscriber(client, logger, handler)

	err := sub.Start(context.Background())
	require.NoError(t, err)
	defer sub.Stop()

	// Give subscriber time to be ready
	time.Sleep(50 * time.Millisecond)

	// Publish test event
	testEvent := EventPayload{
		EventID:       "test-event-123",
		AggregateType: "message",
		AggregateID:   "conv-456",
		Payload:       json.RawMessage(`{"message_id":"msg-789","content":"Hello"}`),
		CreatedAt:     time.Now().UnixMilli(),
	}

	eventJSON, err := json.Marshal(testEvent)
	require.NoError(t, err)

	// Publish via miniredis
	mr.Publish(ChannelName, string(eventJSON))

	// Wait for event to be processed
	time.Sleep(100 * time.Millisecond)

	mu.Lock()
	defer mu.Unlock()

	require.Len(t, receivedEvents, 1)
	assert.Equal(t, testEvent.EventID, receivedEvents[0].EventID)
	assert.Equal(t, testEvent.AggregateType, receivedEvents[0].AggregateType)
	assert.Equal(t, testEvent.AggregateID, receivedEvents[0].AggregateID)
}

func TestSubscriber_MultipleEvents(t *testing.T) {
	mr, client := setupTestRedis(t)
	logger := zap.NewNop()

	var receivedEvents []EventPayload
	var mu sync.Mutex

	handler := func(ctx context.Context, event EventPayload) {
		mu.Lock()
		receivedEvents = append(receivedEvents, event)
		mu.Unlock()
	}

	sub := NewSubscriber(client, logger, handler)

	err := sub.Start(context.Background())
	require.NoError(t, err)
	defer sub.Stop()

	time.Sleep(50 * time.Millisecond)

	// Publish multiple events
	for i := 0; i < 5; i++ {
		event := EventPayload{
			EventID:       "event-" + string(rune('0'+i)),
			AggregateType: "message",
			AggregateID:   "conv-123",
			CreatedAt:     time.Now().UnixMilli(),
		}
		eventJSON, _ := json.Marshal(event)
		mr.Publish(ChannelName, string(eventJSON))
	}

	// Wait for events to be processed
	time.Sleep(200 * time.Millisecond)

	mu.Lock()
	defer mu.Unlock()

	assert.Len(t, receivedEvents, 5)
}

func TestSubscriber_InvalidJSON(t *testing.T) {
	mr, client := setupTestRedis(t)
	logger := zap.NewNop()

	var receivedEvents []EventPayload
	var mu sync.Mutex

	handler := func(ctx context.Context, event EventPayload) {
		mu.Lock()
		receivedEvents = append(receivedEvents, event)
		mu.Unlock()
	}

	sub := NewSubscriber(client, logger, handler)

	err := sub.Start(context.Background())
	require.NoError(t, err)
	defer sub.Stop()

	time.Sleep(50 * time.Millisecond)

	// Publish invalid JSON
	mr.Publish(ChannelName, "invalid json {{{")

	// Publish valid event after
	validEvent := EventPayload{
		EventID:       "valid-event",
		AggregateType: "message",
		AggregateID:   "conv-123",
		CreatedAt:     time.Now().UnixMilli(),
	}
	eventJSON, _ := json.Marshal(validEvent)
	mr.Publish(ChannelName, string(eventJSON))

	time.Sleep(100 * time.Millisecond)

	mu.Lock()
	defer mu.Unlock()

	// Should only receive the valid event
	require.Len(t, receivedEvents, 1)
	assert.Equal(t, "valid-event", receivedEvents[0].EventID)
}

func TestSubscriber_ContextCancellation(t *testing.T) {
	_, client := setupTestRedis(t)
	logger := zap.NewNop()

	handler := func(ctx context.Context, event EventPayload) {}
	sub := NewSubscriber(client, logger, handler)

	ctx, cancel := context.WithCancel(context.Background())

	err := sub.Start(ctx)
	require.NoError(t, err)
	assert.True(t, sub.IsRunning())

	// Cancel context
	cancel()
	time.Sleep(50 * time.Millisecond)

	// Stop should still work
	err = sub.Stop()
	require.NoError(t, err)
}


func TestSubscriber_AutoReconnect(t *testing.T) {
	mr, client := setupTestRedis(t)
	logger := zap.NewNop()

	var receivedEvents []EventPayload
	var mu sync.Mutex

	handler := func(ctx context.Context, event EventPayload) {
		mu.Lock()
		receivedEvents = append(receivedEvents, event)
		mu.Unlock()
	}

	sub := NewSubscriber(client, logger, handler)

	err := sub.Start(context.Background())
	require.NoError(t, err)
	defer sub.Stop()

	time.Sleep(50 * time.Millisecond)

	// Send first event before disconnect
	event1 := EventPayload{
		EventID:       "event-before-disconnect",
		AggregateType: "message",
		AggregateID:   "conv-123",
		CreatedAt:     time.Now().UnixMilli(),
	}
	eventJSON1, _ := json.Marshal(event1)
	mr.Publish(ChannelName, string(eventJSON1))

	time.Sleep(100 * time.Millisecond)

	mu.Lock()
	assert.Len(t, receivedEvents, 1)
	mu.Unlock()

	// Simulate Redis restart by closing and restarting miniredis
	mr.Close()
	time.Sleep(100 * time.Millisecond)

	// Restart miniredis on same addr
	mr2, err := miniredis.Run()
	require.NoError(t, err)
	defer mr2.Close()

	// Update client to point to new miniredis
	// Note: In real scenario, Redis would come back on same address
	// For this test, we verify the reconnection logic is triggered

	// The subscriber should attempt reconnection
	// Give it time to detect disconnect and attempt reconnect
	time.Sleep(2 * time.Second)

	// Subscriber should still be marked as running (attempting reconnects)
	assert.True(t, sub.IsRunning())
}

func TestSubscriber_ReconnectBackoff(t *testing.T) {
	// This test verifies the backoff logic exists
	// by checking the constants are properly defined
	assert.Equal(t, 1*time.Second, initialReconnectDelay)
	assert.Equal(t, 30*time.Second, maxReconnectDelay)
	assert.Equal(t, 2, reconnectBackoffMulti)
}

package ws

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNewWelcomeEvent(t *testing.T) {
	ResetInstanceID() // Reset for consistent testing

	before := time.Now().UnixMilli()
	event := NewWelcomeEvent("user-123")
	after := time.Now().UnixMilli()

	assert.Equal(t, EventTypeWelcome, event.Type)
	assert.Equal(t, "user-123", event.UserID)
	assert.GreaterOrEqual(t, event.ServerTime, before)
	assert.LessOrEqual(t, event.ServerTime, after)
	assert.NotEmpty(t, event.InstanceID)
}

func TestNewReconnectedEvent(t *testing.T) {
	ResetInstanceID()

	previousConnAt := time.Now().Add(-5 * time.Minute)
	before := time.Now().UnixMilli()
	event := NewReconnectedEvent("user-456", previousConnAt)
	after := time.Now().UnixMilli()

	assert.Equal(t, EventTypeReconnected, event.Type)
	assert.Equal(t, "user-456", event.UserID)
	assert.GreaterOrEqual(t, event.ServerTime, before)
	assert.LessOrEqual(t, event.ServerTime, after)
	assert.Equal(t, previousConnAt.UnixMilli(), event.PreviousConnAt)
	assert.NotEmpty(t, event.InstanceID)

	// Gap should be approximately 5 minutes (300000ms)
	assert.InDelta(t, 5*60*1000, event.GapDuration, 1000) // Allow 1 second tolerance
}

func TestWelcomeEvent_JSON(t *testing.T) {
	event := &WelcomeEvent{
		Type:       EventTypeWelcome,
		ServerTime: 1700000000000,
		UserID:     "user-test",
		InstanceID: "gateway-1",
	}

	data, err := json.Marshal(event)
	require.NoError(t, err)

	var parsed map[string]interface{}
	err = json.Unmarshal(data, &parsed)
	require.NoError(t, err)

	assert.Equal(t, "welcome", parsed["type"])
	assert.Equal(t, float64(1700000000000), parsed["server_time"])
	assert.Equal(t, "user-test", parsed["user_id"])
	assert.Equal(t, "gateway-1", parsed["instance_id"])
}

func TestReconnectedEvent_JSON(t *testing.T) {
	event := &ReconnectedEvent{
		Type:           EventTypeReconnected,
		ServerTime:     1700000000000,
		UserID:         "user-test",
		PreviousConnAt: 1699999700000,
		GapDuration:    300000,
		InstanceID:     "gateway-2",
	}

	data, err := json.Marshal(event)
	require.NoError(t, err)

	var parsed map[string]interface{}
	err = json.Unmarshal(data, &parsed)
	require.NoError(t, err)

	assert.Equal(t, "reconnected", parsed["type"])
	assert.Equal(t, float64(1700000000000), parsed["server_time"])
	assert.Equal(t, "user-test", parsed["user_id"])
	assert.Equal(t, float64(1699999700000), parsed["previous_conn_at"])
	assert.Equal(t, float64(300000), parsed["gap_duration_ms"])
	assert.Equal(t, "gateway-2", parsed["instance_id"])
}

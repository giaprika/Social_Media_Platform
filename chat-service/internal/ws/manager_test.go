package ws

import (
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

func TestNewClient(t *testing.T) {
	client := NewClient(nil)

	assert.NotNil(t, client)
	assert.NotNil(t, client.Send)
	assert.NotNil(t, client.ctx)
	assert.NotNil(t, client.cancel)
	assert.False(t, client.IsClosed())
}

func TestClient_Close(t *testing.T) {
	client := NewClient(nil)

	// Close should work
	client.Close()
	assert.True(t, client.IsClosed())

	// Context should be cancelled
	select {
	case <-client.Context().Done():
		// Expected
	default:
		t.Fatal("context should be cancelled after Close")
	}

	// Double close should not panic
	client.Close()
	assert.True(t, client.IsClosed())
}

func TestClient_Context(t *testing.T) {
	client := NewClient(nil)

	ctx := client.Context()
	assert.NotNil(t, ctx)

	// Context should not be done initially
	select {
	case <-ctx.Done():
		t.Fatal("context should not be done initially")
	default:
		// Expected
	}

	// After close, context should be done
	client.Close()
	select {
	case <-ctx.Done():
		// Expected
	default:
		t.Fatal("context should be done after Close")
	}
}

func TestClient_GoroutineTracking(t *testing.T) {
	client := NewClient(nil)

	// Track goroutines
	client.AddGoroutine()
	client.AddGoroutine()

	// Simulate goroutines finishing
	done := make(chan struct{})
	go func() {
		client.Wait()
		close(done)
	}()

	// Wait should block
	select {
	case <-done:
		t.Fatal("Wait should block until goroutines finish")
	case <-time.After(50 * time.Millisecond):
		// Expected
	}

	// Finish goroutines
	client.DoneGoroutine()
	client.DoneGoroutine()

	// Wait should complete
	select {
	case <-done:
		// Expected
	case <-time.After(100 * time.Millisecond):
		t.Fatal("Wait should complete after goroutines finish")
	}
}

func TestConnectionManager_AddRemove(t *testing.T) {
	cm := NewConnectionManager()

	client := NewClient(nil)
	userID := "user-1"

	// Add client
	cm.Add(userID, client)
	assert.Equal(t, 1, cm.Count())

	// Get client
	got, ok := cm.Get(userID)
	assert.True(t, ok)
	assert.Equal(t, client, got)

	// Remove client
	cm.Remove(userID, client)
	assert.Equal(t, 0, cm.Count())

	// Get should return false
	_, ok = cm.Get(userID)
	assert.False(t, ok)
}

func TestConnectionManager_Remove_ClosesClient(t *testing.T) {
	cm := NewConnectionManager()

	client := NewClient(nil)
	userID := "user-1"

	cm.Add(userID, client)
	cm.Remove(userID, client)

	// Client should be closed
	assert.True(t, client.IsClosed())

	// Context should be cancelled
	select {
	case <-client.Context().Done():
		// Expected
	default:
		t.Fatal("context should be cancelled after Remove")
	}
}

func TestConnectionManager_Remove_WrongClient(t *testing.T) {
	cm := NewConnectionManager()

	client1 := NewClient(nil)
	client2 := NewClient(nil)
	userID := "user-1"

	cm.Add(userID, client1)

	// Try to remove with wrong client reference
	cm.Remove(userID, client2)

	// client1 should still be there
	got, ok := cm.Get(userID)
	assert.True(t, ok)
	assert.Equal(t, client1, got)
	assert.False(t, client1.IsClosed())
}

func TestConnectionManager_Add_ReplacesOldClient(t *testing.T) {
	cm := NewConnectionManager()

	client1 := NewClient(nil)
	client2 := NewClient(nil)
	userID := "user-1"

	cm.Add(userID, client1)
	cm.Add(userID, client2)

	// Old client should be closed
	assert.True(t, client1.IsClosed())

	// New client should be active
	got, ok := cm.Get(userID)
	assert.True(t, ok)
	assert.Equal(t, client2, got)
	assert.False(t, client2.IsClosed())
}

func TestConnectionManager_RemoveAndWait(t *testing.T) {
	cm := NewConnectionManager()

	client := NewClient(nil)
	userID := "user-1"

	cm.Add(userID, client)

	// Simulate goroutines
	client.AddGoroutine()
	client.AddGoroutine()

	// Start goroutines that will finish after a delay
	go func() {
		time.Sleep(50 * time.Millisecond)
		client.DoneGoroutine()
	}()
	go func() {
		time.Sleep(50 * time.Millisecond)
		client.DoneGoroutine()
	}()

	// RemoveAndWait should block until goroutines finish
	start := time.Now()
	cm.RemoveAndWait(userID, client)
	elapsed := time.Since(start)

	assert.True(t, elapsed >= 50*time.Millisecond, "RemoveAndWait should wait for goroutines")
	assert.True(t, client.IsClosed())
	assert.Equal(t, 0, cm.Count())
}

func TestConnectionManager_SendToUser(t *testing.T) {
	cm := NewConnectionManager()

	client := NewClient(nil)
	userID := "user-1"

	cm.Add(userID, client)

	// Send message
	ok := cm.SendToUser(userID, []byte("hello"))
	assert.True(t, ok)

	// Receive message
	select {
	case msg := <-client.Send:
		assert.Equal(t, []byte("hello"), msg)
	case <-time.After(100 * time.Millisecond):
		t.Fatal("message not received")
	}
}

func TestConnectionManager_SendToUser_NotFound(t *testing.T) {
	cm := NewConnectionManager()

	ok := cm.SendToUser("nonexistent", []byte("hello"))
	assert.False(t, ok)
}

func TestConnectionManager_SendToUser_ClosedClient(t *testing.T) {
	cm := NewConnectionManager()

	client := NewClient(nil)
	userID := "user-1"

	cm.Add(userID, client)
	client.Close()

	ok := cm.SendToUser(userID, []byte("hello"))
	assert.False(t, ok)
}

func TestConnectionManager_GetAllUserIDs(t *testing.T) {
	cm := NewConnectionManager()

	cm.Add("user-1", NewClient(nil))
	cm.Add("user-2", NewClient(nil))
	cm.Add("user-3", NewClient(nil))

	userIDs := cm.GetAllUserIDs()
	assert.Len(t, userIDs, 3)
	assert.Contains(t, userIDs, "user-1")
	assert.Contains(t, userIDs, "user-2")
	assert.Contains(t, userIDs, "user-3")
}

func TestConnectionManager_Concurrent(t *testing.T) {
	cm := NewConnectionManager()

	var wg sync.WaitGroup
	numGoroutines := 100

	// Concurrent adds
	for i := 0; i < numGoroutines; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			userID := "user-" + string(rune('0'+id%10))
			client := NewClient(nil)
			cm.Add(userID, client)
		}(i)
	}

	wg.Wait()

	// Should have at most 10 users (0-9)
	assert.LessOrEqual(t, cm.Count(), 10)
}

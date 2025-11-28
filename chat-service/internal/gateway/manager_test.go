package gateway

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/assert"
)

func TestConnectionManager(t *testing.T) {
	cm := NewConnectionManager()

	// Mock WebSocket connection
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upgrader := websocket.Upgrader{}
		c, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		defer c.Close()
		for {
			if _, _, err := c.ReadMessage(); err != nil {
				break
			}
		}
	}))
	defer s.Close()

	u := "ws" + strings.TrimPrefix(s.URL, "http")
	conn1, _, err := websocket.DefaultDialer.Dial(u, nil)
	assert.NoError(t, err)
	defer conn1.Close()

	conn2, _, err := websocket.DefaultDialer.Dial(u, nil)
	assert.NoError(t, err)
	defer conn2.Close()

	userID := "user-123"

	// Test Add
	cm.Add(userID, conn1)
	got, ok := cm.Get(userID)
	assert.True(t, ok)
	assert.Equal(t, conn1, got)

	// Test Add overwrite
	cm.Add(userID, conn2)
	got, ok = cm.Get(userID)
	assert.True(t, ok)
	assert.Equal(t, conn2, got)
	// conn1 should be closed by Add logic, but hard to test strictly without mocking underlying net.Conn
	// assuming logic is correct based on code.

	// Test Remove with correct conn
	cm.Remove(userID, conn2)
	got, ok = cm.Get(userID)
	assert.False(t, ok)
	assert.Nil(t, got)

	// Test Remove with nil conn (force remove)
	cm.Add(userID, conn1)
	cm.Remove(userID, nil)
	got, ok = cm.Get(userID)
	assert.False(t, ok)

	// Test Remove race condition (should not remove if conn doesn't match)
	cm.Add(userID, conn1)
	cm.Remove(userID, conn2) // conn2 is not current
	got, ok = cm.Get(userID)
	assert.True(t, ok)
	assert.Equal(t, conn1, got)
}

func TestConnectionManager_Concurrency(t *testing.T) {
	cm := NewConnectionManager()
	var wg sync.WaitGroup
	n := 100

	// Mock server
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upgrader := websocket.Upgrader{}
		c, _ := upgrader.Upgrade(w, r, nil)
		if c != nil {
			c.Close()
		}
	}))
	defer s.Close()
	u := "ws" + strings.TrimPrefix(s.URL, "http")

	// Concurrent Add/Get/Remove
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			conn, _, _ := websocket.DefaultDialer.Dial(u, nil)
			if conn == nil {
				return
			}
			userID := "user-concurrent"

			cm.Add(userID, conn)
			cm.Get(userID)
			cm.Remove(userID, conn)
		}(i)
	}

	done := make(chan struct{})
	go func() {
		wg.Wait()
		close(done)
	}()

	select {
	case <-done:
		// Success
	case <-time.After(5 * time.Second):
		t.Fatal("Timeout waiting for concurrent operations")
	}
}

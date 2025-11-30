package ws

import (
	"context"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

// Client represents a WebSocket client with its connection and send channel.
type Client struct {
	Conn   *websocket.Conn
	Send   chan []byte
	closed bool
	mu     sync.Mutex

	// Context for graceful shutdown of goroutines
	ctx    context.Context
	cancel context.CancelFunc

	// WaitGroup to track active goroutines (readPump, writePump)
	wg sync.WaitGroup

	// ConnectedAt is when this client connected (for gap sync)
	ConnectedAt time.Time
}

// NewClient creates a new Client with a cancellable context.
func NewClient(conn *websocket.Conn) *Client {
	ctx, cancel := context.WithCancel(context.Background())
	return &Client{
		Conn:        conn,
		Send:        make(chan []byte, 256), // Buffered channel for outgoing messages
		ctx:         ctx,
		cancel:      cancel,
		ConnectedAt: time.Now(),
	}
}

// Context returns the client's context for goroutine lifecycle management.
func (c *Client) Context() context.Context {
	return c.ctx
}

// AddGoroutine increments the WaitGroup counter.
// Call this before starting a goroutine for this client.
func (c *Client) AddGoroutine() {
	c.wg.Add(1)
}

// DoneGoroutine decrements the WaitGroup counter.
// Call this when a goroutine for this client exits.
func (c *Client) DoneGoroutine() {
	c.wg.Done()
}

// Wait blocks until all goroutines for this client have exited.
func (c *Client) Wait() {
	c.wg.Wait()
}

// Close gracefully closes the client:
// 1. Cancels context to signal goroutines to stop
// 2. Closes the send channel (only once)
// Note: Does NOT close the WebSocket connection - that's handled by writePump
func (c *Client) Close() {
	c.mu.Lock()
	defer c.mu.Unlock()
	if !c.closed {
		c.closed = true
		if c.cancel != nil {
			c.cancel() // Signal goroutines to stop
		}
		close(c.Send)
	}
}

// IsClosed returns whether the client is closed.
func (c *Client) IsClosed() bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.closed
}

// ConnectionManager handles WebSocket connections for users.
// It is thread-safe.
type ConnectionManager struct {
	mu          sync.RWMutex
	connections map[string]*Client
}

// NewConnectionManager creates a new ConnectionManager.
func NewConnectionManager() *ConnectionManager {
	return &ConnectionManager{
		connections: make(map[string]*Client),
	}
}

// AddResult contains information about the Add operation.
type AddResult struct {
	// IsReconnect is true if there was a previous connection for this user.
	IsReconnect bool
	// PreviousConnectedAt is when the previous connection was established.
	// Only valid if IsReconnect is true.
	PreviousConnectedAt time.Time
}

// Add adds a client for a user.
// If a client already exists, it is closed and replaced.
// Returns AddResult with reconnection information.
func (cm *ConnectionManager) Add(userID string, client *Client) AddResult {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	result := AddResult{}

	if oldClient, ok := cm.connections[userID]; ok {
		result.IsReconnect = true
		result.PreviousConnectedAt = oldClient.ConnectedAt
		oldClient.Close()
		if oldClient.Conn != nil {
			_ = oldClient.Conn.Close()
		}
	}
	cm.connections[userID] = client
	return result
}

// Remove removes the client for a user and performs graceful cleanup.
// It checks if the client being removed is the current one to avoid race conditions.
// The cleanup process:
// 1. Remove from map (so no new messages are sent)
// 2. Close client (cancel context, close send channel)
// 3. Close WebSocket connection (triggers goroutines to exit)
// Note: This does NOT wait for goroutines - they will exit on their own
func (cm *ConnectionManager) Remove(userID string, client *Client) {
	cm.mu.Lock()

	currentClient, ok := cm.connections[userID]
	if !ok {
		cm.mu.Unlock()
		return
	}

	// If a specific client is provided, only remove if it matches
	if client != nil && currentClient != client {
		cm.mu.Unlock()
		return
	}

	// Remove from map first (prevents new messages from being queued)
	delete(cm.connections, userID)
	cm.mu.Unlock()

	// Close client (signals goroutines to stop via context cancellation)
	currentClient.Close()

	// Close WebSocket connection (triggers read/write errors in goroutines)
	if currentClient.Conn != nil {
		_ = currentClient.Conn.Close()
	}
}

// RemoveAndWait removes the client and waits for all goroutines to exit.
// Use this for graceful shutdown scenarios where you need to ensure cleanup is complete.
func (cm *ConnectionManager) RemoveAndWait(userID string, client *Client) {
	cm.mu.Lock()

	currentClient, ok := cm.connections[userID]
	if !ok {
		cm.mu.Unlock()
		return
	}

	if client != nil && currentClient != client {
		cm.mu.Unlock()
		return
	}

	delete(cm.connections, userID)
	cm.mu.Unlock()

	currentClient.Close()
	if currentClient.Conn != nil {
		_ = currentClient.Conn.Close()
	}

	// Wait for goroutines to finish
	currentClient.Wait()
}

// Get retrieves the client for a user.
func (cm *ConnectionManager) Get(userID string) (*Client, bool) {
	cm.mu.RLock()
	defer cm.mu.RUnlock()

	client, ok := cm.connections[userID]
	return client, ok
}

// SendToUser sends a message to a specific user.
// Returns true if the message was queued, false if user not found or channel full.
func (cm *ConnectionManager) SendToUser(userID string, message []byte) bool {
	cm.mu.RLock()
	client, ok := cm.connections[userID]
	cm.mu.RUnlock()

	if !ok || client.IsClosed() {
		return false
	}

	select {
	case client.Send <- message:
		return true
	default:
		// Channel full, message dropped
		return false
	}
}

// Count returns the number of active connections.
func (cm *ConnectionManager) Count() int {
	cm.mu.RLock()
	defer cm.mu.RUnlock()

	return len(cm.connections)
}

// GetAllUserIDs returns all connected user IDs.
func (cm *ConnectionManager) GetAllUserIDs() []string {
	cm.mu.RLock()
	defer cm.mu.RUnlock()

	userIDs := make([]string, 0, len(cm.connections))
	for userID := range cm.connections {
		userIDs = append(userIDs, userID)
	}
	return userIDs
}

// GetAllClients returns all connected clients.
func (cm *ConnectionManager) GetAllClients() map[string]*Client {
	cm.mu.RLock()
	defer cm.mu.RUnlock()

	clients := make(map[string]*Client, len(cm.connections))
	for userID, client := range cm.connections {
		clients[userID] = client
	}
	return clients
}

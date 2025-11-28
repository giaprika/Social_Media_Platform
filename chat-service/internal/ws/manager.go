package ws

import (
	"sync"

	"github.com/gorilla/websocket"
)

// Client represents a WebSocket client with its connection and send channel.
type Client struct {
	Conn   *websocket.Conn
	Send   chan []byte
	closed bool
	mu     sync.Mutex
}

// NewClient creates a new Client.
func NewClient(conn *websocket.Conn) *Client {
	return &Client{
		Conn: conn,
		Send: make(chan []byte, 256), // Buffered channel for outgoing messages
	}
}

// Close closes the client's send channel safely (only once).
func (c *Client) Close() {
	c.mu.Lock()
	defer c.mu.Unlock()
	if !c.closed {
		c.closed = true
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

// Add adds a client for a user.
// If a client already exists, it is closed and replaced.
func (cm *ConnectionManager) Add(userID string, client *Client) {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	if oldClient, ok := cm.connections[userID]; ok {
		oldClient.Close()
		_ = oldClient.Conn.Close()
	}
	cm.connections[userID] = client
}

// Remove removes the client for a user.
// It checks if the client being removed is the current one to avoid race conditions.
func (cm *ConnectionManager) Remove(userID string, client *Client) {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	currentClient, ok := cm.connections[userID]
	if !ok {
		return
	}

	if client != nil && currentClient != client {
		return
	}

	currentClient.Close()
	_ = currentClient.Conn.Close()
	delete(cm.connections, userID)
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

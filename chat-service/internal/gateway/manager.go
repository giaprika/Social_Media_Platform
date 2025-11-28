package gateway

import (
	"sync"

	"github.com/gorilla/websocket"
)

// ConnectionManager handles WebSocket connections for users.
// It is thread-safe.
type ConnectionManager struct {
	mu          sync.RWMutex
	connections map[string]*websocket.Conn
}

// NewConnectionManager creates a new ConnectionManager.
func NewConnectionManager() *ConnectionManager {
	return &ConnectionManager{
		connections: make(map[string]*websocket.Conn),
	}
}

// Add adds a connection for a user.
// If a connection already exists, it is closed and replaced.
func (cm *ConnectionManager) Add(userID string, conn *websocket.Conn) {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	if oldConn, ok := cm.connections[userID]; ok {
		// Close old connection to prevent leaks
		_ = oldConn.Close()
	}
	cm.connections[userID] = conn
}

// Remove removes the connection for a user.
// It checks if the connection being removed is the current one to avoid race conditions.
// If conn is nil, it forces removal of the user's connection.
func (cm *ConnectionManager) Remove(userID string, conn *websocket.Conn) {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	currentConn, ok := cm.connections[userID]
	if !ok {
		return
	}

	// If conn is provided, only remove if it matches the current connection
	if conn != nil && currentConn != conn {
		return
	}

	// Close the connection if it's not already closed (best effort)
	_ = currentConn.Close()
	delete(cm.connections, userID)
}

// Get retrieves the connection for a user.
func (cm *ConnectionManager) Get(userID string) (*websocket.Conn, bool) {
	cm.mu.RLock()
	defer cm.mu.RUnlock()

	conn, ok := cm.connections[userID]
	return conn, ok
}

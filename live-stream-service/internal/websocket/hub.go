package websocket

import (
	"encoding/json"
	"log"
	"sync"
	"time"
)

// Hub maintains the set of active clients and broadcasts messages to clients
type Hub struct {
	// Map of streamID -> set of clients
	rooms map[int64]map[*Client]bool

	// RWMutex for thread-safe access to rooms
	mu sync.RWMutex

	// Channel for registering clients
	register chan *Client

	// Channel for unregistering clients
	unregister chan *Client

	// Track last view count update time per stream (for throttling)
	lastViewUpdate map[int64]time.Time
	viewUpdateMu   sync.Mutex

	// Minimum interval between view count updates (throttling)
	viewUpdateInterval time.Duration
}

// NewHub creates a new Hub instance
func NewHub() *Hub {
	return &Hub{
		rooms:              make(map[int64]map[*Client]bool),
		register:           make(chan *Client, 256),
		unregister:         make(chan *Client, 256),
		lastViewUpdate:     make(map[int64]time.Time),
		viewUpdateInterval: 3 * time.Second, // Throttle view updates to max 1 per 3 seconds
	}
}

// Run starts the hub's main loop
func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.addClient(client)
		case client := <-h.unregister:
			h.removeClient(client)
		}
	}
}

// Register adds a client to the hub
func (h *Hub) Register(client *Client) {
	h.register <- client
}

// Unregister removes a client from the hub
func (h *Hub) Unregister(client *Client) {
	h.unregister <- client
}

// addClient adds a client to a stream room
func (h *Hub) addClient(client *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()

	streamID := client.StreamID()

	// Create room if it doesn't exist
	if h.rooms[streamID] == nil {
		h.rooms[streamID] = make(map[*Client]bool)
	}

	h.rooms[streamID][client] = true

	count := len(h.rooms[streamID])
	log.Printf("Client joined stream %d, total viewers: %d", streamID, count)

	// Send joined message to the client
	joinedMsg := NewJoinedMessage(streamID, count)
	if data, err := json.Marshal(joinedMsg); err == nil {
		client.Send(data)
	}

	// Broadcast view update to all clients in the room
	h.broadcastViewUpdateLocked(streamID, count)
}

// removeClient removes a client from a stream room
func (h *Hub) removeClient(client *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()

	streamID := client.StreamID()

	if clients, ok := h.rooms[streamID]; ok {
		if _, exists := clients[client]; exists {
			delete(clients, client)

			count := len(clients)
			log.Printf("Client left stream %d, total viewers: %d", streamID, count)

			// Clean up empty rooms
			if count == 0 {
				delete(h.rooms, streamID)
			} else {
				// Broadcast view update to remaining clients
				h.broadcastViewUpdateLocked(streamID, count)
			}
		}
	}
}

// GetViewerCount returns the number of viewers for a stream
func (h *Hub) GetViewerCount(streamID int64) int {
	h.mu.RLock()
	defer h.mu.RUnlock()

	if clients, ok := h.rooms[streamID]; ok {
		return len(clients)
	}
	return 0
}

// Broadcast sends a message to all clients in a stream room
func (h *Hub) Broadcast(streamID int64, message []byte) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	if clients, ok := h.rooms[streamID]; ok {
		for client := range clients {
			if !client.Send(message) {
				// Failed to send, will be cleaned up
				go h.Unregister(client)
			}
		}
	}
}

// BroadcastMessage sends a Message to all clients in a stream room
func (h *Hub) BroadcastMessage(streamID int64, msg *Message) {
	data, err := json.Marshal(msg)
	if err != nil {
		log.Printf("Failed to marshal message: %v", err)
		return
	}
	h.Broadcast(streamID, data)
}

// BroadcastViewUpdate sends viewer count update with throttling
func (h *Hub) BroadcastViewUpdate(streamID int64) {
	h.viewUpdateMu.Lock()
	lastUpdate := h.lastViewUpdate[streamID]
	now := time.Now()

	// Check if we should throttle
	if now.Sub(lastUpdate) < h.viewUpdateInterval {
		h.viewUpdateMu.Unlock()
		return
	}

	h.lastViewUpdate[streamID] = now
	h.viewUpdateMu.Unlock()

	count := h.GetViewerCount(streamID)
	msg := NewViewUpdateMessage(streamID, count)
	h.BroadcastMessage(streamID, msg)
}

// broadcastViewUpdateLocked broadcasts view update (must be called with lock held)
func (h *Hub) broadcastViewUpdateLocked(streamID int64, count int) {
	msg := NewViewUpdateMessage(streamID, count)
	data, err := json.Marshal(msg)
	if err != nil {
		return
	}

	if clients, ok := h.rooms[streamID]; ok {
		for client := range clients {
			client.Send(data)
		}
	}
}

// ProcessMessage handles incoming messages from clients
func (h *Hub) ProcessMessage(client *Client, msg *Message) {
	switch msg.Type {
	case MessageTypeChat:
		h.handleChatMessage(client, msg)
	default:
		log.Printf("Unknown message type: %s", msg.Type)
	}
}

// handleChatMessage processes chat messages
func (h *Hub) handleChatMessage(client *Client, msg *Message) {
	// Validate message content
	content := msg.Content
	if content == "" {
		return // Ignore empty messages
	}

	// Truncate if too long (max 500 chars)
	if len(content) > 500 {
		content = content[:500]
	}

	// Create broadcast message
	broadcastMsg := NewChatMessage(
		client.StreamID(),
		client.UserID(),
		client.Username(),
		content,
	)

	h.BroadcastMessage(client.StreamID(), broadcastMsg)
}

// BroadcastExcept sends a message to all clients except the specified one
func (h *Hub) BroadcastExcept(streamID int64, message []byte, exclude *Client) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	if clients, ok := h.rooms[streamID]; ok {
		for client := range clients {
			if client == exclude {
				continue
			}
			if !client.Send(message) {
				go h.Unregister(client)
			}
		}
	}
}

// SendToClient sends a message to a specific client
func (h *Hub) SendToClient(client *Client, msg *Message) {
	data, err := json.Marshal(msg)
	if err != nil {
		log.Printf("Failed to marshal message: %v", err)
		return
	}
	client.Send(data)
}

// GetActiveStreams returns list of stream IDs with active viewers
func (h *Hub) GetActiveStreams() []int64 {
	h.mu.RLock()
	defer h.mu.RUnlock()

	streams := make([]int64, 0, len(h.rooms))
	for streamID := range h.rooms {
		streams = append(streams, streamID)
	}
	return streams
}

// GetClientsInStream returns all clients in a stream room
func (h *Hub) GetClientsInStream(streamID int64) []*Client {
	h.mu.RLock()
	defer h.mu.RUnlock()

	if clients, ok := h.rooms[streamID]; ok {
		result := make([]*Client, 0, len(clients))
		for client := range clients {
			result = append(result, client)
		}
		return result
	}
	return nil
}

package websocket

import "time"

// MessageType represents the type of WebSocket message
type MessageType string

const (
	// Client -> Server messages
	MessageTypeChat MessageType = "CHAT"

	// Server -> Client messages
	MessageTypeChatBroadcast MessageType = "CHAT_BROADCAST"
	MessageTypeViewUpdate    MessageType = "VIEW_UPDATE"
	MessageTypeError         MessageType = "ERROR"
	MessageTypeJoined        MessageType = "JOINED"
	MessageTypeLeft          MessageType = "LEFT"
)

// Message represents a WebSocket message
type Message struct {
	Type      MessageType `json:"type"`
	StreamID  int64       `json:"stream_id,omitempty"`
	UserID    int64       `json:"user_id,omitempty"`
	Username  string      `json:"username,omitempty"`
	Content   string      `json:"content,omitempty"`
	Count     int         `json:"count,omitempty"`
	Timestamp time.Time   `json:"timestamp,omitempty"`
}

// NewChatMessage creates a new chat broadcast message
func NewChatMessage(streamID, userID int64, username, content string) *Message {
	return &Message{
		Type:      MessageTypeChatBroadcast,
		StreamID:  streamID,
		UserID:    userID,
		Username:  username,
		Content:   content,
		Timestamp: time.Now(),
	}
}

// NewViewUpdateMessage creates a new viewer count update message
func NewViewUpdateMessage(streamID int64, count int) *Message {
	return &Message{
		Type:      MessageTypeViewUpdate,
		StreamID:  streamID,
		Count:     count,
		Timestamp: time.Now(),
	}
}

// NewErrorMessage creates a new error message
func NewErrorMessage(content string) *Message {
	return &Message{
		Type:      MessageTypeError,
		Content:   content,
		Timestamp: time.Now(),
	}
}

// NewJoinedMessage creates a message when user joins
func NewJoinedMessage(streamID int64, count int) *Message {
	return &Message{
		Type:      MessageTypeJoined,
		StreamID:  streamID,
		Count:     count,
		Timestamp: time.Now(),
	}
}

// NewLeftMessage creates a message when user leaves
func NewLeftMessage(streamID int64, username string, count int) *Message {
	return &Message{
		Type:      MessageTypeLeft,
		StreamID:  streamID,
		Username:  username,
		Count:     count,
		Timestamp: time.Now(),
	}
}

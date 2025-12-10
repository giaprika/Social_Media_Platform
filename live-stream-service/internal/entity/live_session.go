package entity

import (
	"time"
)

// LiveSessionStatus represents the status of a live session
type LiveSessionStatus string

const (
	StatusCreated LiveSessionStatus = "CREATED"
	StatusLive    LiveSessionStatus = "LIVE"
	StatusEnded   LiveSessionStatus = "ENDED"
	StatusError   LiveSessionStatus = "ERROR"
)

// LiveSession represents a live streaming session
type LiveSession struct {
	ID          int64             `json:"id" db:"id"`
	UserID      int64             `json:"user_id" db:"user_id"`
	StreamKey   string            `json:"stream_key" db:"stream_key"`
	Title       string            `json:"title" db:"title"`
	Description string            `json:"description" db:"description"`
	Status      LiveSessionStatus `json:"status" db:"status"`
	RTMPUrl     string            `json:"rtmp_url" db:"rtmp_url"`
	WebRTCUrl   string            `json:"webrtc_url" db:"webrtc_url"`
	HLSUrl      string            `json:"hls_url" db:"hls_url"`
	ViewerCount int               `json:"viewer_count" db:"viewer_count"`
	StartedAt   *time.Time        `json:"started_at" db:"started_at"`
	EndedAt     *time.Time        `json:"ended_at" db:"ended_at"`
	CreatedAt   time.Time         `json:"created_at" db:"created_at"`
	UpdatedAt   time.Time         `json:"updated_at" db:"updated_at"`
}

// CreateStreamRequest represents the request to create a new stream
type CreateStreamRequest struct {
	Title       string `json:"title" binding:"required,min=1,max=100"`
	Description string `json:"description" binding:"max=500"`
}

// CreateStreamResponse represents the response after creating a stream
type CreateStreamResponse struct {
	ID        int64  `json:"id"`
	StreamKey string `json:"stream_key"`
	RTMPUrl   string `json:"rtmp_url"`
	WebRTCUrl string `json:"webrtc_url"`
	HLSUrl    string `json:"hls_url"`
}

// ListStreamsResponse represents the response for listing streams
type ListStreamsResponse struct {
	Streams []LiveStreamInfo `json:"streams"`
	Total   int              `json:"total"`
	Page    int              `json:"page"`
	Limit   int              `json:"limit"`
}

// LiveStreamInfo represents basic stream information for listing
type LiveStreamInfo struct {
	ID          int64             `json:"id"`
	UserID      int64             `json:"user_id"`
	Title       string            `json:"title"`
	Status      LiveSessionStatus `json:"status"`
	ViewerCount int               `json:"viewer_count"`
	HLSUrl      string            `json:"hls_url"`
	StartedAt   *time.Time        `json:"started_at"`
	CreatedAt   time.Time         `json:"created_at"`
	// User info (to be populated from user service)
	Username string `json:"username,omitempty"`
	Avatar   string `json:"avatar,omitempty"`
}

// IsValidStatus checks if the status is valid
func (s LiveSessionStatus) IsValid() bool {
	switch s {
	case StatusCreated, StatusLive, StatusEnded, StatusError:
		return true
	default:
		return false
	}
}

package entity

import (
	"database/sql/driver"
	"errors"
	"time"
)

// LiveSessionStatus represents the status of a live session
type LiveSessionStatus string

const (
	StatusIdle  LiveSessionStatus = "IDLE"  // Stream created but not started
	StatusLive  LiveSessionStatus = "LIVE"  // Stream is currently live
	StatusEnded LiveSessionStatus = "ENDED" // Stream has ended
)

// Scan implements sql.Scanner for LiveSessionStatus
func (s *LiveSessionStatus) Scan(value interface{}) error {
	if value == nil {
		*s = StatusIdle
		return nil
	}
	switch v := value.(type) {
	case []byte:
		*s = LiveSessionStatus(v)
	case string:
		*s = LiveSessionStatus(v)
	default:
		return errors.New("invalid type for LiveSessionStatus")
	}
	return nil
}

// Value implements driver.Valuer for LiveSessionStatus
func (s LiveSessionStatus) Value() (driver.Value, error) {
	return string(s), nil
}

// LiveSession represents a live streaming session
type LiveSession struct {
	ID          int64             `json:"id" db:"id"`
	UserID      int64             `json:"user_id" db:"user_id"`
	StreamKey   string            `json:"stream_key" db:"stream_key"`
	Title       string            `json:"title" db:"title"`
	Description *string           `json:"description,omitempty" db:"description"`
	Status      LiveSessionStatus `json:"status" db:"status"`
	RTMPUrl     *string           `json:"rtmp_url,omitempty" db:"rtmp_url"`
	WebRTCUrl   *string           `json:"webrtc_url,omitempty" db:"webrtc_url"`
	HLSUrl      *string           `json:"hls_url,omitempty" db:"hls_url"`
	ViewerCount int               `json:"viewer_count" db:"viewer_count"`
	StartedAt   *time.Time        `json:"started_at,omitempty" db:"started_at"`
	EndedAt     *time.Time        `json:"ended_at,omitempty" db:"ended_at"`
	CreatedAt   time.Time         `json:"created_at" db:"created_at"`
	UpdatedAt   time.Time         `json:"updated_at" db:"updated_at"`
}

// CreateStreamRequest represents the request to create a new stream
type CreateStreamRequest struct {
	Title       string `json:"title" binding:"required,min=1,max=255"`
	Description string `json:"description" binding:"max=1000"`
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
	Streams    []LiveStreamInfo `json:"streams"`
	Total      int              `json:"total"`
	Page       int              `json:"page"`
	Limit      int              `json:"limit"`
	TotalPages int              `json:"total_pages"`
}

// LiveStreamInfo represents basic stream information for listing
type LiveStreamInfo struct {
	ID          int64             `json:"id"`
	UserID      int64             `json:"user_id"`
	Title       string            `json:"title"`
	Status      LiveSessionStatus `json:"status"`
	ViewerCount int               `json:"viewer_count"`
	HLSUrl      *string           `json:"hls_url,omitempty"`
	StartedAt   *time.Time        `json:"started_at,omitempty"`
	CreatedAt   time.Time         `json:"created_at"`
	// User info (to be populated from user service)
	Username  string `json:"username,omitempty"`
	Avatar    string `json:"avatar,omitempty"`
	Thumbnail string `json:"thumbnail,omitempty"`
}

// StreamDetailResponse represents detailed stream information
type StreamDetailResponse struct {
	ID          int64             `json:"id"`
	UserID      int64             `json:"user_id"`
	StreamKey   string            `json:"stream_key,omitempty"` // Only shown to owner
	Title       string            `json:"title"`
	Description *string           `json:"description,omitempty"`
	Status      LiveSessionStatus `json:"status"`
	RTMPUrl     string            `json:"rtmp_url,omitempty"`   // Only shown to owner
	WebRTCUrl   string            `json:"webrtc_url,omitempty"` // Only shown to owner
	HLSUrl      *string           `json:"hls_url,omitempty"`
	ViewerCount int               `json:"viewer_count"`
	StartedAt   *time.Time        `json:"started_at,omitempty"`
	EndedAt     *time.Time        `json:"ended_at,omitempty"`
	CreatedAt   time.Time         `json:"created_at"`
	// User info
	Username string `json:"username,omitempty"`
	Avatar   string `json:"avatar,omitempty"`
	IsOwner  bool   `json:"is_owner"`
}

// PaginationParams represents pagination parameters
type PaginationParams struct {
	Page  int `form:"page" binding:"min=1"`
	Limit int `form:"limit" binding:"min=1,max=100"`
}

// DefaultPagination returns default pagination values
func DefaultPagination() PaginationParams {
	return PaginationParams{Page: 1, Limit: 20}
}

// Offset calculates the offset for database queries
func (p PaginationParams) Offset() int {
	return (p.Page - 1) * p.Limit
}

// IsValidStatus checks if the status is valid
func (s LiveSessionStatus) IsValid() bool {
	switch s {
	case StatusIdle, StatusLive, StatusEnded:
		return true
	default:
		return false
	}
}

// String returns the string representation of the status
func (s LiveSessionStatus) String() string {
	return string(s)
}

// CanTransitionTo checks if status can transition to the target status
func (s LiveSessionStatus) CanTransitionTo(target LiveSessionStatus) bool {
	switch s {
	case StatusIdle:
		return target == StatusLive || target == StatusEnded
	case StatusLive:
		return target == StatusEnded
	case StatusEnded:
		return false // Cannot transition from ended
	default:
		return false
	}
}

// SRSCallbackRequest represents the webhook request from SRS server
// Documentation: https://ossrs.io/lts/en-us/docs/v5/doc/http-callback
type SRSCallbackRequest struct {
	Action   string `json:"action" form:"action"`     // Event type: on_publish, on_unpublish, etc.
	ClientID string `json:"client_id" form:"client_id"` // SRS client ID
	IP       string `json:"ip" form:"ip"`             // Client IP address
	Vhost    string `json:"vhost" form:"vhost"`       // Virtual host
	App      string `json:"app" form:"app"`           // Application name (e.g., "live")
	Stream   string `json:"stream" form:"stream"`     // Stream name (this is our stream_key)
	Param    string `json:"param" form:"param"`       // URL parameters
	ServerID string `json:"server_id" form:"server_id"` // SRS server ID
	ServiceID string `json:"service_id" form:"service_id"` // SRS service ID
	TcUrl    string `json:"tcUrl" form:"tcUrl"`       // RTMP tcUrl
}

// SRSCallbackResponse represents the response to SRS webhook
// Return code 0 to allow, non-zero to reject
type SRSCallbackResponse struct {
	Code int `json:"code"`
}

// GetStreamKey extracts the stream key from the SRS callback
// Stream key is the "stream" field in the callback
func (r *SRSCallbackRequest) GetStreamKey() string {
	return r.Stream
}

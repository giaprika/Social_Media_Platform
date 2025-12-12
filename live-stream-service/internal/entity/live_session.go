package entity

import (
	"database/sql/driver"
	"errors"
	"time"

	"github.com/google/uuid"
	nanoid "github.com/matoous/go-nanoid/v2"
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

// GenerateNanoID generates a new NanoID for stream/live session
func GenerateNanoID() string {
	id, _ := nanoid.New()
	return id
}

// IsValidUUID checks if a string is a valid UUID
func IsValidUUID(s string) bool {
	_, err := uuid.Parse(s)
	return err == nil
}

// IsValidNanoID checks if a string looks like a valid NanoID (21 chars, URL-safe)
func IsValidNanoID(s string) bool {
	if len(s) != 21 {
		return false
	}
	for _, c := range s {
		if !((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '_' || c == '-') {
			return false
		}
	}
	return true
}

// LiveSession represents a live streaming session
type LiveSession struct {
	ID          string            `json:"id" db:"id"`           // NanoID (21 chars)
	UserID      string            `json:"user_id" db:"user_id"` // UUID
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
	ID        string `json:"id"` // NanoID
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
	ID          string            `json:"id"` // NanoID
	UserID      string            `json:"user_id"` // UUID
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
	ID          string            `json:"id"` // NanoID
	UserID      string            `json:"user_id"` // UUID
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

// WebRTCInfoResponse represents WebRTC connection info for a stream
type WebRTCInfoResponse struct {
	ID            string            `json:"id"` // NanoID
	Status        LiveSessionStatus `json:"status"`
	PublishURL    string            `json:"publish_url"`              // webrtc://ip/live/stream_key (owner only)
	PlayURL       string            `json:"play_url"`                 // webrtc://ip/live/stream_key
	WHIPEndpoint  string            `json:"whip_endpoint,omitempty"`  // WHIP publish endpoint
	WHEPEndpoint  string            `json:"whep_endpoint,omitempty"`  // WHEP play endpoint
	ICEServers    []ICEServer       `json:"ice_servers"`              // STUN/TURN servers
	IsOwner       bool              `json:"is_owner"`
}

// ICEServer represents a STUN/TURN server for WebRTC
type ICEServer struct {
	URLs       []string `json:"urls"`
	Username   string   `json:"username,omitempty"`
	Credential string   `json:"credential,omitempty"`
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

// GetStreamID extracts the stream ID from the SRS callback
// With token auth: OBS sends "123?token=xxx", SRS strips params
// So Stream field contains just "123" (the stream ID)
func (r *SRSCallbackRequest) GetStreamID() string {
	return r.Stream
}

// GetToken extracts the authentication token from URL params
// Param field contains "?token=xxx" or empty string
func (r *SRSCallbackRequest) GetToken() string {
	if r.Param == "" {
		return ""
	}
	// Parse ?token=xxx format
	// Param can be "?token=abc123" or "token=abc123"
	param := r.Param
	if len(param) > 0 && param[0] == '?' {
		param = param[1:]
	}
	// Simple parsing for token=value
	const prefix = "token="
	for _, part := range splitParams(param) {
		if len(part) > len(prefix) && part[:len(prefix)] == prefix {
			return part[len(prefix):]
		}
	}
	return ""
}

// splitParams splits URL params by &
func splitParams(s string) []string {
	var result []string
	start := 0
	for i := 0; i < len(s); i++ {
		if s[i] == '&' {
			if i > start {
				result = append(result, s[start:i])
			}
			start = i + 1
		}
	}
	if start < len(s) {
		result = append(result, s[start:])
	}
	return result
}

// GetStreamKey is deprecated, use GetStreamID and GetToken instead
// Kept for backward compatibility
func (r *SRSCallbackRequest) GetStreamKey() string {
	// If token exists, return it as stream key for validation
	if token := r.GetToken(); token != "" {
		return token
	}
	// Fallback to stream field (old behavior)
	return r.Stream
}

package utils

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

// SRSURLBuilder helps construct various SRS streaming URLs
type SRSURLBuilder struct {
	ServerIP   string
	RTMPPort   int
	WebRTCPort int
	HTTPPort   int
	APIPort    int
}

// NewSRSURLBuilder creates a new URL builder with default ports
func NewSRSURLBuilder(serverIP string) *SRSURLBuilder {
	return &SRSURLBuilder{
		ServerIP:   serverIP,
		RTMPPort:   1935,
		WebRTCPort: 1985,
		HTTPPort:   8080,
		APIPort:    1985,
	}
}

// BuildRTMPURL constructs RTMP ingest URL for OBS Studio
// Format: rtmp://{server_ip}:{port}/live/{stream_key}
func (b *SRSURLBuilder) BuildRTMPURL(streamKey string) string {
	return fmt.Sprintf("rtmp://%s:%d/live/%s", b.ServerIP, b.RTMPPort, streamKey)
}

// BuildRTMPURLWithApp constructs RTMP URL with custom app name
func (b *SRSURLBuilder) BuildRTMPURLWithApp(app, streamKey string) string {
	return fmt.Sprintf("rtmp://%s:%d/%s/%s", b.ServerIP, b.RTMPPort, app, streamKey)
}

// BuildWebRTCPublishURL constructs WebRTC publish URL for browser streaming
// Format: webrtc://{server_ip}:{port}/live/{stream_key}
func (b *SRSURLBuilder) BuildWebRTCPublishURL(streamKey string) string {
	return fmt.Sprintf("webrtc://%s:%d/live/%s", b.ServerIP, b.WebRTCPort, streamKey)
}

// BuildWebRTCPlayURL constructs WebRTC play URL for low-latency playback
func (b *SRSURLBuilder) BuildWebRTCPlayURL(streamKey string) string {
	return fmt.Sprintf("webrtc://%s:%d/live/%s", b.ServerIP, b.WebRTCPort, streamKey)
}

// BuildHLSURL constructs HLS playback URL
// Format: http://{server_ip}:{port}/live/{stream_key}.m3u8
func (b *SRSURLBuilder) BuildHLSURL(streamKey string) string {
	return fmt.Sprintf("http://%s:%d/live/%s.m3u8", b.ServerIP, b.HTTPPort, streamKey)
}

// BuildFLVURL constructs HTTP-FLV playback URL
// Format: http://{server_ip}:{port}/live/{stream_key}.flv
func (b *SRSURLBuilder) BuildFLVURL(streamKey string) string {
	return fmt.Sprintf("http://%s:%d/live/%s.flv", b.ServerIP, b.HTTPPort, streamKey)
}

// BuildAPIURL constructs SRS API URL
func (b *SRSURLBuilder) BuildAPIURL(endpoint string) string {
	return fmt.Sprintf("http://%s:%d%s", b.ServerIP, b.APIPort, endpoint)
}

// CDNURLBuilder helps construct CDN playback URLs
type CDNURLBuilder struct {
	BaseURL string // e.g., "https://cdn.extase.dev"
}

// NewCDNURLBuilder creates a new CDN URL builder
func NewCDNURLBuilder(baseURL string) *CDNURLBuilder {
	return &CDNURLBuilder{BaseURL: baseURL}
}

// BuildHLSPlaybackURL constructs CDN HLS playback URL
// Format: https://{cdn_domain}/live/{stream_key}.m3u8
func (c *CDNURLBuilder) BuildHLSPlaybackURL(streamKey string) string {
	return fmt.Sprintf("%s/live/%s.m3u8", c.BaseURL, streamKey)
}

// BuildSegmentURL constructs CDN URL for HLS segment
// Format: https://{cdn_domain}/live/{stream_key}-{seq}.ts
func (c *CDNURLBuilder) BuildSegmentURL(streamKey string, seq int) string {
	return fmt.Sprintf("%s/live/%s-%d.ts", c.BaseURL, streamKey, seq)
}

// BuildThumbnailURL constructs CDN URL for stream thumbnail (if available)
// Format: https://{cdn_domain}/live/{stream_key}.jpg
func (c *CDNURLBuilder) BuildThumbnailURL(streamKey string) string {
	return fmt.Sprintf("%s/live/%s.jpg", c.BaseURL, streamKey)
}

// SRSHealthChecker provides health check functionality for SRS server
type SRSHealthChecker struct {
	apiURL     string
	httpClient *http.Client
}

// SRSVersionResponse represents the response from SRS /api/v1/versions endpoint
type SRSVersionResponse struct {
	Code   int `json:"code"`
	Server int `json:"server"`
	Data   struct {
		Major    int    `json:"major"`
		Minor    int    `json:"minor"`
		Revision int    `json:"revision"`
		Version  string `json:"version"`
	} `json:"data"`
}

// SRSSummaryResponse represents the response from SRS /api/v1/summaries endpoint
type SRSSummaryResponse struct {
	Code   int `json:"code"`
	Server int `json:"server"`
	Data   struct {
		OK   bool `json:"ok"`
		Now  int  `json:"now_ms"`
		Self struct {
			Version   string `json:"version"`
			PID       int    `json:"pid"`
			PPID      int    `json:"ppid"`
			Argv      string `json:"argv"`
			Cwd       string `json:"cwd"`
			MemKB     int    `json:"mem_kbyte"`
			MemPercent float64 `json:"mem_percent"`
			CPUPercent float64 `json:"cpu_percent"`
		} `json:"self"`
	} `json:"data"`
}

// NewSRSHealthChecker creates a new health checker
func NewSRSHealthChecker(serverIP string, apiPort int) *SRSHealthChecker {
	return &SRSHealthChecker{
		apiURL: fmt.Sprintf("http://%s:%d", serverIP, apiPort),
		httpClient: &http.Client{
			Timeout: 5 * time.Second,
		},
	}
}

// CheckHealth performs a health check on the SRS server
// Returns nil if healthy, error otherwise
func (h *SRSHealthChecker) CheckHealth(ctx context.Context) error {
	_, err := h.GetVersion(ctx)
	return err
}

// GetVersion retrieves the SRS server version
func (h *SRSHealthChecker) GetVersion(ctx context.Context) (*SRSVersionResponse, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, h.apiURL+"/api/v1/versions", nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	resp, err := h.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("SRS server unreachable: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("SRS server returned status %d", resp.StatusCode)
	}

	var version SRSVersionResponse
	if err := json.NewDecoder(resp.Body).Decode(&version); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	if version.Code != 0 {
		return nil, fmt.Errorf("SRS returned error code: %d", version.Code)
	}

	return &version, nil
}

// GetSummary retrieves the SRS server summary/stats
func (h *SRSHealthChecker) GetSummary(ctx context.Context) (*SRSSummaryResponse, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, h.apiURL+"/api/v1/summaries", nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	resp, err := h.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("SRS server unreachable: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("SRS server returned status %d", resp.StatusCode)
	}

	var summary SRSSummaryResponse
	if err := json.NewDecoder(resp.Body).Decode(&summary); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	if summary.Code != 0 {
		return nil, fmt.Errorf("SRS returned error code: %d", summary.Code)
	}

	return &summary, nil
}

// IsAlive is a simple check if SRS is responding
func (h *SRSHealthChecker) IsAlive(ctx context.Context) bool {
	return h.CheckHealth(ctx) == nil
}

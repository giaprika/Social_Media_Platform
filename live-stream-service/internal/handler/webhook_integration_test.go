//go:build integration
// +build integration

package handler_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"runtime"
	"testing"
	"time"

	"live-service/internal/config"
	"live-service/internal/entity"
	"live-service/internal/handler"
	"live-service/internal/middleware"
	"live-service/internal/repository"
	"live-service/internal/service"

	"github.com/gin-gonic/gin"
	"github.com/jmoiron/sqlx"
	_ "github.com/lib/pq"
)

var (
	testDB      *sqlx.DB
	testRouter  *gin.Engine
	testConfig  *config.Config
	testRepo    repository.LiveRepository
	testService service.LiveService
	testHandler *handler.LiveHandler
)

func TestMain(m *testing.M) {
	// Setup
	if err := setupTestEnvironment(); err != nil {
		fmt.Printf("Failed to setup test environment: %v\n", err)
		os.Exit(1)
	}

	// Run tests
	code := m.Run()

	// Cleanup
	cleanupTestEnvironment()

	os.Exit(code)
}

func setupTestEnvironment() error {
	gin.SetMode(gin.TestMode)

	var err error
	testConfig, err = config.Load()
	if err != nil {
		return fmt.Errorf("failed to load config: %w", err)
	}

	testDB, err = sqlx.Connect("postgres", testConfig.GetDSN())
	if err != nil {
		return fmt.Errorf("failed to connect to database: %w", err)
	}

	testRepo = repository.NewLiveRepository(testDB)
	testService = service.NewLiveService(testRepo, testConfig)
	testHandler = handler.NewLiveHandler(testService)

	testRouter = setupRouter()

	return nil
}

func setupRouter() *gin.Engine {
	router := gin.New()
	router.Use(gin.Recovery())

	v1 := router.Group("/api/v1")
	{
		live := v1.Group("/live")
		{
			live.POST("/create", middleware.Auth(), testHandler.CreateStream)
			live.GET("/feed", testHandler.ListStreams)
			live.GET("/:id", testHandler.GetStreamDetail)
		}

		callbacks := v1.Group("/callbacks")
		{
			callbacks.POST("/on_publish", testHandler.OnPublish)
			callbacks.POST("/on_unpublish", testHandler.OnUnpublish)
		}
	}

	return router
}

func cleanupTestEnvironment() {
	if testDB != nil {
		testDB.Close()
	}
}

// cleanupTestStream removes test stream from database
func cleanupTestStream(t *testing.T, streamID string) {
	_, err := testDB.Exec("DELETE FROM live_sessions WHERE id = $1", streamID)
	if err != nil {
		t.Logf("Warning: failed to cleanup stream %s: %v", streamID, err)
	}
}

// createTestStream creates a stream for testing
func createTestStream(t *testing.T, userID string, title string) *entity.CreateStreamResponse {
	reqBody := map[string]string{"title": title}
	body, _ := json.Marshal(reqBody)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/live/create", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-User-ID", userID)

	w := httptest.NewRecorder()
	testRouter.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("Failed to create test stream: %d - %s", w.Code, w.Body.String())
	}

	var resp entity.CreateStreamResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	return &resp
}

// getStreamStatus retrieves current stream status from database
func getStreamStatus(t *testing.T, streamID string) entity.LiveSessionStatus {
	var status entity.LiveSessionStatus
	err := testDB.Get(&status, "SELECT status FROM live_sessions WHERE id = $1", streamID)
	if err != nil {
		t.Fatalf("Failed to get stream status: %v", err)
	}
	return status
}

// simulateOnPublish simulates SRS on_publish webhook
func simulateOnPublish(t *testing.T, streamID string, token string) int {
	reqBody := map[string]string{
		"action":    "on_publish",
		"client_id": "test-client-123",
		"ip":        "127.0.0.1",
		"vhost":     "__defaultVhost__",
		"app":       "live",
		"stream":    streamID,
		"param":     "?token=" + token,
	}
	body, _ := json.Marshal(reqBody)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/callbacks/on_publish", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")

	w := httptest.NewRecorder()
	testRouter.ServeHTTP(w, req)

	return w.Code
}

// simulateOnUnpublish simulates SRS on_unpublish webhook
func simulateOnUnpublish(t *testing.T, streamID string) int {
	reqBody := map[string]string{
		"action":    "on_unpublish",
		"client_id": "test-client-123",
		"ip":        "127.0.0.1",
		"vhost":     "__defaultVhost__",
		"app":       "live",
		"stream":    streamID,
	}
	body, _ := json.Marshal(reqBody)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/callbacks/on_unpublish", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")

	w := httptest.NewRecorder()
	testRouter.ServeHTTP(w, req)

	return w.Code
}

// ===========================================
// Task 8: Integration Test - RTMP Publish
// ===========================================

func TestOnPublish_ValidStreamKey(t *testing.T) {
	// Create a test stream
	userID := "550e8400-e29b-41d4-a716-446655440000"
	stream := createTestStream(t, userID, "Test Stream - OnPublish Valid")
	defer cleanupTestStream(t, stream.ID)

	// Verify initial status is IDLE
	status := getStreamStatus(t, stream.ID)
	if status != entity.StatusIdle {
		t.Errorf("Expected initial status IDLE, got %s", status)
	}

	// Simulate on_publish webhook
	code := simulateOnPublish(t, stream.ID, stream.StreamKey)

	// Verify response
	if code != http.StatusOK {
		t.Errorf("Expected status 200, got %d", code)
	}

	// Verify status changed to LIVE
	status = getStreamStatus(t, stream.ID)
	if status != entity.StatusLive {
		t.Errorf("Expected status LIVE after on_publish, got %s", status)
	}

	// Verify started_at is set
	var startedAt *time.Time
	err := testDB.Get(&startedAt, "SELECT started_at FROM live_sessions WHERE id = $1", stream.ID)
	if err != nil {
		t.Fatalf("Failed to get started_at: %v", err)
	}
	if startedAt == nil {
		t.Error("Expected started_at to be set after on_publish")
	}
}

func TestOnPublish_InvalidStreamKey(t *testing.T) {
	// Simulate on_publish with invalid stream key
	code := simulateOnPublish(t, "invalid_stream_id_12345", "")

	// Should return 403 Forbidden
	if code != http.StatusForbidden {
		t.Errorf("Expected status 403 for invalid stream key, got %d", code)
	}
}

func TestOnPublish_DuplicatePublish(t *testing.T) {
	// Create a test stream
	userID := "550e8400-e29b-41d4-a716-446655440001"
	stream := createTestStream(t, userID, "Test Stream - Duplicate Publish")
	defer cleanupTestStream(t, stream.ID)

	// First publish - should succeed
	code := simulateOnPublish(t, stream.ID, stream.StreamKey)
	if code != http.StatusOK {
		t.Fatalf("First on_publish failed: %d", code)
	}

	// Second publish - should fail (already LIVE)
	code = simulateOnPublish(t, stream.ID, stream.StreamKey)
	if code != http.StatusForbidden {
		t.Errorf("Expected 403 for duplicate publish, got %d", code)
	}
}

// ===========================================
// Task 9: Integration Test - Stop Stream
// ===========================================

func TestOnUnpublish_ValidStream(t *testing.T) {
	// Create and start a test stream
	userID := "550e8400-e29b-41d4-a716-446655440002"
	stream := createTestStream(t, userID, "Test Stream - OnUnpublish Valid")
	defer cleanupTestStream(t, stream.ID)

	// Start the stream first
	code := simulateOnPublish(t, stream.ID, stream.StreamKey)
	if code != http.StatusOK {
		t.Fatalf("Failed to start stream: %d", code)
	}

	// Verify status is LIVE
	status := getStreamStatus(t, stream.ID)
	if status != entity.StatusLive {
		t.Fatalf("Expected status LIVE, got %s", status)
	}

	// Simulate on_unpublish webhook
	code = simulateOnUnpublish(t, stream.ID)

	// Should return 200
	if code != http.StatusOK {
		t.Errorf("Expected status 200, got %d", code)
	}

	// Verify status changed to ENDED
	status = getStreamStatus(t, stream.ID)
	if status != entity.StatusEnded {
		t.Errorf("Expected status ENDED after on_unpublish, got %s", status)
	}

	// Verify ended_at is set
	var endedAt *time.Time
	err := testDB.Get(&endedAt, "SELECT ended_at FROM live_sessions WHERE id = $1", stream.ID)
	if err != nil {
		t.Fatalf("Failed to get ended_at: %v", err)
	}
	if endedAt == nil {
		t.Error("Expected ended_at to be set after on_unpublish")
	}

	// Verify viewer_count is reset to 0
	var viewerCount int
	err = testDB.Get(&viewerCount, "SELECT viewer_count FROM live_sessions WHERE id = $1", stream.ID)
	if err != nil {
		t.Fatalf("Failed to get viewer_count: %v", err)
	}
	if viewerCount != 0 {
		t.Errorf("Expected viewer_count 0 after on_unpublish, got %d", viewerCount)
	}
}

func TestOnUnpublish_InvalidStreamKey(t *testing.T) {
	// Simulate on_unpublish with invalid stream key
	// Should still return 200 (stream already stopped)
	code := simulateOnUnpublish(t, "invalid_stream_id_12345")

	if code != http.StatusOK {
		t.Errorf("Expected status 200 for invalid stream key on unpublish, got %d", code)
	}
}

func TestOnUnpublish_AlreadyEnded(t *testing.T) {
	// Create, start, and end a stream
	userID := "550e8400-e29b-41d4-a716-446655440003"
	stream := createTestStream(t, userID, "Test Stream - Already Ended")
	defer cleanupTestStream(t, stream.ID)

	simulateOnPublish(t, stream.ID, stream.StreamKey)
	simulateOnUnpublish(t, stream.ID)

	// Try to unpublish again - should still return 200
	code := simulateOnUnpublish(t, stream.ID)
	if code != http.StatusOK {
		t.Errorf("Expected status 200 for already ended stream, got %d", code)
	}
}

// ===========================================
// Full Integration Test with ffmpeg (optional)
// Requires: ffmpeg installed, SRS running
// ===========================================

func TestFullRTMPIntegration(t *testing.T) {
	if os.Getenv("RUN_FFMPEG_TESTS") != "true" {
		t.Skip("Skipping ffmpeg integration test. Set RUN_FFMPEG_TESTS=true to run")
	}

	// Check if ffmpeg is available
	if _, err := exec.LookPath("ffmpeg"); err != nil {
		t.Skip("ffmpeg not found in PATH")
	}

	// Check if SRS is running
	srsURL := fmt.Sprintf("http://%s:%d/api/v1/versions", testConfig.SRS.ServerIP, testConfig.SRS.APIPort)
	resp, err := http.Get(srsURL)
	if err != nil || resp.StatusCode != http.StatusOK {
		t.Skip("SRS server not running")
	}
	resp.Body.Close()

	// Create a test stream
	userID := "550e8400-e29b-41d4-a716-446655440064"
	stream := createTestStream(t, userID, "Full RTMP Integration Test")
	defer cleanupTestStream(t, stream.ID)

	// Build RTMP URL (new flow: /live/{stream_id}?token={stream_key})
	rtmpURL := stream.RTMPUrl

	t.Logf("RTMP URL: %s", rtmpURL)

	// Start ffmpeg in background
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		cmd = exec.CommandContext(ctx, "ffmpeg",
			"-re",
			"-f", "lavfi", "-i", "testsrc=size=320x240:rate=15",
			"-f", "lavfi", "-i", "sine=frequency=1000:sample_rate=44100",
			"-c:v", "libx264", "-preset", "ultrafast", "-tune", "zerolatency",
			"-c:a", "aac", "-b:a", "64k",
			"-f", "flv",
			"-t", "10",
			rtmpURL)
	} else {
		cmd = exec.CommandContext(ctx, "ffmpeg",
			"-re",
			"-f", "lavfi", "-i", "testsrc=size=320x240:rate=15",
			"-f", "lavfi", "-i", "sine=frequency=1000:sample_rate=44100",
			"-c:v", "libx264", "-preset", "ultrafast", "-tune", "zerolatency",
			"-c:a", "aac", "-b:a", "64k",
			"-f", "flv",
			"-t", "10",
			rtmpURL)
	}

	// Start ffmpeg
	if err := cmd.Start(); err != nil {
		t.Fatalf("Failed to start ffmpeg: %v", err)
	}

	// Wait for stream to start (SRS webhook should fire)
	time.Sleep(3 * time.Second)

	// Verify status is LIVE
	status := getStreamStatus(t, stream.ID)
	if status != entity.StatusLive {
		t.Errorf("Expected status LIVE after ffmpeg start, got %s", status)
	}

	// Wait for ffmpeg to finish
	if err := cmd.Wait(); err != nil {
		// Context timeout is expected
		if ctx.Err() != context.DeadlineExceeded {
			t.Logf("ffmpeg exited: %v", err)
		}
	}

	// Wait for unpublish webhook
	time.Sleep(2 * time.Second)

	// Verify status is ENDED
	status = getStreamStatus(t, stream.ID)
	if status != entity.StatusEnded {
		t.Errorf("Expected status ENDED after ffmpeg stop, got %s", status)
	}

	t.Log("Full RTMP integration test passed!")
}

// ===========================================
// Task 10: Error Handling Tests
// ===========================================

func TestOnPublish_EmptyStreamKey(t *testing.T) {
	reqBody := map[string]string{
		"action":    "on_publish",
		"client_id": "test-client",
		"ip":        "127.0.0.1",
		"vhost":     "__defaultVhost__",
		"app":       "live",
		"stream":    "", // Empty stream key
	}
	body, _ := json.Marshal(reqBody)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/callbacks/on_publish", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")

	w := httptest.NewRecorder()
	testRouter.ServeHTTP(w, req)

	if w.Code != http.StatusForbidden {
		t.Errorf("Expected 403 for empty stream key, got %d", w.Code)
	}

	var resp entity.SRSCallbackResponse
	json.Unmarshal(w.Body.Bytes(), &resp)
	if resp.Code != 1 {
		t.Errorf("Expected code=1 for rejection, got %d", resp.Code)
	}
}

func TestOnPublish_MalformedJSON(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/api/v1/callbacks/on_publish", bytes.NewReader([]byte("not json")))
	req.Header.Set("Content-Type", "application/json")

	w := httptest.NewRecorder()
	testRouter.ServeHTTP(w, req)

	if w.Code != http.StatusForbidden {
		t.Errorf("Expected 403 for malformed JSON, got %d", w.Code)
	}
}

func TestOnPublish_StreamAlreadyEnded(t *testing.T) {
	// Create, start, and end a stream
	userID := "550e8400-e29b-41d4-a716-44665544000a"
	stream := createTestStream(t, userID, "Test Stream - Already Ended Publish")
	defer cleanupTestStream(t, stream.ID)

	// Start and end the stream
	simulateOnPublish(t, stream.ID, stream.StreamKey)
	simulateOnUnpublish(t, stream.ID)

	// Verify status is ENDED
	status := getStreamStatus(t, stream.ID)
	if status != entity.StatusEnded {
		t.Fatalf("Expected status ENDED, got %s", status)
	}

	// Try to publish again - should fail
	code := simulateOnPublish(t, stream.ID, stream.StreamKey)
	if code != http.StatusForbidden {
		t.Errorf("Expected 403 for ended stream, got %d", code)
	}
}

func TestOnUnpublish_EmptyStreamKey(t *testing.T) {
	reqBody := map[string]string{
		"action":    "on_unpublish",
		"client_id": "test-client",
		"ip":        "127.0.0.1",
		"vhost":     "__defaultVhost__",
		"app":       "live",
		"stream":    "", // Empty stream key
	}
	body, _ := json.Marshal(reqBody)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/callbacks/on_unpublish", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")

	w := httptest.NewRecorder()
	testRouter.ServeHTTP(w, req)

	// Should still return 200 for unpublish
	if w.Code != http.StatusOK {
		t.Errorf("Expected 200 for empty stream key on unpublish, got %d", w.Code)
	}
}

func TestOnUnpublish_MalformedJSON(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/api/v1/callbacks/on_unpublish", bytes.NewReader([]byte("not json")))
	req.Header.Set("Content-Type", "application/json")

	w := httptest.NewRecorder()
	testRouter.ServeHTTP(w, req)

	// Should still return 200 for unpublish
	if w.Code != http.StatusOK {
		t.Errorf("Expected 200 for malformed JSON on unpublish, got %d", w.Code)
	}
}

func TestOnUnpublish_NeverStartedStream(t *testing.T) {
	// Create a stream but never start it
	userID := "550e8400-e29b-41d4-a716-44665544000b"
	stream := createTestStream(t, userID, "Test Stream - Never Started")
	defer cleanupTestStream(t, stream.ID)

	// Verify status is IDLE
	status := getStreamStatus(t, stream.ID)
	if status != entity.StatusIdle {
		t.Fatalf("Expected status IDLE, got %s", status)
	}

	// Try to unpublish - should return 200 (graceful handling)
	code := simulateOnUnpublish(t, stream.ID)
	if code != http.StatusOK {
		t.Errorf("Expected 200 for never started stream, got %d", code)
	}
}

func TestOnPublish_FormURLEncoded(t *testing.T) {
	// Create a test stream
	userID := "550e8400-e29b-41d4-a716-44665544000c"
	stream := createTestStream(t, userID, "Test Stream - Form Encoded")
	defer cleanupTestStream(t, stream.ID)

	// Send as form-urlencoded (SRS sometimes sends this format)
	formData := fmt.Sprintf("action=on_publish&client_id=test&ip=127.0.0.1&vhost=__defaultVhost__&app=live&stream=%s&param=?token=%s", stream.ID, stream.StreamKey)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/callbacks/on_publish", bytes.NewReader([]byte(formData)))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	w := httptest.NewRecorder()
	testRouter.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected 200 for form-urlencoded request, got %d", w.Code)
	}

	// Verify status changed to LIVE
	status := getStreamStatus(t, stream.ID)
	if status != entity.StatusLive {
		t.Errorf("Expected status LIVE, got %s", status)
	}
}

func TestWebhookIdempotency(t *testing.T) {
	// Create and start a stream
	userID := "550e8400-e29b-41d4-a716-44665544000d"
	stream := createTestStream(t, userID, "Test Stream - Idempotency")
	defer cleanupTestStream(t, stream.ID)

	// Start the stream
	code := simulateOnPublish(t, stream.ID, stream.StreamKey)
	if code != http.StatusOK {
		t.Fatalf("First publish failed: %d", code)
	}

	// End the stream
	code = simulateOnUnpublish(t, stream.ID)
	if code != http.StatusOK {
		t.Fatalf("First unpublish failed: %d", code)
	}

	// Multiple unpublish calls should all succeed (idempotent)
	for i := 0; i < 3; i++ {
		code = simulateOnUnpublish(t, stream.ID)
		if code != http.StatusOK {
			t.Errorf("Unpublish attempt %d failed: %d", i+1, code)
		}
	}

	// Status should still be ENDED
	status := getStreamStatus(t, stream.ID)
	if status != entity.StatusEnded {
		t.Errorf("Expected status ENDED after multiple unpublish, got %s", status)
	}
}

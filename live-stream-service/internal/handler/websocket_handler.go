package handler

import (
	"log"
	"net/http"
	"strconv"

	"live-service/internal/websocket"

	"github.com/gin-gonic/gin"
	gorilla "github.com/gorilla/websocket"
)

var upgrader = gorilla.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	// Allow all origins for development - restrict in production
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

// WebSocketHandler handles WebSocket connections
type WebSocketHandler struct {
	hub *websocket.Hub
}

// NewWebSocketHandler creates a new WebSocket handler
func NewWebSocketHandler(hub *websocket.Hub) *WebSocketHandler {
	return &WebSocketHandler{
		hub: hub,
	}
}

// HandleWebSocket handles GET /ws/live/:id
// Query params:
//   - user_id: required, user identifier
//   - username: optional, display name (defaults to "User_{user_id}")
//
// @Summary Connect to live stream WebSocket
// @Description Upgrade HTTP connection to WebSocket for real-time chat and viewer updates
// @Tags websocket
// @Param id path int true "Stream ID"
// @Param user_id query int true "User ID"
// @Param username query string false "Display username"
// @Success 101 {string} string "Switching Protocols"
// @Failure 400 {object} ErrorResponse
// @Router /ws/live/{id} [get]
func (h *WebSocketHandler) HandleWebSocket(c *gin.Context) {
	// Parse stream ID from path
	idStr := c.Param("id")
	streamID, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil || streamID <= 0 {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Error:   "invalid_stream_id",
			Message: "Stream ID must be a valid positive integer",
		})
		return
	}

	// Parse user_id from query param (required)
	userIDStr := c.Query("user_id")
	if userIDStr == "" {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Error:   "missing_user_id",
			Message: "user_id query parameter is required",
		})
		return
	}

	userID, err := strconv.ParseInt(userIDStr, 10, 64)
	if err != nil || userID <= 0 {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Error:   "invalid_user_id",
			Message: "user_id must be a valid positive integer",
		})
		return
	}

	// Parse username from query param (optional)
	username := c.Query("username")
	if username == "" {
		username = "User_" + userIDStr
	}

	// Upgrade HTTP connection to WebSocket
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("WebSocket upgrade failed: %v", err)
		return
	}

	// Create client and register with hub
	client := websocket.NewClient(h.hub, conn, streamID, userID, username)
	h.hub.Register(client)

	// Start read/write pumps in goroutines
	go client.WritePump()
	go client.ReadPump()
}

// GetViewerCount handles GET /api/v1/live/:id/viewers
// @Summary Get current viewer count
// @Description Get real-time viewer count for a stream from WebSocket hub
// @Tags live
// @Param id path int true "Stream ID"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} ErrorResponse
// @Router /api/v1/live/{id}/viewers [get]
func (h *WebSocketHandler) GetViewerCount(c *gin.Context) {
	// Parse stream ID from path
	idStr := c.Param("id")
	streamID, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil || streamID <= 0 {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Error:   "invalid_stream_id",
			Message: "Stream ID must be a valid positive integer",
		})
		return
	}

	count := h.hub.GetViewerCount(streamID)
	c.JSON(http.StatusOK, gin.H{
		"stream_id":    streamID,
		"viewer_count": count,
	})
}

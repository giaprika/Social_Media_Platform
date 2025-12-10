package handler

import (
	"net/http"

	"live-service/internal/service"

	"github.com/gin-gonic/gin"
)

type LiveHandler struct {
	service service.LiveService
}

func NewLiveHandler(service service.LiveService) *LiveHandler {
	return &LiveHandler{
		service: service,
	}
}

// CreateStream handles POST /api/v1/live/create
func (h *LiveHandler) CreateStream(c *gin.Context) {
	// This will be implemented in the next tasks
	c.JSON(http.StatusNotImplemented, gin.H{
		"error": "Not implemented yet",
	})
}

// ListStreams handles GET /api/v1/live/feed
func (h *LiveHandler) ListStreams(c *gin.Context) {
	// This will be implemented in the next tasks
	c.JSON(http.StatusNotImplemented, gin.H{
		"error": "Not implemented yet",
	})
}

// GetStreamDetail handles GET /api/v1/live/:id
func (h *LiveHandler) GetStreamDetail(c *gin.Context) {
	// This will be implemented in the next tasks
	c.JSON(http.StatusNotImplemented, gin.H{
		"error": "Not implemented yet",
	})
}

// OnPublish handles SRS callback when stream starts
func (h *LiveHandler) OnPublish(c *gin.Context) {
	// This will be implemented in the next tasks
	c.JSON(http.StatusOK, gin.H{
		"code": 0,
	})
}

// OnUnpublish handles SRS callback when stream ends
func (h *LiveHandler) OnUnpublish(c *gin.Context) {
	// This will be implemented in the next tasks
	c.JSON(http.StatusOK, gin.H{
		"code": 0,
	})
}

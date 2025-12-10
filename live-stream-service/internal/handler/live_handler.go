package handler

import (
	"errors"
	"net/http"
	"strconv"

	"live-service/internal/entity"
	"live-service/internal/repository"
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
// @Summary Create a new live stream
// @Description Creates a new live streaming session and returns stream credentials
// @Tags live
// @Accept json
// @Produce json
// @Param request body entity.CreateStreamRequest true "Stream creation request"
// @Success 201 {object} entity.CreateStreamResponse
// @Failure 400 {object} ErrorResponse
// @Failure 401 {object} ErrorResponse
// @Failure 500 {object} ErrorResponse
// @Router /api/v1/live/create [post]
func (h *LiveHandler) CreateStream(c *gin.Context) {
	// Get user ID from context (set by auth middleware)
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, ErrorResponse{
			Error:   "unauthorized",
			Message: "User authentication required",
		})
		return
	}

	// Parse request body
	var req entity.CreateStreamRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Error:   "invalid_request",
			Message: "Invalid request body: " + err.Error(),
		})
		return
	}

	// Create stream
	resp, err := h.service.CreateStream(c.Request.Context(), userID.(int64), &req)
	if err != nil {
		// Check for duplicate key error
		if errors.Is(err, repository.ErrDuplicateKey) {
			c.JSON(http.StatusConflict, ErrorResponse{
				Error:   "duplicate_stream",
				Message: "A stream with this key already exists",
			})
			return
		}

		c.JSON(http.StatusInternalServerError, ErrorResponse{
			Error:   "stream_creation_failed",
			Message: "Failed to create stream",
		})
		return
	}

	c.JSON(http.StatusCreated, resp)
}

// ErrorResponse represents an API error response
type ErrorResponse struct {
	Error   string `json:"error"`
	Message string `json:"message"`
}

// ListStreams handles GET /api/v1/live/feed
// @Summary List live streams
// @Description Get paginated list of currently live streams
// @Tags live
// @Accept json
// @Produce json
// @Param page query int false "Page number" default(1)
// @Param limit query int false "Items per page" default(20)
// @Success 200 {object} entity.ListStreamsResponse
// @Failure 500 {object} ErrorResponse
// @Router /api/v1/live/feed [get]
func (h *LiveHandler) ListStreams(c *gin.Context) {
	// Parse pagination params
	params := entity.DefaultPagination()
	if err := c.ShouldBindQuery(&params); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Error:   "invalid_params",
			Message: "Invalid pagination parameters: " + err.Error(),
		})
		return
	}

	// Ensure valid defaults
	if params.Page < 1 {
		params.Page = 1
	}
	if params.Limit < 1 || params.Limit > 100 {
		params.Limit = 20
	}

	resp, err := h.service.ListStreams(c.Request.Context(), params)
	if err != nil {
		c.JSON(http.StatusInternalServerError, ErrorResponse{
			Error:   "list_failed",
			Message: "Failed to retrieve streams",
		})
		return
	}

	c.JSON(http.StatusOK, resp)
}

// GetStreamDetail handles GET /api/v1/live/:id
// @Summary Get stream details
// @Description Get detailed information about a specific stream
// @Tags live
// @Accept json
// @Produce json
// @Param id path int true "Stream ID"
// @Success 200 {object} entity.StreamDetailResponse
// @Failure 400 {object} ErrorResponse
// @Failure 404 {object} ErrorResponse
// @Failure 500 {object} ErrorResponse
// @Router /api/v1/live/{id} [get]
func (h *LiveHandler) GetStreamDetail(c *gin.Context) {
	// Parse stream ID from path
	idStr := c.Param("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Error:   "invalid_id",
			Message: "Stream ID must be a valid positive integer",
		})
		return
	}

	// Get user ID from context (optional for public streams)
	var userID int64
	if uid, exists := c.Get("user_id"); exists {
		userID = uid.(int64)
	}

	resp, err := h.service.GetStreamDetail(c.Request.Context(), id, userID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			c.JSON(http.StatusNotFound, ErrorResponse{
				Error:   "not_found",
				Message: "Stream not found",
			})
			return
		}
		c.JSON(http.StatusInternalServerError, ErrorResponse{
			Error:   "fetch_failed",
			Message: "Failed to retrieve stream details",
		})
		return
	}

	c.JSON(http.StatusOK, resp)
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

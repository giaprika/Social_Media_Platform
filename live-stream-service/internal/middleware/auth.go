package middleware

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

// Auth middleware extracts user ID from X-User-ID header
// This assumes authentication is handled by API Gateway or upstream service
func Auth() gin.HandlerFunc {
	return func(c *gin.Context) {
		userIDStr := c.GetHeader("X-User-ID")
		if userIDStr == "" {
			c.JSON(http.StatusUnauthorized, gin.H{
				"error":   "unauthorized",
				"message": "X-User-ID header required",
			})
			c.Abort()
			return
		}

		userID, err := strconv.ParseInt(userIDStr, 10, 64)
		if err != nil || userID <= 0 {
			c.JSON(http.StatusBadRequest, gin.H{
				"error":   "invalid_user_id",
				"message": "X-User-ID must be a valid positive integer",
			})
			c.Abort()
			return
		}

		// Set user ID in context for handlers to use
		c.Set("user_id", userID)
		c.Next()
	}
}

// AuthWebSocket middleware extracts user ID from query param for WebSocket connections
// WebSocket uses ?user_id= query param since headers are not easily set
func AuthWebSocket() gin.HandlerFunc {
	return func(c *gin.Context) {
		userIDStr := c.Query("user_id")
		if userIDStr == "" {
			c.JSON(http.StatusUnauthorized, gin.H{
				"error":   "unauthorized",
				"message": "user_id query parameter required",
			})
			c.Abort()
			return
		}

		userID, err := strconv.ParseInt(userIDStr, 10, 64)
		if err != nil || userID <= 0 {
			c.JSON(http.StatusBadRequest, gin.H{
				"error":   "invalid_user_id",
				"message": "user_id must be a valid positive integer",
			})
			c.Abort()
			return
		}

		c.Set("user_id", userID)
		c.Next()
	}
}

// OptionalAuth middleware extracts user ID if present, but doesn't require it
// Useful for public endpoints that show extra info to authenticated users
func OptionalAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		userIDStr := c.GetHeader("X-User-ID")
		if userIDStr == "" {
			c.Next()
			return
		}

		userID, err := strconv.ParseInt(userIDStr, 10, 64)
		if err == nil && userID > 0 {
			c.Set("user_id", userID)
		}
		c.Next()
	}
}

// GetUserIDFromContext extracts user ID from gin context
func GetUserIDFromContext(c *gin.Context) (int64, bool) {
	userID, exists := c.Get("user_id")
	if !exists {
		return 0, false
	}

	id, ok := userID.(int64)
	return id, ok
}

package middleware

import (
	"net/http"

	"live-service/internal/entity"

	"github.com/gin-gonic/gin"
)

// Auth middleware extracts user ID (UUID) from X-User-ID header
// This assumes authentication is handled by API Gateway or upstream service
func Auth() gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.GetHeader("X-User-ID")
		if userID == "" {
			c.JSON(http.StatusUnauthorized, gin.H{
				"error":   "unauthorized",
				"message": "X-User-ID header required",
			})
			c.Abort()
			return
		}

		if !entity.IsValidUUID(userID) {
			c.JSON(http.StatusBadRequest, gin.H{
				"error":   "invalid_user_id",
				"message": "X-User-ID must be a valid UUID",
			})
			c.Abort()
			return
		}

		// Set user ID in context for handlers to use
		c.Set("user_id", userID)
		c.Next()
	}
}

// AuthWebSocket middleware extracts user ID (UUID) from query param for WebSocket connections
// WebSocket uses ?user_id= query param since headers are not easily set
func AuthWebSocket() gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.Query("user_id")
		if userID == "" {
			c.JSON(http.StatusUnauthorized, gin.H{
				"error":   "unauthorized",
				"message": "user_id query parameter required",
			})
			c.Abort()
			return
		}

		if !entity.IsValidUUID(userID) {
			c.JSON(http.StatusBadRequest, gin.H{
				"error":   "invalid_user_id",
				"message": "user_id must be a valid UUID",
			})
			c.Abort()
			return
		}

		c.Set("user_id", userID)
		c.Next()
	}
}

// OptionalAuth middleware extracts user ID (UUID) if present, but doesn't require it
// Useful for public endpoints that show extra info to authenticated users
func OptionalAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.GetHeader("X-User-ID")
		if userID == "" {
			c.Next()
			return
		}

		if entity.IsValidUUID(userID) {
			c.Set("user_id", userID)
		}
		c.Next()
	}
}

// GetUserIDFromContext extracts user ID (UUID string) from gin context
func GetUserIDFromContext(c *gin.Context) (string, bool) {
	userID, exists := c.Get("user_id")
	if !exists {
		return "", false
	}

	id, ok := userID.(string)
	return id, ok
}

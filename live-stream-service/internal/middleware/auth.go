package middleware

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

// Auth middleware validates JWT tokens and extracts user information
func Auth() gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.JSON(http.StatusUnauthorized, gin.H{
				"error": "Authorization header required",
			})
			c.Abort()
			return
		}

		// Extract token from "Bearer <token>"
		tokenParts := strings.Split(authHeader, " ")
		if len(tokenParts) != 2 || tokenParts[0] != "Bearer" {
			c.JSON(http.StatusUnauthorized, gin.H{
				"error": "Invalid authorization header format",
			})
			c.Abort()
			return
		}

		token := tokenParts[1]

		// TODO: Implement JWT validation with auth service
		// For now, we'll use a stub implementation
		userID, err := validateTokenStub(token)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{
				"error": "Invalid token",
			})
			c.Abort()
			return
		}

		// Set user ID in context for handlers to use
		c.Set("user_id", userID)
		c.Next()
	}
}

// validateTokenStub is a placeholder for JWT validation
// This will be replaced with actual JWT validation logic
func validateTokenStub(token string) (int64, error) {
	// Stub implementation - always return user ID 1 for valid-looking tokens
	if len(token) > 10 {
		return 1, nil
	}
	return 0, gin.Error{Err: nil, Type: gin.ErrorTypePublic}
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

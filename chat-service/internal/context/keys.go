package context

// ContextKey is the type for context keys used across the application
type ContextKey string

const (
	// UserIDKey is the context key for storing authenticated user ID
	// This is set by auth middleware and used by service handlers
	UserIDKey ContextKey = "user_id"
)

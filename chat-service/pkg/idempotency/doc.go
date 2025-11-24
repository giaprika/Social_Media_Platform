// Package idempotency provides idempotency checking functionality using Redis.
//
// The package implements a Redis-based idempotency checker that uses SETNX
// (SET if Not eXists) to atomically check and mark requests as processed.
// This ensures that duplicate requests with the same idempotency key are
// detected and rejected.
//
// # Features
//
//   - Atomic check-and-set using Redis SETNX
//   - Configurable TTL (default: 24 hours)
//   - Thread-safe and concurrent-safe
//   - Automatic key expiration
//
// # Basic Usage
//
//	client := redis.NewClient(&redis.Options{
//	    Addr: "localhost:6379",
//	})
//
//	checker := idempotency.NewRedisChecker(client)
//
//	// Check idempotency
//	err := checker.Check(ctx, "request-id-123")
//	if err == idempotency.ErrDuplicateRequest {
//	    // Handle duplicate request
//	    return errors.New("duplicate request")
//	}
//
// # Custom TTL
//
//	// Create checker with 1-hour TTL
//	checker := idempotency.NewRedisCheckerWithTTL(client, 1*time.Hour)
//
//	// Or check with custom TTL per request
//	err := checker.CheckWithTTL(ctx, "request-id-456", 30*time.Minute)
//
// # Key Format
//
// All idempotency keys are stored in Redis with the prefix "idempotency:".
// For example, the key "req-123" is stored as "idempotency:req-123".
//
// # Error Handling
//
// The package defines two sentinel errors:
//   - ErrDuplicateRequest: Returned when a duplicate request is detected
//   - ErrInvalidKey: Returned when an empty key is provided
//
// Redis connection errors are wrapped and returned with additional context.
package idempotency


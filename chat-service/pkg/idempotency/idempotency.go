package idempotency

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

// Common errors
var (
	ErrDuplicateRequest = errors.New("duplicate request detected")
	ErrInvalidKey       = errors.New("invalid idempotency key")
)

// Constants
const (
	// DefaultTTL is the default time-to-live for idempotency keys (24 hours)
	DefaultTTL = 24 * time.Hour
	
	// KeyPrefix is the prefix for all idempotency keys in Redis
	KeyPrefix = "idempotency:"
)

// Checker provides idempotency checking functionality using Redis
type Checker interface {
	// Check verifies if the request with the given key has been processed before.
	// Returns ErrDuplicateRequest if the key already exists.
	// Returns nil if this is the first request with this key.
	Check(ctx context.Context, key string) error
	
	// CheckWithTTL is like Check but allows custom TTL duration.
	CheckWithTTL(ctx context.Context, key string, ttl time.Duration) error
	
	// Remove deletes an idempotency key (useful for cleanup or testing).
	Remove(ctx context.Context, key string) error
}

// RedisChecker implements Checker using Redis SETNX
type RedisChecker struct {
	client *redis.Client
	ttl    time.Duration
}

// NewRedisChecker creates a new Redis-based idempotency checker
func NewRedisChecker(client *redis.Client) *RedisChecker {
	return &RedisChecker{
		client: client,
		ttl:    DefaultTTL,
	}
}

// NewRedisCheckerWithTTL creates a new Redis-based idempotency checker with custom TTL
func NewRedisCheckerWithTTL(client *redis.Client, ttl time.Duration) *RedisChecker {
	return &RedisChecker{
		client: client,
		ttl:    ttl,
	}
}

// Check verifies if the request with the given key has been processed before
func (r *RedisChecker) Check(ctx context.Context, key string) error {
	return r.CheckWithTTL(ctx, key, r.ttl)
}

// CheckWithTTL verifies idempotency with custom TTL
func (r *RedisChecker) CheckWithTTL(ctx context.Context, key string, ttl time.Duration) error {
	if key == "" {
		return ErrInvalidKey
	}
	
	// Build the full Redis key with prefix
	redisKey := buildRedisKey(key)
	
	// Use SETNX (SET if Not eXists) to atomically check and set
	// Returns true if the key was set (first request)
	// Returns false if the key already exists (duplicate request)
	success, err := r.client.SetNX(ctx, redisKey, "1", ttl).Result()
	if err != nil {
		return fmt.Errorf("failed to check idempotency: %w", err)
	}
	
	if !success {
		return ErrDuplicateRequest
	}
	
	return nil
}

// Remove deletes an idempotency key
func (r *RedisChecker) Remove(ctx context.Context, key string) error {
	if key == "" {
		return ErrInvalidKey
	}
	
	redisKey := buildRedisKey(key)
	return r.client.Del(ctx, redisKey).Err()
}

// buildRedisKey constructs the full Redis key with prefix
func buildRedisKey(key string) string {
	return KeyPrefix + key
}


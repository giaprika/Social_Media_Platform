package idempotency

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/go-redis/redismock/v9"
	"github.com/redis/go-redis/v9"
)

func TestNewRedisChecker(t *testing.T) {
	client := redis.NewClient(&redis.Options{
		Addr: "localhost:6379",
	})
	
	checker := NewRedisChecker(client)
	
	if checker == nil {
		t.Fatal("expected non-nil checker")
	}
	
	if checker.client != client {
		t.Error("expected client to be set")
	}
	
	if checker.ttl != DefaultTTL {
		t.Errorf("expected TTL to be %v, got %v", DefaultTTL, checker.ttl)
	}
}

func TestNewRedisCheckerWithTTL(t *testing.T) {
	client := redis.NewClient(&redis.Options{
		Addr: "localhost:6379",
	})
	
	customTTL := 1 * time.Hour
	checker := NewRedisCheckerWithTTL(client, customTTL)
	
	if checker == nil {
		t.Fatal("expected non-nil checker")
	}
	
	if checker.ttl != customTTL {
		t.Errorf("expected TTL to be %v, got %v", customTTL, checker.ttl)
	}
}

func TestRedisChecker_Check_Success(t *testing.T) {
	// Setup mock Redis client
	client, mock := redismock.NewClientMock()
	checker := NewRedisChecker(client)
	
	ctx := context.Background()
	key := "test-key-123"
	expectedRedisKey := KeyPrefix + key
	
	// Mock SETNX to return true (key was set successfully)
	mock.ExpectSetNX(expectedRedisKey, "1", DefaultTTL).SetVal(true)
	
	// Execute
	err := checker.Check(ctx, key)
	
	// Assert
	if err != nil {
		t.Errorf("expected no error, got %v", err)
	}
	
	// Verify all expectations were met
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unmet expectations: %v", err)
	}
}

func TestRedisChecker_Check_DuplicateRequest(t *testing.T) {
	// Setup mock Redis client
	client, mock := redismock.NewClientMock()
	checker := NewRedisChecker(client)
	
	ctx := context.Background()
	key := "test-key-456"
	expectedRedisKey := KeyPrefix + key
	
	// Mock SETNX to return false (key already exists)
	mock.ExpectSetNX(expectedRedisKey, "1", DefaultTTL).SetVal(false)
	
	// Execute
	err := checker.Check(ctx, key)
	
	// Assert
	if !errors.Is(err, ErrDuplicateRequest) {
		t.Errorf("expected ErrDuplicateRequest, got %v", err)
	}
	
	// Verify all expectations were met
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unmet expectations: %v", err)
	}
}

func TestRedisChecker_Check_InvalidKey(t *testing.T) {
	client, _ := redismock.NewClientMock()
	checker := NewRedisChecker(client)
	
	ctx := context.Background()
	
	// Execute with empty key
	err := checker.Check(ctx, "")
	
	// Assert
	if !errors.Is(err, ErrInvalidKey) {
		t.Errorf("expected ErrInvalidKey, got %v", err)
	}
}

func TestRedisChecker_Check_RedisError(t *testing.T) {
	// Setup mock Redis client
	client, mock := redismock.NewClientMock()
	checker := NewRedisChecker(client)
	
	ctx := context.Background()
	key := "test-key-789"
	expectedRedisKey := KeyPrefix + key
	
	// Mock SETNX to return an error
	redisErr := errors.New("connection timeout")
	mock.ExpectSetNX(expectedRedisKey, "1", DefaultTTL).SetErr(redisErr)
	
	// Execute
	err := checker.Check(ctx, key)
	
	// Assert
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	
	if !errors.Is(err, redisErr) {
		t.Errorf("expected error to wrap Redis error, got %v", err)
	}
	
	// Verify all expectations were met
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unmet expectations: %v", err)
	}
}

func TestRedisChecker_CheckWithTTL_CustomTTL(t *testing.T) {
	// Setup mock Redis client
	client, mock := redismock.NewClientMock()
	checker := NewRedisChecker(client)
	
	ctx := context.Background()
	key := "test-key-custom"
	customTTL := 30 * time.Minute
	expectedRedisKey := KeyPrefix + key
	
	// Mock SETNX with custom TTL
	mock.ExpectSetNX(expectedRedisKey, "1", customTTL).SetVal(true)
	
	// Execute
	err := checker.CheckWithTTL(ctx, key, customTTL)
	
	// Assert
	if err != nil {
		t.Errorf("expected no error, got %v", err)
	}
	
	// Verify all expectations were met
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unmet expectations: %v", err)
	}
}

func TestRedisChecker_CheckWithTTL_InvalidKey(t *testing.T) {
	client, _ := redismock.NewClientMock()
	checker := NewRedisChecker(client)
	
	ctx := context.Background()
	customTTL := 1 * time.Hour
	
	// Execute with empty key
	err := checker.CheckWithTTL(ctx, "", customTTL)
	
	// Assert
	if !errors.Is(err, ErrInvalidKey) {
		t.Errorf("expected ErrInvalidKey, got %v", err)
	}
}

func TestRedisChecker_Remove_Success(t *testing.T) {
	// Setup mock Redis client
	client, mock := redismock.NewClientMock()
	checker := NewRedisChecker(client)
	
	ctx := context.Background()
	key := "test-key-remove"
	expectedRedisKey := KeyPrefix + key
	
	// Mock DEL command
	mock.ExpectDel(expectedRedisKey).SetVal(1)
	
	// Execute
	err := checker.Remove(ctx, key)
	
	// Assert
	if err != nil {
		t.Errorf("expected no error, got %v", err)
	}
	
	// Verify all expectations were met
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unmet expectations: %v", err)
	}
}

func TestRedisChecker_Remove_InvalidKey(t *testing.T) {
	client, _ := redismock.NewClientMock()
	checker := NewRedisChecker(client)
	
	ctx := context.Background()
	
	// Execute with empty key
	err := checker.Remove(ctx, "")
	
	// Assert
	if !errors.Is(err, ErrInvalidKey) {
		t.Errorf("expected ErrInvalidKey, got %v", err)
	}
}

func TestRedisChecker_Remove_RedisError(t *testing.T) {
	// Setup mock Redis client
	client, mock := redismock.NewClientMock()
	checker := NewRedisChecker(client)
	
	ctx := context.Background()
	key := "test-key-remove-error"
	expectedRedisKey := KeyPrefix + key
	
	// Mock DEL to return an error
	redisErr := errors.New("redis connection error")
	mock.ExpectDel(expectedRedisKey).SetErr(redisErr)
	
	// Execute
	err := checker.Remove(ctx, key)
	
	// Assert
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	
	if !errors.Is(err, redisErr) {
		t.Errorf("expected error to wrap Redis error, got %v", err)
	}
	
	// Verify all expectations were met
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unmet expectations: %v", err)
	}
}

func TestBuildRedisKey(t *testing.T) {
	tests := []struct {
		name     string
		key      string
		expected string
	}{
		{
			name:     "simple key",
			key:      "abc123",
			expected: "idempotency:abc123",
		},
		{
			name:     "uuid key",
			key:      "550e8400-e29b-41d4-a716-446655440000",
			expected: "idempotency:550e8400-e29b-41d4-a716-446655440000",
		},
		{
			name:     "complex key",
			key:      "user:123:message:456",
			expected: "idempotency:user:123:message:456",
		},
	}
	
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := buildRedisKey(tt.key)
			if result != tt.expected {
				t.Errorf("expected %s, got %s", tt.expected, result)
			}
		})
	}
}

func TestRedisChecker_CheckMultipleTimes(t *testing.T) {
	// Setup mock Redis client
	client, mock := redismock.NewClientMock()
	checker := NewRedisChecker(client)
	
	ctx := context.Background()
	key := "test-key-multiple"
	expectedRedisKey := KeyPrefix + key
	
	// First check - should succeed (SETNX returns true)
	mock.ExpectSetNX(expectedRedisKey, "1", DefaultTTL).SetVal(true)
	
	err := checker.Check(ctx, key)
	if err != nil {
		t.Errorf("first check: expected no error, got %v", err)
	}
	
	// Second check - should fail with duplicate (SETNX returns false)
	mock.ExpectSetNX(expectedRedisKey, "1", DefaultTTL).SetVal(false)
	
	err = checker.Check(ctx, key)
	if !errors.Is(err, ErrDuplicateRequest) {
		t.Errorf("second check: expected ErrDuplicateRequest, got %v", err)
	}
	
	// Third check - same as second
	mock.ExpectSetNX(expectedRedisKey, "1", DefaultTTL).SetVal(false)
	
	err = checker.Check(ctx, key)
	if !errors.Is(err, ErrDuplicateRequest) {
		t.Errorf("third check: expected ErrDuplicateRequest, got %v", err)
	}
	
	// Verify all expectations were met
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unmet expectations: %v", err)
	}
}

func TestRedisChecker_Interface(t *testing.T) {
	// Verify that RedisChecker implements Checker interface
	var _ Checker = (*RedisChecker)(nil)
}


# Idempotency Package

Redis-based idempotency checking for ensuring exactly-once message processing.

## Features

- ✅ Atomic check-and-set using Redis SETNX
- ✅ Configurable TTL (default: 24 hours)
- ✅ Thread-safe and concurrent-safe
- ✅ Automatic key expiration
- ✅ 100% test coverage

## Installation

```bash
go get github.com/redis/go-redis/v9
```

## Usage

### Basic Usage

```go
import (
    "context"
    "github.com/redis/go-redis/v9"
    "chat-service/pkg/idempotency"
)

// Create Redis client
client := redis.NewClient(&redis.Options{
    Addr: "localhost:6379",
})

// Create idempotency checker
checker := idempotency.NewRedisChecker(client)

// Check idempotency
err := checker.Check(ctx, "request-id-123")
if err == idempotency.ErrDuplicateRequest {
    // Handle duplicate request
    return errors.New("duplicate request detected")
}

// Process the request...
```

### Custom TTL

```go
// Create checker with 1-hour TTL
checker := idempotency.NewRedisCheckerWithTTL(client, 1*time.Hour)

// Or check with custom TTL per request
err := checker.CheckWithTTL(ctx, "request-id-456", 30*time.Minute)
```

### Cleanup (Optional)

```go
// Remove an idempotency key manually
err := checker.Remove(ctx, "request-id-123")
```

## How It Works

1. When `Check()` is called with a key, it performs a Redis `SETNX` operation
2. If the key doesn't exist, it's created with the specified TTL (returns `nil`)
3. If the key already exists, it returns `ErrDuplicateRequest`
4. Keys automatically expire after the TTL period

## Key Format

All keys are stored with the prefix `idempotency:` in Redis.

Example: `request-id-123` → `idempotency:request-id-123`

## Error Types

- `ErrDuplicateRequest`: Returned when a duplicate request is detected
- `ErrInvalidKey`: Returned when an empty key is provided

## Testing

```bash
go test ./pkg/idempotency/... -v -cover
```

Current coverage: **100%**

## Performance

- `Check()`: Single Redis command (SETNX) - typically < 1ms
- Atomic operation - no race conditions
- Keys automatically expire - no manual cleanup needed


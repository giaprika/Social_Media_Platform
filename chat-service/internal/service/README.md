# Chat Service Layer

Business logic implementation for the chat service.

## Overview

The service layer implements the gRPC `ChatService` interface and handles:
- Request validation
- Idempotency checking
- Database transactions
- Outbox pattern for event publishing
- Error handling and logging

## Components

### ChatService

Main service implementation with the following responsibilities:

1. **Validation**: Validates incoming requests for required fields
2. **Idempotency**: Prevents duplicate message processing using Redis
3. **Transactions**: Ensures atomic operations (message + outbox)
4. **Event Publishing**: Creates outbox events for async processing

## SendMessage Flow

```
Client Request
    ↓
1. Validate Request
    ↓
2. Check Idempotency (Redis SETNX)
    ↓ (if not duplicate)
3. Begin Transaction
    ↓
4. Upsert Conversation
    ↓
5. Insert Message
    ↓
6. Insert Outbox Event
    ↓
7. Commit Transaction
    ↓
Response (message_id, status)
```

## Error Handling

The service returns appropriate gRPC status codes:
- `InvalidArgument`: Validation errors
- `AlreadyExists`: Duplicate idempotency key
- `Internal`: Database or Redis errors

## Usage Example

```go
// Create service
logger := zap.NewLogger()
idempChecker := idempotency.NewRedisChecker(redisClient)
chatService := service.NewChatService(dbPool, idempChecker, logger)

// Use in gRPC server
chatv1.RegisterChatServiceServer(grpcServer, chatService)
```

## Testing

The service has comprehensive unit tests covering:
- Request validation (all edge cases)
- Idempotency checking (success, duplicate, errors)
- UUID parsing and conversion
- Event payload creation
- Context cancellation

### Run Tests

```bash
go test ./internal/service/... -v -cover
```

Current coverage: **50.7%**

Note: Transaction logic requires integration tests with real database (covered in task 11).

## Dependencies

- `pgxpool`: PostgreSQL connection pool
- `repository`: Database queries (sqlc generated)
- `idempotency`: Redis-based idempotency checking
- `zap`: Structured logging
- `grpc`: gRPC server implementation


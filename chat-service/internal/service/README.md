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

The service has comprehensive unit tests covering all major functionality including request validation, idempotency checking, database transactions, error handling, and edge cases.

### Test Organization

Tests are organized into multiple files for better maintainability:

- `chat_service_test_helpers.go` - Mock implementations and test utilities
- `chat_service_utils_test.go` - Tests for utility functions (UUID parsing, timestamp formatting, etc.)
- `chat_service_sendmessage_test.go` - Tests for SendMessage handler
- `chat_service_getmessages_test.go` - Tests for GetMessages handler
- `chat_service_getconversations_test.go` - Tests for GetConversations handler
- `chat_service_markasread_test.go` - Tests for MarkAsRead handler

### Test Coverage

Current test coverage: **>80%** for service layer

Coverage by handler:
- **SendMessage**: >90% (critical path with transaction logic)
- **GetMessages**: >85% (pagination and validation)
- **GetConversations**: >85% (authentication and pagination)
- **MarkAsRead**: >85% (validation and error handling)
- **Helper functions**: 100% (UUID parsing, timestamp formatting)

### Running Tests

```bash
# Run all service tests
go test ./internal/service/... -v

# Run with coverage report
go test ./internal/service/... -v -cover

# Generate detailed coverage report
go test ./internal/service/... -coverprofile=coverage.out
go tool cover -html=coverage.out

# Run specific test file
go test ./internal/service/... -v -run TestSendMessage

# Run tests 10 times to check for flakiness
go test ./internal/service/... -count=10
```

### Test Patterns and Best Practices

#### 1. Table-Driven Tests

Use table-driven tests for testing multiple similar scenarios:

```go
func TestGetMessages_ValidationErrors(t *testing.T) {
    service := &ChatService{logger: zap.NewNop()}

    tests := []struct {
        name    string
        req     *chatv1.GetMessagesRequest
        errCode codes.Code
    }{
        {
            name:    "nil request",
            req:     nil,
            errCode: codes.InvalidArgument,
        },
        {
            name: "empty conversation",
            req: &chatv1.GetMessagesRequest{
                ConversationId: "",
            },
            errCode: codes.InvalidArgument,
        },
        // ... more test cases
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            resp, err := service.GetMessages(context.Background(), tt.req)
            assert.Nil(t, resp)
            assert.Error(t, err)
            assert.Equal(t, tt.errCode, status.Code(err))
        })
    }
}
```

#### 2. Mock Setup Pattern

Use the `MockIdempotencyChecker` for testing idempotency logic:

```go
func TestSendMessage_DuplicateRequest(t *testing.T) {
    mockIdempotency := new(MockIdempotencyChecker)
    
    service := &ChatService{
        idempotencyCheck: mockIdempotency,
        logger:           zap.NewNop(),
    }
    
    ctx := contextWithUserID("660e8400-e29b-41d4-a716-446655440000")
    req := &chatv1.SendMessageRequest{
        ConversationId: "550e8400-e29b-41d4-a716-446655440000",
        Content:        "Hello",
        IdempotencyKey: "key-123",
    }
    
    // Configure mock to return duplicate error
    mockIdempotency.On("Check", ctx, "key-123").Return(idempotency.ErrDuplicateRequest)
    
    resp, err := service.SendMessage(ctx, req)
    
    assert.Nil(t, resp)
    assert.Error(t, err)
    assert.Equal(t, codes.AlreadyExists, status.Code(err))
    mockIdempotency.AssertExpectations(t)
}
```

#### 3. Transaction Mock Pattern

Use `mockTransactionHelpers` for testing complex transaction flows:

```go
func TestSendMessage_HappyPath(t *testing.T) {
    mockIdempotency := new(MockIdempotencyChecker)
    mocks := newMockTransactionHelpers()
    
    conversationID := mustParseUUID(t, "550e8400-e29b-41d4-a716-446655440000")
    senderID := mustParseUUID(t, "660e8400-e29b-41d4-a716-446655440000")
    messageID := mustParseUUID(t, "770e8400-e29b-41d4-a716-446655440000")
    
    // Setup happy path transaction
    mocks.setupHappyPathTransaction(conversationID, senderID, messageID, "Hello")
    
    service := &ChatService{
        idempotencyCheck: mockIdempotency,
        logger:           zap.NewNop(),
    }
    mocks.injectIntoService(service)
    
    mockIdempotency.On("Check", mock.Anything, "key-123").Return(nil)
    
    ctx := contextWithUserID(uuidToString(senderID))
    req := &chatv1.SendMessageRequest{
        ConversationId: uuidToString(conversationID),
        Content:        "Hello",
        IdempotencyKey: "key-123",
    }
    
    resp, err := service.SendMessage(ctx, req)
    
    assert.NoError(t, err)
    assert.NotNil(t, resp)
    assert.Equal(t, "SENT", resp.Status)
}
```

#### 4. Function Injection Pattern

For simpler scenarios, inject functions directly:

```go
func TestGetMessages_Success(t *testing.T) {
    service := &ChatService{
        logger: zap.NewNop(),
    }
    
    // Inject mock function for GetMessages query
    service.getMessagesFn = func(ctx context.Context, arg repository.GetMessagesParams) ([]repository.Message, error) {
        // Return test data
        message := repository.Message{
            ID:             mustParseUUID(t, "550e8400-e29b-41d4-a716-446655440000"),
            ConversationID: mustParseUUID(t, "660e8400-e29b-41d4-a716-446655440000"),
            SenderID:       mustParseUUID(t, "770e8400-e29b-41d4-a716-446655440000"),
            Content:        "Hello world",
        }
        message.CreatedAt.Scan(time.Now())
        
        return []repository.Message{message}, nil
    }
    
    req := &chatv1.GetMessagesRequest{
        ConversationId: "660e8400-e29b-41d4-a716-446655440000",
    }
    
    resp, err := service.GetMessages(context.Background(), req)
    assert.NoError(t, err)
    assert.Len(t, resp.Messages, 1)
}
```

#### 5. Test Helper Functions

Use helper functions to reduce boilerplate:

```go
// Create authenticated context
ctx := contextWithUserID("660e8400-e29b-41d4-a716-446655440000")

// Parse UUIDs safely in tests
conversationID := mustParseUUID(t, "550e8400-e29b-41d4-a716-446655440000")

// Create timestamps
ts := mustTimestamptz(t, time.Now())
```

### Testing Checklist

When writing tests for a new handler:

- [ ] **Happy path**: Test successful operation with valid inputs
- [ ] **Validation errors**: Test all validation rules (nil request, empty fields, invalid formats)
- [ ] **Authentication errors**: Test missing or invalid user_id in context
- [ ] **Database errors**: Test repository failures return appropriate error codes
- [ ] **Edge cases**: Test empty results, pagination boundaries, special characters
- [ ] **Context cancellation**: Test behavior when context is cancelled
- [ ] **Mock verification**: Always call `AssertExpectations(t)` on mocks

### Common Test Scenarios

#### Testing Authentication

```go
// Authenticated request
ctx := contextWithUserID("660e8400-e29b-41d4-a716-446655440000")

// Unauthenticated request
ctx := context.Background()

resp, err := service.GetConversations(ctx, req)
assert.Equal(t, codes.Unauthenticated, status.Code(err))
```

#### Testing Validation

```go
tests := []struct {
    name    string
    req     *chatv1.MarkAsReadRequest
    errCode codes.Code
    errMsg  string
}{
    {
        name:    "nil request",
        req:     nil,
        errCode: codes.InvalidArgument,
        errMsg:  "request cannot be nil",
    },
    // ... more cases
}
```

#### Testing Database Errors

```go
service.getMessagesFn = func(ctx context.Context, arg repository.GetMessagesParams) ([]repository.Message, error) {
    return nil, errors.New("database connection failed")
}

resp, err := service.GetMessages(ctx, req)
assert.Equal(t, codes.Internal, status.Code(err))
```

### Performance Guidelines

- All unit tests should complete in **<5 seconds** total
- Individual test cases should complete in **<100ms**
- No actual network calls (Redis, PostgreSQL)
- No file I/O operations
- Use `zap.NewNop()` for logger in tests (no-op logger)

### Troubleshooting

**Tests are flaky:**
- Check for race conditions in mock setup
- Ensure mocks are properly isolated between tests
- Verify no shared state between test cases

**Coverage is low:**
- Run coverage report: `go tool cover -html=coverage.out`
- Identify uncovered branches in the HTML report
- Add tests for error paths and edge cases

**Mocks not working:**
- Verify mock expectations match actual calls exactly
- Check that `AssertExpectations(t)` is called
- Use `mock.Anything` for parameters you don't need to verify

## Dependencies

- `pgxpool`: PostgreSQL connection pool
- `repository`: Database queries (sqlc generated)
- `idempotency`: Redis-based idempotency checking
- `zap`: Structured logging
- `grpc`: gRPC server implementation


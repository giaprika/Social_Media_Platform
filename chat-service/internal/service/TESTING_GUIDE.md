# Chat Service Testing Guide

This guide provides detailed examples and patterns for writing tests for the Chat Service layer.

## Table of Contents

1. [Overview](#overview)
2. [Test File Organization](#test-file-organization)
3. [Mock Setup Patterns](#mock-setup-patterns)
4. [Table-Driven Test Examples](#table-driven-test-examples)
5. [Transaction Testing](#transaction-testing)
6. [Common Patterns](#common-patterns)
7. [Best Practices](#best-practices)

## Overview

The Chat Service uses a comprehensive testing strategy that includes:

- **Unit tests** for all handlers (SendMessage, GetMessages, GetConversations, MarkAsRead)
- **Mock-based testing** to isolate service logic from external dependencies
- **Table-driven tests** for validation and error scenarios
- **Function injection** for flexible test setup

All tests use the `testify` library for assertions and mocking.

## Test File Organization

```
internal/service/
├── chat_service.go                      # Service implementation
├── chat_service_test_helpers.go         # Mocks and test utilities
├── chat_service_utils_test.go           # Utility function tests
├── chat_service_sendmessage_test.go     # SendMessage handler tests
├── chat_service_getmessages_test.go     # GetMessages handler tests
├── chat_service_getconversations_test.go # GetConversations handler tests
└── chat_service_markasread_test.go      # MarkAsRead handler tests
```

## Mock Setup Patterns

### Pattern 1: MockIdempotencyChecker

Used for testing Redis-based idempotency checking without actual Redis connection.

```go
func TestSendMessage_IdempotencyCheck(t *testing.T) {
    // Create mock
    mockIdempotency := new(MockIdempotencyChecker)
    
    // Setup expectations
    mockIdempotency.On("Check", mock.Anything, "key-123").Return(nil)
    
    // Create service with mock
    service := &ChatService{
        idempotencyCheck: mockIdempotency,
        logger:           zap.NewNop(),
    }
    
    // Execute test
    ctx := contextWithUserID("660e8400-e29b-41d4-a716-446655440000")
    req := &chatv1.SendMessageRequest{
        ConversationId: "550e8400-e29b-41d4-a716-446655440000",
        Content:        "Hello",
        IdempotencyKey: "key-123",
    }
    
    resp, err := service.SendMessage(ctx, req)
    
    // Verify expectations were met
    mockIdempotency.AssertExpectations(t)
}
```

### Pattern 2: Function Injection

Used for simple repository mocking without complex transaction logic.

```go
func TestGetMessages_Success(t *testing.T) {
    service := &ChatService{
        logger: zap.NewNop(),
    }
    
    // Inject mock function
    service.getMessagesFn = func(ctx context.Context, arg repository.GetMessagesParams) ([]repository.Message, error) {
        // Verify parameters if needed
        assert.Equal(t, defaultMessagesLimit, arg.Limit)
        
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
    assert.Equal(t, "Hello world", resp.Messages[0].Content)
}
```

### Pattern 3: Transaction Mock Helpers

Used for testing complex transaction flows in SendMessage.

```go
func TestSendMessage_TransactionSuccess(t *testing.T) {
    mockIdempotency := new(MockIdempotencyChecker)
    mocks := newMockTransactionHelpers()
    
    // Setup test data
    conversationID := mustParseUUID(t, "550e8400-e29b-41d4-a716-446655440000")
    senderID := mustParseUUID(t, "660e8400-e29b-41d4-a716-446655440000")
    messageID := mustParseUUID(t, "770e8400-e29b-41d4-a716-446655440000")
    
    // Configure happy path transaction
    mocks.setupHappyPathTransaction(conversationID, senderID, messageID, "Hello")
    
    // Create service and inject mocks
    service := &ChatService{
        idempotencyCheck: mockIdempotency,
        logger:           zap.NewNop(),
    }
    mocks.injectIntoService(service)
    
    // Setup idempotency check
    mockIdempotency.On("Check", mock.Anything, "key-123").Return(nil)
    
    // Execute test
    ctx := contextWithUserID(uuidToString(senderID))
    req := &chatv1.SendMessageRequest{
        ConversationId: uuidToString(conversationID),
        Content:        "Hello",
        IdempotencyKey: "key-123",
    }
    
    resp, err := service.SendMessage(ctx, req)
    
    // Verify results
    assert.NoError(t, err)
    assert.NotNil(t, resp)
    assert.NotEmpty(t, resp.MessageId)
    assert.Equal(t, "SENT", resp.Status)
    mockIdempotency.AssertExpectations(t)
}
```

## Table-Driven Test Examples

### Example 1: Validation Errors

Table-driven tests are ideal for testing multiple validation scenarios.

```go
func TestMarkAsRead_ValidationErrors(t *testing.T) {
    service := &ChatService{logger: zap.NewNop()}

    tests := []struct {
        name    string
        ctx     context.Context
        req     *chatv1.MarkAsReadRequest
        errCode codes.Code
        errMsg  string
    }{
        {
            name:    "nil request",
            ctx:     contextWithUserID("550e8400-e29b-41d4-a716-446655440000"),
            req:     nil,
            errCode: codes.InvalidArgument,
            errMsg:  "request cannot be nil",
        },
        {
            name: "empty conversation_id",
            ctx:  contextWithUserID("550e8400-e29b-41d4-a716-446655440000"),
            req: &chatv1.MarkAsReadRequest{
                ConversationId: "",
            },
            errCode: codes.InvalidArgument,
            errMsg:  "conversation_id is required",
        },
        {
            name: "invalid conversation_id UUID format",
            ctx:  contextWithUserID("550e8400-e29b-41d4-a716-446655440000"),
            req: &chatv1.MarkAsReadRequest{
                ConversationId: "not-a-uuid",
            },
            errCode: codes.InvalidArgument,
            errMsg:  "invalid conversation_id",
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            resp, err := service.MarkAsRead(tt.ctx, tt.req)
            
            assert.Nil(t, resp)
            assert.Error(t, err)
            assert.Equal(t, tt.errCode, status.Code(err))
            assert.Contains(t, err.Error(), tt.errMsg)
        })
    }
}
```

### Example 2: Limit Sanitization

Testing boundary conditions with table-driven tests.

```go
func TestGetMessages_LimitSanitization(t *testing.T) {
    logger := zap.NewNop()

    tests := []struct {
        name          string
        requestLimit  int32
        expectedLimit int32
    }{
        {
            name:          "limit=0 defaults to 50",
            requestLimit:  0,
            expectedLimit: 50,
        },
        {
            name:          "limit>100 caps at 100",
            requestLimit:  200,
            expectedLimit: 100,
        },
        {
            name:          "negative limit defaults to 50",
            requestLimit:  -10,
            expectedLimit: 50,
        },
        {
            name:          "valid limit unchanged",
            requestLimit:  25,
            expectedLimit: 25,
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            var capturedLimit int32

            service := &ChatService{
                logger: logger,
            }

            service.getMessagesFn = func(ctx context.Context, arg repository.GetMessagesParams) ([]repository.Message, error) {
                capturedLimit = arg.Limit
                return []repository.Message{}, nil
            }

            req := &chatv1.GetMessagesRequest{
                ConversationId: "550e8400-e29b-41d4-a716-446655440000",
                Limit:          tt.requestLimit,
            }

            resp, err := service.GetMessages(context.Background(), req)
            
            assert.NoError(t, err)
            assert.NotNil(t, resp)
            assert.Equal(t, tt.expectedLimit, capturedLimit)
        })
    }
}
```

### Example 3: UUID Parsing Edge Cases

Testing various input formats.

```go
func TestParseUUID_EdgeCases(t *testing.T) {
    tests := []struct {
        name      string
        input     string
        wantError bool
    }{
        {
            name:      "valid lowercase UUID",
            input:     "550e8400-e29b-41d4-a716-446655440000",
            wantError: false,
        },
        {
            name:      "valid uppercase UUID",
            input:     "550E8400-E29B-41D4-A716-446655440000",
            wantError: false,
        },
        {
            name:      "UUID without hyphens",
            input:     "550e8400e29b41d4a716446655440000",
            wantError: false,
        },
        {
            name:      "malformed UUID",
            input:     "not-a-valid-uuid",
            wantError: true,
        },
        {
            name:      "partial UUID",
            input:     "550e8400-e29b",
            wantError: true,
        },
        {
            name:      "empty string",
            input:     "",
            wantError: true,
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            uuid, err := parseUUID(tt.input)
            
            if tt.wantError {
                assert.Error(t, err)
                assert.False(t, uuid.Valid)
            } else {
                assert.NoError(t, err)
                assert.True(t, uuid.Valid)
            }
        })
    }
}
```

## Transaction Testing

### Testing Transaction Errors

The `mockTransactionHelpers` provides pre-configured error scenarios.

```go
func TestSendMessage_BeginTxError(t *testing.T) {
    mockIdempotency := new(MockIdempotencyChecker)
    mocks := newMockTransactionHelpers()
    
    // Setup transaction begin failure
    mocks.setupBeginTxError(errors.New("connection pool exhausted"))
    
    service := &ChatService{
        idempotencyCheck: mockIdempotency,
        logger:           zap.NewNop(),
    }
    mocks.injectIntoService(service)
    
    mockIdempotency.On("Check", mock.Anything, "key-123").Return(nil)
    
    ctx := contextWithUserID("660e8400-e29b-41d4-a716-446655440000")
    req := &chatv1.SendMessageRequest{
        ConversationId: "550e8400-e29b-41d4-a716-446655440000",
        Content:        "Hello",
        IdempotencyKey: "key-123",
    }
    
    resp, err := service.SendMessage(ctx, req)
    
    assert.Nil(t, resp)
    assert.Error(t, err)
    assert.Equal(t, codes.Internal, status.Code(err))
}
```

### Testing Rollback Scenarios

```go
func TestSendMessage_InsertMessageError_WithRollback(t *testing.T) {
    mockIdempotency := new(MockIdempotencyChecker)
    mocks := newMockTransactionHelpers()
    
    conversationID := mustParseUUID(t, "550e8400-e29b-41d4-a716-446655440000")
    
    // Setup insert message failure (triggers rollback)
    mocks.setupInsertMessageError(conversationID, errors.New("constraint violation"))
    
    service := &ChatService{
        idempotencyCheck: mockIdempotency,
        logger:           zap.NewNop(),
    }
    mocks.injectIntoService(service)
    
    mockIdempotency.On("Check", mock.Anything, "key-123").Return(nil)
    
    ctx := contextWithUserID("660e8400-e29b-41d4-a716-446655440000")
    req := &chatv1.SendMessageRequest{
        ConversationId: uuidToString(conversationID),
        Content:        "Hello",
        IdempotencyKey: "key-123",
    }
    
    resp, err := service.SendMessage(ctx, req)
    
    assert.Nil(t, resp)
    assert.Error(t, err)
    assert.Equal(t, codes.Internal, status.Code(err))
    assert.Contains(t, err.Error(), "failed to send message")
}
```

## Common Patterns

### Pattern: Testing Authentication

```go
func TestHandler_MissingUserID(t *testing.T) {
    service := &ChatService{logger: zap.NewNop()}
    
    // Context without user_id
    ctx := context.Background()
    req := &chatv1.GetConversationsRequest{}
    
    resp, err := service.GetConversations(ctx, req)
    
    assert.Error(t, err)
    assert.Nil(t, resp)
    assert.Equal(t, codes.Unauthenticated, status.Code(err))
    assert.Contains(t, err.Error(), "user_id not found in context")
}
```

### Pattern: Testing Empty Results

```go
func TestGetMessages_EmptyResultSet(t *testing.T) {
    service := &ChatService{
        logger: zap.NewNop(),
    }
    
    service.getMessagesFn = func(ctx context.Context, arg repository.GetMessagesParams) ([]repository.Message, error) {
        // Return empty slice
        return []repository.Message{}, nil
    }
    
    req := &chatv1.GetMessagesRequest{
        ConversationId: "550e8400-e29b-41d4-a716-446655440000",
    }
    
    resp, err := service.GetMessages(context.Background(), req)
    
    assert.NoError(t, err)
    assert.NotNil(t, resp)
    assert.Empty(t, resp.Messages)
    assert.Empty(t, resp.NextCursor)
}
```

### Pattern: Testing Context Cancellation

```go
func TestSendMessage_ContextCancellation(t *testing.T) {
    mockIdempotency := new(MockIdempotencyChecker)
    
    service := &ChatService{
        idempotencyCheck: mockIdempotency,
        logger:           zap.NewNop(),
    }
    
    // Create cancelled context
    ctx, cancel := context.WithCancel(contextWithUserID("660e8400-e29b-41d4-a716-446655440000"))
    cancel() // Cancel immediately
    
    req := &chatv1.SendMessageRequest{
        ConversationId: "550e8400-e29b-41d4-a716-446655440000",
        Content:        "Hello",
        IdempotencyKey: "key-123",
    }
    
    mockIdempotency.On("Check", ctx, "key-123").Return(context.Canceled)
    
    resp, err := service.SendMessage(ctx, req)
    
    assert.Nil(t, resp)
    assert.Error(t, err)
}
```

### Pattern: Verifying No Side Effects

```go
func TestSendMessage_DuplicateRequest_NoSideEffects(t *testing.T) {
    mockIdempotency := new(MockIdempotencyChecker)
    
    // Track if any database operations are called
    beginTxCalled := false
    insertMsgCalled := false
    
    service := &ChatService{
        idempotencyCheck: mockIdempotency,
        logger:           zap.NewNop(),
        beginTxFn: func(ctx context.Context) (repository.DBTX, error) {
            beginTxCalled = true
            return nil, errors.New("should not be called")
        },
        insertMessageFn: func(ctx context.Context, qtx *repository.Queries, params repository.InsertMessageParams) (repository.Message, error) {
            insertMsgCalled = true
            return repository.Message{}, errors.New("should not be called")
        },
    }
    
    ctx := contextWithUserID("660e8400-e29b-41d4-a716-446655440000")
    req := &chatv1.SendMessageRequest{
        ConversationId: "550e8400-e29b-41d4-a716-446655440000",
        Content:        "Hello",
        IdempotencyKey: "key-123",
    }
    
    mockIdempotency.On("Check", ctx, "key-123").Return(idempotency.ErrDuplicateRequest)
    
    resp, err := service.SendMessage(ctx, req)
    
    assert.Nil(t, resp)
    assert.Error(t, err)
    assert.Equal(t, codes.AlreadyExists, status.Code(err))
    
    // Verify no database operations were attempted
    assert.False(t, beginTxCalled)
    assert.False(t, insertMsgCalled)
}
```

## Best Practices

### 1. Use Descriptive Test Names

```go
// Good
func TestSendMessage_DuplicateRequest_ReturnsAlreadyExistsError(t *testing.T)

// Bad
func TestSendMessage1(t *testing.T)
```

### 2. Test One Thing Per Test

```go
// Good - focused test
func TestGetMessages_EmptyConversationID_ReturnsInvalidArgument(t *testing.T) {
    // Test only empty conversation_id validation
}

// Bad - testing multiple things
func TestGetMessages_AllValidationErrors(t *testing.T) {
    // Tests empty conversation_id, invalid UUID, invalid timestamp, etc.
    // Better as separate tests or table-driven test
}
```

### 3. Always Verify Mock Expectations

```go
mockIdempotency := new(MockIdempotencyChecker)
mockIdempotency.On("Check", mock.Anything, "key-123").Return(nil)

// ... test execution ...

// Always verify expectations were met
mockIdempotency.AssertExpectations(t)
```

### 4. Use Helper Functions

```go
// Good - using helper
ctx := contextWithUserID("660e8400-e29b-41d4-a716-446655440000")
conversationID := mustParseUUID(t, "550e8400-e29b-41d4-a716-446655440000")

// Bad - manual setup
ctx := context.WithValue(context.Background(), ctxkeys.UserIDKey, "660e8400-e29b-41d4-a716-446655440000")
uuid, err := parseUUID("550e8400-e29b-41d4-a716-446655440000")
if err != nil {
    t.Fatal(err)
}
```

### 5. Test Error Messages

```go
resp, err := service.MarkAsRead(ctx, nil)

assert.Error(t, err)
assert.Equal(t, codes.InvalidArgument, status.Code(err))
assert.Contains(t, err.Error(), "request cannot be nil") // Verify error message
```

### 6. Use t.Helper() in Helper Functions

```go
func mustParseUUID(t *testing.T, value string) pgtype.UUID {
    t.Helper() // Marks this as a helper function for better error reporting
    uuid, err := parseUUID(value)
    assert.NoError(t, err)
    return uuid
}
```

### 7. Isolate Tests

```go
// Good - each test creates its own service instance
func TestGetMessages_Success(t *testing.T) {
    service := &ChatService{logger: zap.NewNop()}
    // ... test ...
}

func TestGetMessages_Error(t *testing.T) {
    service := &ChatService{logger: zap.NewNop()}
    // ... test ...
}

// Bad - shared service instance can cause test interference
var service *ChatService

func TestGetMessages_Success(t *testing.T) {
    // ... test using shared service ...
}
```

### 8. Test Coverage Goals

- Aim for >80% overall coverage
- Critical paths (SendMessage) should have >90% coverage
- Test both happy paths and error paths
- Include edge cases (empty results, boundary conditions)
- Test context cancellation for long-running operations

### 9. Performance Considerations

- Keep tests fast (<100ms per test)
- Use `zap.NewNop()` for logger (no-op logger)
- Avoid actual network calls
- Don't use time.Sleep() - use mocks instead

### 10. Documentation

- Add comments explaining complex test scenarios
- Document why certain mocks are set up in specific ways
- Include examples in test names: `TestGetMessages_Limit200_CapsAt100`

## Running and Debugging Tests

### Run specific test
```bash
go test ./internal/service/... -v -run TestSendMessage_HappyPath
```

### Run with coverage
```bash
go test ./internal/service/... -v -cover -coverprofile=coverage.out
go tool cover -html=coverage.out
```

### Run tests multiple times (check for flakiness)
```bash
go test ./internal/service/... -count=10
```

### Run with race detector
```bash
go test ./internal/service/... -race
```

### Debug failing test
```bash
go test ./internal/service/... -v -run TestSendMessage_HappyPath -timeout 30s
```

## Conclusion

This testing guide provides the patterns and examples needed to write comprehensive, maintainable tests for the Chat Service. By following these patterns, you can ensure high test coverage, catch bugs early, and maintain confidence in the service's correctness.

For more examples, refer to the existing test files in `internal/service/`.

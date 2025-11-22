# Design Document: Core Messaging Unit Tests

## Overview

This design document outlines the comprehensive unit testing strategy for the Chat Service layer. The Chat Service is a critical component that handles message sending with idempotency, message retrieval with pagination, conversation management, and read status tracking. The testing approach focuses on isolating the service layer logic using mocks for external dependencies (database, Redis) to ensure fast, reliable, and maintainable tests.

The existing codebase already has basic unit tests covering validation and some happy path scenarios. This design extends the test coverage to include error scenarios, edge cases, and comprehensive mocking of database transactions to achieve >80% code coverage.

## Architecture

### System Context

```
┌─────────────────────────────────────────────────────────┐
│                    Chat Service                         │
│  ┌──────────────────────────────────────────────────┐  │
│  │  SendMessage    GetMessages                      │  │
│  │  GetConversations    MarkAsRead                  │  │
│  └──────────────────────────────────────────────────┘  │
│           │                    │                        │
│           ▼                    ▼                        │
│  ┌─────────────────┐  ┌──────────────────┐            │
│  │  Idempotency    │  │   Repository     │            │
│  │    Checker      │  │   (sqlc/pgx)     │            │
│  └─────────────────┘  └──────────────────┘            │
│           │                    │                        │
└───────────┼────────────────────┼────────────────────────┘
            │                    │
            ▼                    ▼
      ┌─────────┐          ┌──────────┐
      │  Redis  │          │PostgreSQL│
      └─────────┘          └──────────┘
```

### Testing Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  Unit Test Suite                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Test Cases (table-driven)                       │  │
│  │  - Happy paths                                   │  │
│  │  - Error scenarios                               │  │
│  │  - Edge cases                                    │  │
│  └──────────────────────────────────────────────────┘  │
│           │                    │                        │
│           ▼                    ▼                        │
│  ┌─────────────────┐  ┌──────────────────┐            │
│  │ MockIdempotency │  │  MockRepository  │            │
│  │    Checker      │  │  (via injection) │            │
│  └─────────────────┘  └──────────────────┘            │
│           │                    │                        │
│           ▼                    ▼                        │
│      Assertions          Assertions                     │
│      (testify)           (testify)                      │
└─────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### 1. Test Fixtures and Helpers

**Purpose:** Provide reusable test data and helper functions to reduce duplication

**Components:**
- `contextWithUserID(userID string) context.Context` - Creates test context with authenticated user
- `mustParseUUID(t *testing.T, value string) pgtype.UUID` - Helper for UUID parsing in tests
- Standard test UUIDs for conversations, users, and messages
- Mock implementations for dependencies

### 2. Mock Idempotency Checker

**Purpose:** Simulate Redis-based idempotency checking without actual Redis connection

**Interface:**
```go
type MockIdempotencyChecker struct {
    mock.Mock
}

func (m *MockIdempotencyChecker) Check(ctx context.Context, key string) error
func (m *MockIdempotencyChecker) CheckWithTTL(ctx context.Context, key string, ttl time.Duration) error
func (m *MockIdempotencyChecker) Remove(ctx context.Context, key string) error
```

**Behavior:**
- Returns `nil` for successful idempotency check (first request)
- Returns `idempotency.ErrDuplicateRequest` for duplicate requests
- Returns custom errors for Redis connection failures

### 3. Mock Repository Layer

**Purpose:** Simulate database operations without actual PostgreSQL connection

**Approach:** Use function injection pattern already present in ChatService
- `getMessagesFn` - Injectable function for GetMessages query
- For transaction-based operations (SendMessage), we'll need to enhance the design to support mocking

**Enhanced Design for Transaction Testing:**

Since SendMessage uses transactions, we need a way to mock the transaction flow. Options:

**Option A: Interface-based Repository (Recommended)**
```go
type Repository interface {
    WithTx(tx pgx.Tx) Repository
    InsertMessage(ctx context.Context, params InsertMessageParams) (Message, error)
    UpsertConversation(ctx context.Context, id pgtype.UUID) (Conversation, error)
    AddParticipant(ctx context.Context, params AddParticipantParams) error
    UpdateConversationLastMessage(ctx context.Context, params UpdateConversationLastMessageParams) error
    InsertOutbox(ctx context.Context, params InsertOutboxParams) error
}
```

**Option B: Function Injection (Current Pattern)**
Extend the current pattern by adding injectable functions for all repository operations used in SendMessage.

**Decision:** Use Option B (function injection) to maintain consistency with existing code patterns and minimize refactoring.

### 4. Test Suites

#### SendMessage Test Suite

**Test Cases:**

1. **Happy Path**
   - Valid request with all fields
   - Successful idempotency check
   - Successful transaction execution
   - Verify response contains message_id and status "SENT"

2. **Validation Errors**
   - Missing conversation_id
   - Empty content
   - Missing idempotency_key
   - Invalid UUID format

3. **Authentication Errors**
   - Missing user_id in context
   - Invalid user_id format

4. **Idempotency Scenarios**
   - Duplicate request (same idempotency key)
   - Redis connection failure during idempotency check

5. **Database Errors**
   - Transaction begin failure
   - UpsertConversation failure
   - InsertMessage failure
   - InsertOutbox failure
   - Transaction commit failure

6. **Context Cancellation**
   - Request cancelled mid-processing

#### GetMessages Test Suite

**Test Cases:**

1. **Happy Path**
   - Default parameters (no pagination)
   - With before_timestamp cursor
   - With custom limit
   - Empty result set

2. **Validation Errors**
   - Nil request
   - Empty conversation_id
   - Invalid conversation_id format
   - Invalid timestamp format

3. **Pagination**
   - Limit sanitization (0 → default, >100 → max)
   - Cursor generation from last message
   - Multiple pages of results

4. **Database Errors**
   - Query execution failure
   - Connection timeout

#### GetConversations Test Suite

**Test Cases:**

1. **Happy Path**
   - Default parameters
   - With cursor pagination
   - With custom limit
   - Empty result set

2. **Authentication Errors**
   - Missing user_id in context
   - Invalid user_id format

3. **Validation Errors**
   - Nil request
   - Invalid cursor format

4. **Database Errors**
   - Query execution failure

#### MarkAsRead Test Suite

**Test Cases:**

1. **Happy Path**
   - Valid conversation_id and user_id
   - Successful update

2. **Validation Errors**
   - Nil request
   - Empty conversation_id
   - Invalid conversation_id format

3. **Authentication Errors**
   - Missing user_id in context
   - Invalid user_id format

4. **Database Errors**
   - Update execution failure

## Data Models

### Test Data Structures

```go
// Standard test UUIDs
const (
    testConversationID = "550e8400-e29b-41d4-a716-446655440000"
    testUserID1        = "660e8400-e29b-41d4-a716-446655440000"
    testUserID2        = "770e8400-e29b-41d4-a716-446655440000"
    testMessageID      = "880e8400-e29b-41d4-a716-446655440000"
)

// Test message structure
type testMessage struct {
    id             string
    conversationID string
    senderID       string
    content        string
    createdAt      time.Time
}

// Test conversation structure
type testConversation struct {
    id                 string
    lastMessageContent string
    lastMessageAt      time.Time
    unreadCount        int32
}
```

## Error Handling

### Error Categories

1. **Validation Errors** (codes.InvalidArgument)
   - Empty required fields
   - Invalid UUID formats
   - Invalid timestamp formats
   - Limit out of range

2. **Authentication Errors** (codes.Unauthenticated)
   - Missing user_id in context
   - Invalid authentication token

3. **Idempotency Errors**
   - codes.AlreadyExists - Duplicate request
   - codes.Internal - Redis connection failure

4. **Database Errors** (codes.Internal)
   - Transaction failures
   - Query execution failures
   - Connection timeouts

5. **Context Errors**
   - context.Canceled
   - context.DeadlineExceeded

### Error Testing Strategy

Each error category should have:
- At least one test case demonstrating the error
- Verification of correct gRPC status code
- Verification of error message content
- Verification that no side effects occurred (e.g., no database writes)

## Testing Strategy

### Test Organization

```
internal/service/
├── chat_service.go
├── chat_service_test.go          (existing - basic tests)
└── chat_service_extended_test.go (new - comprehensive tests)
```

### Test Execution Flow

1. **Setup Phase**
   - Create mock dependencies (IdempotencyChecker, Repository functions)
   - Define test data (UUIDs, messages, conversations)
   - Set up expectations on mocks

2. **Execution Phase**
   - Create ChatService with mocked dependencies
   - Invoke the method under test
   - Capture response and error

3. **Verification Phase**
   - Assert response values (if success expected)
   - Assert error type and message (if error expected)
   - Verify mock expectations were met
   - Verify no unexpected calls were made

### Coverage Goals

- **Overall Service Layer:** >80%
- **SendMessage:** >90% (critical path)
- **GetMessages:** >85%
- **GetConversations:** >85%
- **MarkAsRead:** >85%
- **Helper functions:** 100%

### Test Performance

- All unit tests should complete in <5 seconds
- Individual test cases should complete in <100ms
- No actual network calls (Redis, PostgreSQL)
- No file I/O operations

## Implementation Approach

### Phase 1: Enhance Mockability

1. Add injectable functions for SendMessage transaction operations:
   ```go
   type ChatService struct {
       // ... existing fields ...
       
       // Injectable functions for testing
       beginTxFn              func(ctx context.Context) (pgx.Tx, error)
       upsertConversationFn   func(ctx context.Context, qtx *Queries, id pgtype.UUID) (Conversation, error)
       addParticipantFn       func(ctx context.Context, qtx *Queries, params AddParticipantParams) error
       insertMessageFn        func(ctx context.Context, qtx *Queries, params InsertMessageParams) (Message, error)
       updateLastMessageFn    func(ctx context.Context, qtx *Queries, params UpdateConversationLastMessageParams) error
       insertOutboxFn         func(ctx context.Context, qtx *Queries, params InsertOutboxParams) error
   }
   ```

2. Update sendMessageTx to use injectable functions when available

### Phase 2: Implement Extended Test Cases

1. Create `chat_service_extended_test.go`
2. Implement mock transaction helpers
3. Write comprehensive test cases for each handler
4. Use table-driven tests where appropriate

### Phase 3: Verify Coverage

1. Run tests with coverage: `go test -cover -coverprofile=coverage.out`
2. Generate coverage report: `go tool cover -html=coverage.out`
3. Identify gaps and add tests as needed
4. Ensure >80% coverage achieved

## Alternative Approaches Considered

### 1. Integration Tests Instead of Unit Tests

**Pros:**
- Tests real database interactions
- Higher confidence in correctness
- No mocking complexity

**Cons:**
- Slower execution (requires testcontainers)
- More complex setup/teardown
- Harder to test error scenarios
- Not suitable for unit test requirements

**Decision:** Rejected - Requirements specifically call for unit tests with mocks

### 2. Interface-based Repository Pattern

**Pros:**
- Cleaner separation of concerns
- Easier to mock entire repository
- More idiomatic Go testing

**Cons:**
- Requires significant refactoring
- Changes production code structure
- May impact performance (interface indirection)

**Decision:** Rejected - Use function injection to maintain consistency with existing patterns

### 3. Test Fixtures in Separate Package

**Pros:**
- Reusable across multiple test files
- Cleaner test organization

**Cons:**
- Adds complexity
- May expose internal details
- Overkill for current scope

**Decision:** Rejected - Keep fixtures in test file for simplicity

## Dependencies

- **testify/assert** - Assertion library (already in use)
- **testify/mock** - Mocking library (already in use)
- **go.uber.org/zap** - Logger (already in use, use zap.NewNop() for tests)
- **google.golang.org/grpc/codes** - gRPC status codes
- **google.golang.org/grpc/status** - gRPC status handling

## Success Criteria

1. All test cases pass consistently
2. Code coverage >80% for service layer
3. Tests execute in <5 seconds
4. No flaky tests (100% pass rate on repeated runs)
5. Clear test names and documentation
6. Mock expectations properly verified
7. No actual external dependencies (Redis, PostgreSQL) used

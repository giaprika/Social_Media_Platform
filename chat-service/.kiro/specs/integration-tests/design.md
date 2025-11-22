# Design Document: Integration Tests for Chat Service

## Overview

This design document outlines the comprehensive integration testing strategy for the Chat Service. Integration tests verify the complete HTTP → gRPC → Database flow using real PostgreSQL and Redis instances managed by testcontainers. Unlike unit tests that mock dependencies, integration tests provide high confidence that all components work correctly together in a realistic environment.

The integration test suite will:
- Automatically provision PostgreSQL and Redis containers
- Run database migrations
- Test all API endpoints through the HTTP gateway
- Verify database state after operations
- Test multi-user scenarios
- Validate the transactional outbox pattern
- Clean up resources automatically

## Architecture

### Test Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Integration Test Suite                   │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Test Cases (table-driven where applicable)          │  │
│  │  - API endpoint tests                                │  │
│  │  - Multi-user scenarios                              │  │
│  │  - Transactional outbox verification                 │  │
│  └───────────────────────────────────────────────────────┘  │
│                          │                                   │
│                          ▼                                   │
│  ┌───────────────────────────────────────────────────────┐  │
│  │         HTTP Client (net/http/httptest)              │  │
│  └───────────────────────────────────────────────────────┘  │
│                          │                                   │
│                          ▼                                   │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              HTTP Gateway (grpc-gateway)             │  │
│  │  ┌─────────────────────────────────────────────────┐ │  │
│  │  │  Middleware: Auth, Logging, Recovery            │ │  │
│  │  └─────────────────────────────────────────────────┘ │  │
│  └───────────────────────────────────────────────────────┘  │
│                          │                                   │
│                          ▼                                   │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              gRPC ChatService                        │  │
│  └───────────────────────────────────────────────────────┘  │
│                          │                                   │
│           ┌──────────────┴──────────────┐                   │
│           ▼                              ▼                   │
│  ┌─────────────────┐          ┌──────────────────┐          │
│  │  Idempotency    │          │   Repository     │          │
│  │   Checker       │          │   (sqlc/pgx)     │          │
│  └─────────────────┘          └──────────────────┘          │
│           │                              │                   │
└───────────┼──────────────────────────────┼───────────────────┘
            │                              │
            ▼                              ▼
   ┌─────────────────┐          ┌──────────────────┐
   │ Redis Container │          │ PostgreSQL       │
   │ (testcontainers)│          │ Container        │
   └─────────────────┘          │ (testcontainers) │
                                └──────────────────┘
```

### Test Lifecycle

```
┌─────────────────────────────────────────────────────────────┐
│                    Test Suite Lifecycle                     │
└─────────────────────────────────────────────────────────────┘

1. TestMain Setup (once per test run)
   ├─ Start PostgreSQL container
   ├─ Run database migrations
   ├─ Start Redis container
   ├─ Create connection pools
   └─ Initialize test server

2. Individual Test Execution (per test)
   ├─ Setup: Insert test fixtures
   ├─ Execute: Make HTTP requests
   ├─ Verify: Check responses and database state
   └─ Cleanup: Delete test data

3. TestMain Teardown (once per test run)
   ├─ Close connection pools
   ├─ Stop PostgreSQL container
   └─ Stop Redis container
```

## Components and Interfaces

### 1. Test Infrastructure Manager

**Purpose:** Manage testcontainers lifecycle and provide database connections

**Structure:**
```go
type TestInfrastructure struct {
    PostgresContainer testcontainers.Container
    RedisContainer    testcontainers.Container
    DBPool            *pgxpool.Pool
    RedisClient       *redis.Client
    DBConnString      string
    RedisAddr         string
}

func SetupTestInfrastructure(ctx context.Context) (*TestInfrastructure, error)
func (ti *TestInfrastructure) Teardown(ctx context.Context) error
func (ti *TestInfrastructure) CleanupTestData(ctx context.Context) error
```

**Responsibilities:**
- Start PostgreSQL container (postgres:16-alpine)
- Start Redis container (redis:7-alpine)
- Run database migrations using golang-migrate or embedded SQL
- Create connection pools
- Provide cleanup methods

### 2. Test Server Manager

**Purpose:** Create and manage the HTTP test server with all middleware

**Structure:**
```go
type TestServer struct {
    HTTPServer   *httptest.Server
    ChatService  *service.ChatService
    Infrastructure *TestInfrastructure
}

func NewTestServer(infra *TestInfrastructure) (*TestServer, error)
func (ts *TestServer) Close()
func (ts *TestServer) MakeRequest(method, path string, body interface{}, headers map[string]string) (*http.Response, error)
```

**Responsibilities:**
- Initialize ChatService with real dependencies
- Setup gRPC server with middleware
- Setup HTTP gateway with grpc-gateway
- Provide helper methods for making HTTP requests
- Handle server lifecycle

### 3. Test Fixtures and Helpers

**Purpose:** Provide reusable test data creation and verification utilities

**Structure:**
```go
type TestUser struct {
    ID string
}

type TestConversation struct {
    ID           string
    Participants []string
}

type TestMessage struct {
    ID             string
    ConversationID string
    SenderID       string
    Content        string
    CreatedAt      time.Time
}

// Fixture creation helpers
func CreateTestUser(ctx context.Context, db *pgxpool.Pool) (*TestUser, error)
func CreateTestConversation(ctx context.Context, db *pgxpool.Pool, participantIDs []string) (*TestConversation, error)
func CreateTestMessage(ctx context.Context, db *pgxpool.Pool, conversationID, senderID, content string) (*TestMessage, error)

// Verification helpers
func AssertMessageExists(t *testing.T, db *pgxpool.Pool, messageID string)
func AssertOutboxEntryExists(t *testing.T, db *pgxpool.Pool, aggregateID string)
func AssertConversationParticipants(t *testing.T, db *pgxpool.Pool, conversationID string, expectedParticipants []string)
func GetUnreadCount(ctx context.Context, db *pgxpool.Pool, conversationID, userID string) (int, error)

// Cleanup helpers
func CleanupConversation(ctx context.Context, db *pgxpool.Pool, conversationID string) error
func CleanupAllTestData(ctx context.Context, db *pgxpool.Pool) error
```

### 4. HTTP Request Helpers

**Purpose:** Simplify making HTTP requests with proper headers and body marshaling

**Structure:**
```go
type HTTPClient struct {
    BaseURL string
    Client  *http.Client
}

func (c *HTTPClient) SendMessage(userID, conversationID, content, idempotencyKey string) (*SendMessageResponse, error)
func (c *HTTPClient) GetMessages(userID, conversationID string, limit int32, beforeTimestamp string) (*GetMessagesResponse, error)
func (c *HTTPClient) GetConversations(userID string, limit int32, cursor string) (*GetConversationsResponse, error)
func (c *HTTPClient) MarkAsRead(userID, conversationID string) (*MarkAsReadResponse, error)
```

## Test Suites

### 1. SendMessage Integration Tests

**File:** `internal/integration/sendmessage_test.go`

**Test Cases:**

1. **TestSendMessage_Success**
   - Create test users and conversation
   - Send message via HTTP POST
   - Verify 200 OK response with message_id
   - Verify message exists in database
   - Verify outbox entry created
   - Verify conversation last_message updated

2. **TestSendMessage_Idempotency**
   - Send message with idempotency key
   - Send same message again with same key
   - Verify first request succeeds
   - Verify second request returns AlreadyExists error
   - Verify only one message in database

3. **TestSendMessage_Unauthenticated**
   - Send message without x-user-id header
   - Verify 401 Unauthenticated error
   - Verify no message created in database

4. **TestSendMessage_InvalidConversationID**
   - Send message with invalid UUID format
   - Verify 400 Bad Request error

5. **TestSendMessage_EmptyContent**
   - Send message with empty content
   - Verify 400 Bad Request error

6. **TestSendMessage_TransactionalOutbox**
   - Send message successfully
   - Query outbox table
   - Verify outbox entry has correct payload structure
   - Verify processed=false
   - Verify aggregate_type="message"

### 2. GetMessages Integration Tests

**File:** `internal/integration/getmessages_test.go`

**Test Cases:**

1. **TestGetMessages_Success**
   - Create conversation with multiple messages
   - Get messages via HTTP GET
   - Verify all messages returned in correct order
   - Verify message fields are correct

2. **TestGetMessages_Pagination**
   - Create conversation with 10 messages
   - Get messages with limit=3
   - Verify only 3 messages returned
   - Verify next_cursor is present
   - Use cursor to get next page
   - Verify correct messages returned

3. **TestGetMessages_BeforeTimestamp**
   - Create messages at different times
   - Get messages before specific timestamp
   - Verify only older messages returned

4. **TestGetMessages_EmptyConversation**
   - Create conversation with no messages
   - Get messages
   - Verify empty array returned with 200 OK

5. **TestGetMessages_InvalidConversationID**
   - Get messages with invalid UUID
   - Verify 400 Bad Request error

6. **TestGetMessages_LimitSanitization**
   - Test limit=0 (should default to 50)
   - Test limit=200 (should cap at 100)
   - Test negative limit (should default to 50)

### 3. GetConversations Integration Tests

**File:** `internal/integration/getconversations_test.go`

**Test Cases:**

1. **TestGetConversations_Success**
   - Create user with multiple conversations
   - Get conversations via HTTP GET
   - Verify all conversations returned
   - Verify last_message_content and last_message_at

2. **TestGetConversations_UnreadCount**
   - Create conversation with messages
   - Mark some as read
   - Get conversations
   - Verify unread_count is accurate

3. **TestGetConversations_OnlyUserConversations**
   - Create conversations for User A and User B
   - Get conversations for User A
   - Verify only User A's conversations returned

4. **TestGetConversations_Pagination**
   - Create user with many conversations
   - Get conversations with limit
   - Verify pagination works correctly

5. **TestGetConversations_Unauthenticated**
   - Get conversations without x-user-id header
   - Verify 401 Unauthenticated error

6. **TestGetConversations_EmptyList**
   - Create user with no conversations
   - Get conversations
   - Verify empty array returned

### 4. MarkAsRead Integration Tests

**File:** `internal/integration/markasread_test.go`

**Test Cases:**

1. **TestMarkAsRead_Success**
   - Create conversation with unread messages
   - Mark as read via HTTP POST
   - Verify success response
   - Verify messages marked as read in database
   - Verify read_at timestamp set

2. **TestMarkAsRead_OnlyUserMessages**
   - Create conversation with messages from User A and User B
   - User B marks as read
   - Verify only User B's read status updated
   - Verify User A's messages still unread for User A

3. **TestMarkAsRead_AlreadyRead**
   - Create conversation with all messages read
   - Mark as read again
   - Verify success (idempotent operation)

4. **TestMarkAsRead_Unauthenticated**
   - Mark as read without x-user-id header
   - Verify 401 Unauthenticated error

5. **TestMarkAsRead_InvalidConversationID**
   - Mark as read with invalid UUID
   - Verify 400 Bad Request error

### 5. Multi-User Flow Integration Tests

**File:** `internal/integration/multiuser_flow_test.go`

**Test Cases:**

1. **TestMultiUserConversation_CompleteFlow**
   - Create User A and User B
   - User A sends message to User B
   - User B retrieves messages
   - User B sends reply
   - User A retrieves messages
   - Verify both users see all messages
   - Verify conversation appears in both users' lists

2. **TestMultiUserConversation_UnreadCounts**
   - User A sends 3 messages
   - User B gets conversations (verify unread_count=3)
   - User B marks as read
   - User B gets conversations (verify unread_count=0)
   - User A sends another message
   - User B gets conversations (verify unread_count=1)

3. **TestMultiUserConversation_ConcurrentMessages**
   - User A and User B send messages concurrently
   - Verify all messages stored correctly
   - Verify no race conditions or lost messages

4. **TestMultiUserConversation_ParticipantTracking**
   - Create conversation
   - User A sends message (becomes participant)
   - User B sends message (becomes participant)
   - Verify both in conversation_participants table
   - Verify conversation appears for both users

## Data Models

### Test Data Structures

```go
// Standard test UUIDs (generated per test)
type TestIDs struct {
    UserA          string
    UserB          string
    UserC          string
    ConversationAB string
    ConversationAC string
}

func GenerateTestIDs() *TestIDs

// HTTP Response structures (matching proto definitions)
type SendMessageResponse struct {
    MessageID string `json:"message_id"`
    Status    string `json:"status"`
}

type GetMessagesResponse struct {
    Messages   []ChatMessage `json:"messages"`
    NextCursor string        `json:"next_cursor"`
}

type ChatMessage struct {
    ID             string `json:"id"`
    ConversationID string `json:"conversation_id"`
    SenderID       string `json:"sender_id"`
    Content        string `json:"content"`
    CreatedAt      string `json:"created_at"`
}

type GetConversationsResponse struct {
    Conversations []Conversation `json:"conversations"`
    NextCursor    string         `json:"next_cursor"`
}

type Conversation struct {
    ID                 string `json:"id"`
    LastMessageContent string `json:"last_message_content"`
    LastMessageAt      string `json:"last_message_at"`
    UnreadCount        int32  `json:"unread_count"`
}

type MarkAsReadResponse struct {
    Success bool `json:"success"`
}
```

## Error Handling

### Error Verification Strategy

Integration tests must verify both HTTP status codes and error response bodies:

```go
func AssertHTTPError(t *testing.T, resp *http.Response, expectedCode int, expectedMessageContains string) {
    assert.Equal(t, expectedCode, resp.StatusCode)
    
    var errorResp map[string]interface{}
    json.NewDecoder(resp.Body).Decode(&errorResp)
    
    if expectedMessageContains != "" {
        message := errorResp["message"].(string)
        assert.Contains(t, message, expectedMessageContains)
    }
}
```

### Expected Error Scenarios

| Scenario | HTTP Status | Error Message Contains |
|----------|-------------|------------------------|
| Missing auth header | 401 | "user_id not found" |
| Invalid UUID | 400 | "invalid" |
| Empty required field | 400 | "cannot be empty" |
| Duplicate idempotency key | 409 | "duplicate request" |

## Testing Strategy

### Test Organization

```
internal/integration/
├── setup_test.go                 # TestMain, infrastructure setup
├── helpers_test.go               # Shared helpers and fixtures
├── sendmessage_test.go          # SendMessage tests
├── getmessages_test.go          # GetMessages tests
├── getconversations_test.go     # GetConversations tests
├── markasread_test.go           # MarkAsRead tests
├── multiuser_flow_test.go       # Multi-user scenarios
└── README.md                     # Documentation
```

### Test Execution Flow

```go
// setup_test.go
var (
    testInfra  *TestInfrastructure
    testServer *TestServer
)

func TestMain(m *testing.M) {
    ctx := context.Background()
    
    // Setup
    var err error
    testInfra, err = SetupTestInfrastructure(ctx)
    if err != nil {
        log.Fatalf("Failed to setup test infrastructure: %v", err)
    }
    
    testServer, err = NewTestServer(testInfra)
    if err != nil {
        log.Fatalf("Failed to create test server: %v", err)
    }
    
    // Run tests
    code := m.Run()
    
    // Teardown
    testServer.Close()
    testInfra.Teardown(ctx)
    
    os.Exit(code)
}

// Individual test pattern
func TestSendMessage_Success(t *testing.T) {
    ctx := context.Background()
    
    // Setup: Create test data
    testIDs := GenerateTestIDs()
    
    // Execute: Make HTTP request
    resp, err := testServer.MakeRequest("POST", "/v1/messages", map[string]interface{}{
        "conversation_id": testIDs.ConversationAB,
        "content": "Hello World",
        "idempotency_key": "test-key-" + uuid.New().String(),
    }, map[string]string{
        "x-user-id": testIDs.UserA,
    })
    
    // Verify: Check response
    require.NoError(t, err)
    assert.Equal(t, http.StatusOK, resp.StatusCode)
    
    var result SendMessageResponse
    json.NewDecoder(resp.Body).Decode(&result)
    assert.NotEmpty(t, result.MessageID)
    assert.Equal(t, "SENT", result.Status)
    
    // Verify: Check database state
    AssertMessageExists(t, testInfra.DBPool, result.MessageID)
    AssertOutboxEntryExists(t, testInfra.DBPool, result.MessageID)
    
    // Cleanup
    CleanupConversation(ctx, testInfra.DBPool, testIDs.ConversationAB)
}
```

### Container Configuration

**PostgreSQL Container:**
```go
postgresContainer, err := testcontainers.GenericContainer(ctx, testcontainers.GenericContainerRequest{
    ContainerRequest: testcontainers.ContainerRequest{
        Image:        "postgres:16-alpine",
        ExposedPorts: []string{"5432/tcp"},
        Env: map[string]string{
            "POSTGRES_USER":     "testuser",
            "POSTGRES_PASSWORD": "testpass",
            "POSTGRES_DB":       "testdb",
        },
        WaitingFor: wait.ForLog("database system is ready to accept connections").
            WithOccurrence(2).
            WithStartupTimeout(60 * time.Second),
    },
    Started: true,
})
```

**Redis Container:**
```go
redisContainer, err := testcontainers.GenericContainer(ctx, testcontainers.GenericContainerRequest{
    ContainerRequest: testcontainers.ContainerRequest{
        Image:        "redis:7-alpine",
        ExposedPorts: []string{"6379/tcp"},
        WaitingFor: wait.ForLog("Ready to accept connections").
            WithStartupTimeout(30 * time.Second),
    },
    Started: true,
})
```

### Database Migrations

**Approach:** Embed migration files and run them programmatically

```go
//go:embed migrations/*.sql
var migrationsFS embed.FS

func RunMigrations(ctx context.Context, connString string) error {
    db, err := sql.Open("postgres", connString)
    if err != nil {
        return err
    }
    defer db.Close()
    
    // Read and execute migration files in order
    files, _ := migrationsFS.ReadDir("migrations")
    for _, file := range files {
        content, _ := migrationsFS.ReadFile("migrations/" + file.Name())
        _, err = db.ExecContext(ctx, string(content))
        if err != nil {
            return fmt.Errorf("migration %s failed: %w", file.Name(), err)
        }
    }
    
    return nil
}
```

## Performance Considerations

### Optimization Strategies

1. **Container Reuse**
   - Start containers once in TestMain
   - Reuse across all tests
   - Only cleanup data between tests, not containers

2. **Parallel Test Execution**
   - Use `t.Parallel()` where possible
   - Ensure test isolation with unique UUIDs
   - Be careful with shared resources

3. **Connection Pooling**
   - Configure appropriate pool sizes
   - Reuse connections across tests
   - Close connections properly in teardown

4. **Selective Cleanup**
   - Only delete data created by specific test
   - Use CASCADE deletes where appropriate
   - Consider TRUNCATE for full cleanup

### Performance Targets

- Container startup: <10 seconds
- Individual test: <2 seconds
- Full suite: <60 seconds
- Memory usage: <500MB

## Dependencies

### Required Packages

```go
// Testcontainers
"github.com/testcontainers/testcontainers-go"
"github.com/testcontainers/testcontainers-go/wait"

// Database
"github.com/jackc/pgx/v5/pgxpool"
"github.com/redis/go-redis/v9"

// Testing
"github.com/stretchr/testify/assert"
"github.com/stretchr/testify/require"
"testing"
"net/http/httptest"

// Utilities
"github.com/google/uuid"
"encoding/json"
"context"
"time"
```

### Docker Requirements

- Docker daemon must be running
- Docker API accessible (typically via /var/run/docker.sock)
- Sufficient disk space for container images (~500MB)
- Network access to pull images

## Success Criteria

1. All integration tests pass consistently (100% pass rate)
2. Test suite completes in <60 seconds
3. Containers start and stop reliably
4. No resource leaks (connections, containers)
5. Clear error messages on failures
6. Tests can run in parallel where appropriate
7. Database state is properly isolated between tests
8. All API endpoints covered with happy path and error cases
9. Multi-user scenarios validated
10. Transactional outbox pattern verified

## Alternative Approaches Considered

### 1. In-Memory Database (SQLite)

**Pros:**
- Faster startup
- No Docker dependency
- Simpler setup

**Cons:**
- Different SQL dialect from PostgreSQL
- Missing PostgreSQL-specific features (pgtype.UUID)
- Less realistic testing

**Decision:** Rejected - Need PostgreSQL-specific features

### 2. Shared Test Database

**Pros:**
- Faster (no container startup)
- Simpler configuration

**Cons:**
- Requires manual setup
- Not portable across environments
- Risk of test interference
- Not suitable for CI/CD

**Decision:** Rejected - Testcontainers provides better isolation

### 3. Mock HTTP Server

**Pros:**
- Faster execution
- No real dependencies

**Cons:**
- Not true integration tests
- Doesn't test middleware
- Doesn't test database interactions

**Decision:** Rejected - Need real integration testing

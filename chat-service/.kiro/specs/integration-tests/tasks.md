# Implementation Plan: Integration Tests for Chat Service

- [ ] 1. Setup test infrastructure and testcontainers
  - [x] 1.1 Create test infrastructure manager
    - Create `internal/integration/setup_test.go` with TestMain function
    - Implement `SetupTestInfrastructure` function to start PostgreSQL container using testcontainers
    - Implement `SetupTestInfrastructure` function to start Redis container using testcontainers
    - Configure container wait strategies for PostgreSQL (wait for "ready to accept connections")
    - Configure container wait strategies for Redis (wait for "Ready to accept connections")
    - Create database connection pool using pgxpool
    - Create Redis client connection
    - _Requirements: 1.1, 1.2, 1.5_

  - [x] 1.2 Implement database migration runner
    - Embed migration SQL files using go:embed
    - Create `RunMigrations` function to execute migrations programmatically
    - Handle migration errors with clear error messages
    - Verify schema creation after migrations
    - _Requirements: 1.2_

  - [x] 1.3 Implement teardown and cleanup functions
    - Create `Teardown` method to stop and remove containers
    - Create `CleanupTestData` method to truncate tables between tests
    - Implement proper connection pool closure
    - Add error handling for cleanup failures
    - _Requirements: 1.3, 1.4_

- [ ] 2. Create test server and HTTP client helpers
  - [x] 2.1 Implement test server manager





    - Create `TestServer` struct in `internal/integration/helpers_test.go`
    - Initialize ChatService with real database and Redis connections
    - Setup gRPC server with all middleware (auth, logging, recovery)
    - Setup HTTP gateway using grpc-gateway
    - Create httptest.Server for HTTP requests
    - _Requirements: 1.1_

  - [x] 2.2 Create HTTP client helper functions





    - Implement `MakeRequest` helper for generic HTTP requests
    - Implement `SendMessage` helper with proper request body and headers
    - Implement `GetMessages` helper with query parameters
    - Implement `GetConversations` helper with pagination support
    - Implement `MarkAsRead` helper
    - Add response parsing and error handling
    - _Requirements: 2.1, 3.1, 4.1, 5.1_

- [ ] 3. Create test fixtures and verification helpers
  - [ ] 3.1 Implement test data generation helpers
    - Create `GenerateTestIDs` function for unique UUIDs per test
    - Create `CreateTestUser` helper (if needed for fixtures)
    - Create `CreateTestConversation` helper to insert conversation with participants
    - Create `CreateTestMessage` helper to insert messages directly
    - _Requirements: 8.2, 8.3_

  - [ ] 3.2 Implement database verification helpers
    - Create `AssertMessageExists` to verify message in database
    - Create `AssertOutboxEntryExists` to verify outbox entry
    - Create `AssertConversationParticipants` to verify participants
    - Create `GetUnreadCount` to query unread message count
    - Create `GetMessageFromDB` to fetch and verify message details
    - _Requirements: 7.1, 7.3, 8.4_

  - [ ] 3.3 Implement cleanup helpers
    - Create `CleanupConversation` to delete conversation and related data
    - Create `CleanupAllTestData` to truncate all tables
    - Use CASCADE deletes where appropriate
    - Handle cleanup errors gracefully
    - _Requirements: 8.1_

- [ ] 4. Implement SendMessage integration tests
  - [ ] 4.1 Write TestSendMessage_Success
    - Generate test IDs for users and conversation
    - Send message via HTTP POST with authentication header
    - Verify 200 OK response with message_id and status "SENT"
    - Verify message exists in messages table
    - Verify outbox entry created with correct payload
    - Verify conversation last_message_content and last_message_at updated
    - Cleanup test data
    - _Requirements: 2.1, 7.1, 7.3_

  - [ ] 4.2 Write TestSendMessage_Idempotency
    - Send message with specific idempotency key
    - Send same message again with same idempotency key
    - Verify first request returns 200 OK
    - Verify second request returns 409 AlreadyExists error
    - Verify only one message exists in database
    - Verify Redis idempotency key is set
    - _Requirements: 2.2_

  - [ ] 4.3 Write TestSendMessage_Unauthenticated
    - Send message without x-user-id header
    - Verify 401 Unauthenticated error response
    - Verify no message created in database
    - Verify no outbox entry created
    - _Requirements: 2.3_

  - [ ] 4.4 Write TestSendMessage_ValidationErrors
    - Test invalid conversation_id format (400 Bad Request)
    - Test empty content (400 Bad Request)
    - Test missing idempotency_key (400 Bad Request)
    - Verify no database changes for validation errors
    - _Requirements: 2.4_

  - [ ] 4.5 Write TestSendMessage_TransactionalOutbox
    - Send message successfully
    - Query outbox table for entry
    - Verify outbox payload contains all required fields (message_id, conversation_id, sender_id, content, created_at)
    - Verify processed=false
    - Verify aggregate_type="message" and aggregate_id matches message_id
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [ ] 5. Implement GetMessages integration tests
  - [ ] 5.1 Write TestGetMessages_Success
    - Create conversation with 5 test messages
    - Get messages via HTTP GET
    - Verify 200 OK response
    - Verify all 5 messages returned in descending order by created_at
    - Verify message fields (id, conversation_id, sender_id, content, created_at)
    - _Requirements: 3.1_

  - [ ] 5.2 Write TestGetMessages_Pagination
    - Create conversation with 10 messages
    - Get messages with limit=3
    - Verify only 3 messages returned
    - Verify next_cursor is present
    - Use next_cursor as before_timestamp for second request
    - Verify next 3 messages returned
    - _Requirements: 3.2, 3.3_

  - [ ] 5.3 Write TestGetMessages_EmptyConversation
    - Create conversation with no messages
    - Get messages
    - Verify 200 OK response with empty messages array
    - Verify next_cursor is empty
    - _Requirements: 3.4_

  - [ ] 5.4 Write TestGetMessages_ValidationErrors
    - Test invalid conversation_id format (400 Bad Request)
    - Test invalid before_timestamp format (400 Bad Request)
    - _Requirements: 3.5_

  - [ ] 5.5 Write TestGetMessages_LimitSanitization
    - Test limit=0 (should default to 50)
    - Test limit=200 (should cap at 100)
    - Test negative limit (should default to 50)
    - Verify correct number of messages returned in each case
    - _Requirements: 3.2_

- [ ] 6. Implement GetConversations integration tests
  - [ ] 6.1 Write TestGetConversations_Success
    - Create user with 3 conversations
    - Add messages to each conversation
    - Get conversations via HTTP GET
    - Verify 200 OK response
    - Verify all 3 conversations returned
    - Verify last_message_content and last_message_at for each
    - _Requirements: 4.1, 4.3_

  - [ ] 6.2 Write TestGetConversations_UnreadCount
    - Create conversation with 5 messages
    - Mark 2 messages as read for the user
    - Get conversations
    - Verify unread_count=3 for the conversation
    - Mark all as read
    - Get conversations again
    - Verify unread_count=0
    - _Requirements: 4.2_

  - [ ] 6.3 Write TestGetConversations_OnlyUserConversations
    - Create conversations for User A and User B separately
    - Create shared conversation for both users
    - Get conversations for User A
    - Verify only User A's conversations returned (including shared)
    - Verify User B's private conversations not returned
    - _Requirements: 4.1, 6.5_

  - [ ] 6.4 Write TestGetConversations_Pagination
    - Create user with 10 conversations
    - Get conversations with limit=3
    - Verify 3 conversations returned with next_cursor
    - Use cursor for next page
    - Verify correct conversations returned
    - _Requirements: 4.4_

  - [ ] 6.5 Write TestGetConversations_Unauthenticated
    - Get conversations without x-user-id header
    - Verify 401 Unauthenticated error
    - _Requirements: 4.5_

- [ ] 7. Implement MarkAsRead integration tests
  - [ ] 7.1 Write TestMarkAsRead_Success
    - Create conversation with 3 unread messages
    - Mark as read via HTTP POST
    - Verify 200 OK response with success=true
    - Query database to verify is_read=true for all messages
    - Verify read_at timestamp is set
    - _Requirements: 5.1, 5.2_

  - [ ] 7.2 Write TestMarkAsRead_OnlyUserMessages
    - Create conversation with messages from User A and User B
    - User B marks conversation as read
    - Verify only messages for User B marked as read
    - Verify User A's messages still unread for User A
    - _Requirements: 5.5_

  - [ ] 7.3 Write TestMarkAsRead_AlreadyRead
    - Create conversation with all messages already read
    - Mark as read again
    - Verify 200 OK response (idempotent operation)
    - _Requirements: 5.3_

  - [ ] 7.4 Write TestMarkAsRead_Unauthenticated
    - Mark as read without x-user-id header
    - Verify 401 Unauthenticated error
    - _Requirements: 5.4_

  - [ ] 7.5 Write TestMarkAsRead_ValidationErrors
    - Test invalid conversation_id format (400 Bad Request)
    - Test empty conversation_id (400 Bad Request)
    - _Requirements: 5.4_

- [ ] 8. Implement multi-user flow integration tests
  - [ ] 8.1 Write TestMultiUserConversation_CompleteFlow
    - Create User A and User B
    - User A sends message to conversation
    - User B retrieves messages and sees User A's message
    - User B sends reply
    - User A retrieves messages and sees both messages
    - Both users get their conversations list
    - Verify conversation appears for both users
    - Verify participant tracking in conversation_participants table
    - _Requirements: 6.1, 6.2, 6.4, 6.5_

  - [ ] 8.2 Write TestMultiUserConversation_UnreadCounts
    - User A sends 3 messages to conversation
    - User B gets conversations (verify unread_count=3)
    - User B marks conversation as read
    - User B gets conversations (verify unread_count=0)
    - User A sends another message
    - User B gets conversations (verify unread_count=1)
    - _Requirements: 6.3_

  - [ ] 8.3 Write TestMultiUserConversation_ParticipantTracking
    - Create new conversation
    - User A sends first message
    - Verify User A added to conversation_participants
    - User B sends message to same conversation
    - Verify User B added to conversation_participants
    - Verify both users see conversation in their lists
    - _Requirements: 6.4_

- [ ] 9. Add performance and reliability improvements
  - [ ] 9.1 Implement container reuse optimization
    - Ensure containers started once in TestMain
    - Reuse containers across all tests
    - Only cleanup data between tests, not containers
    - Measure and log container startup time
    - _Requirements: 9.1, 9.4_

  - [ ] 9.2 Add timeout handling
    - Set reasonable timeouts for container startup (60s for PostgreSQL, 30s for Redis)
    - Set timeouts for HTTP requests (10s)
    - Set timeouts for database queries (5s)
    - Handle timeout errors gracefully with clear messages
    - _Requirements: 9.5, 1.4_

  - [ ] 9.3 Implement parallel test execution where safe
    - Add t.Parallel() to tests that don't conflict
    - Ensure test isolation with unique UUIDs
    - Verify no race conditions with parallel execution
    - _Requirements: 9.2_

  - [ ] 9.4 Add test execution time monitoring
    - Log test suite start and end times
    - Log individual test execution times
    - Verify full suite completes in <60 seconds
    - Identify and optimize slow tests
    - _Requirements: 9.1_

- [ ] 10. Create documentation and README
  - [ ] 10.1 Write integration test README
    - Document prerequisites (Docker, Go version)
    - Document how to run integration tests locally
    - Document environment variables if needed
    - Document troubleshooting common issues
    - Provide examples of running specific tests
    - _Requirements: 10.3_

  - [ ] 10.2 Add code comments and documentation
    - Add comments explaining test infrastructure setup
    - Document helper function usage with examples
    - Add comments for complex verification logic
    - Document test data cleanup strategy
    - _Requirements: 10.2, 10.5_

  - [ ] 10.3 Document test patterns and best practices
    - Document the setup-execute-verify-cleanup pattern
    - Provide examples of table-driven tests if used
    - Document how to add new integration tests
    - Document container configuration and customization
    - _Requirements: 10.1, 10.4_

- [ ] 11. Verify and validate test suite
  - [ ] 11.1 Run full test suite and verify success
    - Run all integration tests
    - Verify 100% pass rate
    - Verify no flaky tests (run 3 times consecutively)
    - Verify execution time <60 seconds
    - _Requirements: 9.1, 9.2_

  - [ ] 11.2 Verify resource cleanup
    - Check for connection leaks after test run
    - Verify containers stopped and removed
    - Verify no orphaned Docker resources
    - Check memory usage during test execution
    - _Requirements: 9.3, 8.5_

  - [ ] 11.3 Verify test coverage
    - Ensure all 4 API endpoints tested
    - Ensure happy path and error cases covered
    - Ensure multi-user scenarios covered
    - Ensure transactional outbox pattern verified
    - _Requirements: 2.1, 3.1, 4.1, 5.1, 6.1, 7.1_

  - [ ] 11.4 Test in CI/CD environment simulation
    - Run tests with Docker-in-Docker if applicable
    - Verify tests work without local Docker daemon access
    - Test with limited resources (memory, CPU)
    - Verify clear error messages on failures
    - _Requirements: 9.3, 1.4_

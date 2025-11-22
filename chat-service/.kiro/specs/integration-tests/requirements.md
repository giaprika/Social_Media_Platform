# Requirements Document: Integration Tests for Chat Service

## Introduction

This specification defines the requirements for implementing comprehensive integration tests for the Chat Service. Integration tests verify the complete HTTP → gRPC flow with real database connections using testcontainers for PostgreSQL and Redis. Unlike unit tests that use mocks, integration tests ensure that all components work correctly together in a realistic environment, validating the entire request-response cycle including middleware, service layer, repository layer, and database interactions.

## Glossary

- **Integration Test**: A test that verifies multiple components working together, using real dependencies (database, Redis) rather than mocks
- **Testcontainers**: A Go library that provides lightweight, throwaway instances of databases and other services running in Docker containers for testing
- **Test Fixture**: Predefined test data inserted into the database before running tests
- **Test Isolation**: Ensuring each test runs independently without affecting other tests, typically achieved through database cleanup between tests
- **HTTP Gateway**: The grpc-gateway that translates HTTP/JSON requests to gRPC calls
- **End-to-End Flow**: The complete request path from HTTP client → middleware → gRPC service → repository → database and back
- **Test Container Lifecycle**: The process of starting containers before tests, running tests, and cleaning up containers after tests
- **Idempotency Key**: A unique identifier sent with requests to prevent duplicate processing of the same operation

## Requirements

### Requirement 1: Test Infrastructure Setup

**User Story:** As a developer, I want automated test infrastructure setup using testcontainers, so that integration tests can run reliably in any environment without manual setup

#### Acceptance Criteria

1. WHEN integration tests are executed, THE test suite SHALL automatically start PostgreSQL and Redis containers using testcontainers

2. WHEN the PostgreSQL container starts, THE test suite SHALL automatically run database migrations to create the required schema

3. WHEN all integration tests complete, THE test suite SHALL automatically stop and remove all test containers to clean up resources

4. WHEN a test container fails to start, THE test suite SHALL return a clear error message indicating which container failed and why

5. THE test suite SHALL use isolated test database instances to prevent conflicts with development or production databases

### Requirement 2: SendMessage API Integration Tests

**User Story:** As a developer, I want comprehensive integration tests for the SendMessage API, so that I can verify the complete message sending flow works correctly with real database transactions

#### Acceptance Criteria

1. WHEN a valid SendMessage HTTP POST request is made with authentication headers, THE system SHALL create a message in the database and return a 200 OK response with message_id and status "SENT"

2. WHEN a SendMessage request is made with the same idempotency_key twice, THE system SHALL process the first request successfully and return an AlreadyExists error for the second request without creating a duplicate message

3. WHEN a SendMessage request is made without authentication headers, THE system SHALL return a 401 Unauthenticated error

4. WHEN a SendMessage request is made with invalid conversation_id format, THE system SHALL return a 400 Bad Request error

5. WHEN a SendMessage request succeeds, THE system SHALL create entries in both the messages table and the outbox table within the same transaction

### Requirement 3: GetMessages API Integration Tests

**User Story:** As a developer, I want comprehensive integration tests for the GetMessages API, so that I can verify message retrieval and pagination work correctly with real database queries

#### Acceptance Criteria

1. WHEN a GetMessages HTTP GET request is made for a conversation with messages, THE system SHALL return all messages in descending order by created_at timestamp

2. WHEN a GetMessages request includes a limit parameter, THE system SHALL return at most that many messages and include a next_cursor for pagination

3. WHEN a GetMessages request includes a before_timestamp cursor, THE system SHALL return only messages created before that timestamp

4. WHEN a GetMessages request is made for a conversation with no messages, THE system SHALL return an empty messages array with 200 OK status

5. WHEN a GetMessages request is made without authentication headers, THE system SHALL still succeed as this endpoint does not require authentication for the conversation owner check

### Requirement 4: GetConversations API Integration Tests

**User Story:** As a developer, I want comprehensive integration tests for the GetConversations API, so that I can verify conversation listing with unread counts works correctly

#### Acceptance Criteria

1. WHEN a GetConversations HTTP GET request is made by an authenticated user, THE system SHALL return all conversations where the user is a participant

2. WHEN a GetConversations request is made, THE system SHALL include accurate unread_count for each conversation based on messages not marked as read

3. WHEN a GetConversations request is made, THE system SHALL include last_message_content and last_message_at for each conversation

4. WHEN a GetConversations request includes pagination parameters, THE system SHALL return conversations ordered by last_message_at descending with proper cursor support

5. WHEN a GetConversations request is made without authentication headers, THE system SHALL return a 401 Unauthenticated error

### Requirement 5: MarkAsRead API Integration Tests

**User Story:** As a developer, I want comprehensive integration tests for the MarkAsRead API, so that I can verify read status tracking works correctly

#### Acceptance Criteria

1. WHEN a MarkAsRead HTTP POST request is made by an authenticated user, THE system SHALL update all unread messages in the conversation to is_read=true

2. WHEN a MarkAsRead request succeeds, THE system SHALL set the read_at timestamp to the current time for all affected messages

3. WHEN a MarkAsRead request is made for a conversation with no unread messages, THE system SHALL return success without errors

4. WHEN a MarkAsRead request is made without authentication headers, THE system SHALL return a 401 Unauthenticated error

5. WHEN a MarkAsRead request is made, THE system SHALL only mark messages as read for the authenticated user, not affecting other participants

### Requirement 6: Multi-User Conversation Flow Tests

**User Story:** As a developer, I want integration tests that simulate realistic multi-user conversation scenarios, so that I can verify the system handles concurrent users correctly

#### Acceptance Criteria

1. WHEN two users send messages to the same conversation, THE system SHALL correctly store all messages and maintain proper conversation state for both users

2. WHEN User A sends a message and User B retrieves messages, THE system SHALL return User A's message to User B

3. WHEN User A marks a conversation as read, THE system SHALL not affect User B's unread count for the same conversation

4. WHEN multiple users participate in a conversation, THE system SHALL correctly track participants in the conversation_participants table

5. WHEN a user retrieves their conversations list, THE system SHALL only return conversations where they are a participant

### Requirement 7: Transactional Outbox Pattern Verification

**User Story:** As a developer, I want integration tests that verify the transactional outbox pattern, so that I can ensure message events are reliably captured for eventual publishing

#### Acceptance Criteria

1. WHEN a message is successfully sent, THE system SHALL create an outbox entry with event_type "message.sent" in the same transaction

2. WHEN a message send transaction fails, THE system SHALL not create an outbox entry (rollback verification)

3. WHEN an outbox entry is created, THE system SHALL include complete message metadata in the JSON payload (message_id, conversation_id, sender_id, content, created_at)

4. THE outbox entry SHALL have processed=false initially and include the correct aggregate_type and aggregate_id

5. THE system SHALL maintain referential integrity between messages and outbox entries

### Requirement 8: Test Data Management and Isolation

**User Story:** As a developer, I want proper test data management and isolation, so that tests run reliably without interfering with each other

#### Acceptance Criteria

1. THE test suite SHALL clean up all test data after each test to ensure test isolation

2. THE test suite SHALL provide helper functions to create test fixtures (users, conversations, messages) with realistic data

3. THE test suite SHALL use unique UUIDs for each test run to avoid conflicts

4. THE test suite SHALL verify database state after operations to ensure data integrity

5. THE test suite SHALL handle database connection pooling correctly to avoid connection leaks

### Requirement 9: Performance and Reliability

**User Story:** As a developer, I want integration tests that run efficiently and reliably, so that they can be part of the CI/CD pipeline

#### Acceptance Criteria

1. THE complete integration test suite SHALL execute in less than 60 seconds

2. THE test suite SHALL have a 100% pass rate when run multiple times consecutively (no flaky tests)

3. THE test suite SHALL properly handle container startup failures with clear error messages and cleanup

4. THE test suite SHALL reuse database containers across tests within the same test run to improve performance

5. THE test suite SHALL include proper timeout handling to prevent tests from hanging indefinitely

### Requirement 10: Test Documentation and Maintainability

**User Story:** As a developer, I want well-documented integration tests, so that other developers can understand and extend them easily

#### Acceptance Criteria

1. THE test suite SHALL include clear test names that describe the scenario being tested

2. THE test suite SHALL include comments explaining complex setup or verification logic

3. THE test suite SHALL provide a README documenting how to run integration tests locally

4. THE test suite SHALL use table-driven tests WHERE multiple similar scenarios exist

5. THE test suite SHALL include examples of common test patterns (setup, execution, verification, cleanup)

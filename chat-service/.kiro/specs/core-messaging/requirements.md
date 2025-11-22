# Requirements Document: Core Messaging Implementation

## Introduction

This specification defines the requirements for implementing comprehensive unit tests for the Chat Service layer in a 1-1 messaging system. The Chat Service handles message sending with idempotency guarantees, message retrieval with pagination, conversation management, and read status tracking. The system uses PostgreSQL for persistence, Redis for idempotency checking, and follows the Transactional Outbox pattern for reliable event publishing.

## Glossary

- **Chat Service**: The gRPC service that handles all chat-related operations including sending messages, retrieving messages, managing conversations, and marking messages as read
- **Idempotency Checker**: A Redis-based component that ensures duplicate requests (identified by idempotency keys) are not processed multiple times
- **Repository Layer**: The data access layer that interacts with PostgreSQL using sqlc-generated queries
- **Transactional Outbox**: A pattern where database writes and event publishing are done atomically within a single transaction
- **Mock**: A test double that simulates the behavior of real dependencies with predefined responses
- **Test Coverage**: The percentage of code lines executed during test runs, target is >80%
- **Happy Path**: The expected flow when all inputs are valid and no errors occur
- **Error Path**: Test scenarios where errors or invalid inputs are handled

## Requirements

### Requirement 1: Unit Test Coverage for SendMessage

**User Story:** As a developer, I want comprehensive unit tests for the SendMessage handler, so that I can ensure message sending logic works correctly under various conditions

#### Acceptance Criteria

1. WHEN the SendMessage handler is invoked with valid inputs and all dependencies succeed, THE Chat Service SHALL successfully send the message and return a valid response with message_id and status "SENT"

2. WHEN the SendMessage handler receives a duplicate request with the same idempotency key, THE Chat Service SHALL detect the duplicate via the Idempotency Checker and return an AlreadyExists error without processing the message

3. WHEN the Idempotency Checker returns a non-duplicate error during SendMessage, THE Chat Service SHALL return an Internal error indicating idempotency check failure

4. WHEN the database transaction fails during SendMessage, THE Chat Service SHALL rollback the transaction and return an Internal error

5. WHEN the SendMessage handler is invoked without a user_id in the context, THE Chat Service SHALL return an Unauthenticated error

### Requirement 2: Unit Test Coverage for GetMessages

**User Story:** As a developer, I want comprehensive unit tests for the GetMessages handler, so that I can ensure message retrieval with pagination works correctly

#### Acceptance Criteria

1. WHEN the GetMessages handler is invoked with valid conversation_id and default parameters, THE Chat Service SHALL return messages with proper pagination cursor

2. WHEN the GetMessages handler is invoked with a before_timestamp parameter, THE Chat Service SHALL pass the timestamp to the repository layer for cursor-based pagination

3. WHEN the GetMessages handler is invoked with a limit exceeding the maximum allowed, THE Chat Service SHALL sanitize the limit to the maximum value (100)

4. WHEN the GetMessages handler is invoked with an invalid conversation_id format, THE Chat Service SHALL return an InvalidArgument error

5. WHEN the repository layer returns an error during GetMessages, THE Chat Service SHALL return an Internal error

### Requirement 3: Unit Test Coverage for GetConversations

**User Story:** As a developer, I want comprehensive unit tests for the GetConversations handler, so that I can ensure conversation listing works correctly for authenticated users

#### Acceptance Criteria

1. WHEN the GetConversations handler is invoked with valid parameters and user_id in context, THE Chat Service SHALL return the user's conversations with pagination support

2. WHEN the GetConversations handler is invoked without a user_id in the context, THE Chat Service SHALL return an Unauthenticated error

3. WHEN the GetConversations handler is invoked with an invalid cursor format, THE Chat Service SHALL return an InvalidArgument error

4. WHEN the repository layer returns an error during GetConversations, THE Chat Service SHALL return an Internal error

### Requirement 4: Unit Test Coverage for MarkAsRead

**User Story:** As a developer, I want comprehensive unit tests for the MarkAsRead handler, so that I can ensure read status updates work correctly

#### Acceptance Criteria

1. WHEN the MarkAsRead handler is invoked with valid conversation_id and user_id in context, THE Chat Service SHALL mark messages as read and return success

2. WHEN the MarkAsRead handler is invoked without a user_id in the context, THE Chat Service SHALL return an Unauthenticated error

3. WHEN the MarkAsRead handler is invoked with an invalid conversation_id format, THE Chat Service SHALL return an InvalidArgument error

4. WHEN the repository layer returns an error during MarkAsRead, THE Chat Service SHALL return an Internal error

### Requirement 5: Test Code Quality and Maintainability

**User Story:** As a developer, I want well-structured and maintainable test code, so that tests are easy to understand, modify, and extend

#### Acceptance Criteria

1. THE test suite SHALL use the testify library for assertions and mock library for creating test doubles

2. THE test suite SHALL follow table-driven test patterns WHERE multiple similar test cases exist

3. THE test suite SHALL include descriptive test names that clearly indicate the scenario being tested

4. THE test suite SHALL achieve greater than 80% code coverage for the Chat Service layer

5. THE test suite SHALL execute in less than 5 seconds for all unit tests combined

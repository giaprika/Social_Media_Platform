# Implementation Plan: Core Messaging Unit Tests

- [x] 1. Enhance ChatService mockability for transaction testing

  - Add injectable function fields to ChatService struct for database operations used in sendMessageTx
  - Update sendMessageTx method to use injectable functions when available, falling back to actual implementations
  - Ensure backward compatibility with existing production code
  - _Requirements: 1.1, 1.4_

- [ ] 2. Create comprehensive SendMessage test cases
  - [x] 2.1 Implement mock transaction helper functions

    - Create mock implementations for beginTx, upsertConversation, addParticipant, insertMessage, updateLastMessage, insertOutbox
    - Implement helper to chain mock expectations for happy path transaction flow
    - _Requirements: 1.1_
  
  - [x] 2.2 Write happy path test for SendMessage

    - Test successful message sending with valid inputs
    - Verify response contains correct message_id and status "SENT"
    - Verify all transaction steps are called in correct order
    - _Requirements: 1.1_
  
  - [x] 2.3 Write idempotency test cases for SendMessage

    - Test duplicate request detection (ErrDuplicateRequest)
    - Test Redis connection failure during idempotency check
    - Verify no database operations occur for duplicate requests
    - _Requirements: 1.2, 1.3_
  
  - [x] 2.4 Write database error test cases for SendMessage

    - Test transaction begin failure
    - Test upsertConversation failure with rollback
    - Test insertMessage failure with rollback
    - Test insertOutbox failure with rollback
    - Test transaction commit failure
    - _Requirements: 1.4_
  
  - [x] 2.5 Write authentication error test for SendMessage

    - Test missing user_id in context returns Unauthenticated error
    - Verify no idempotency check or database operations occur
    - _Requirements: 1.5_

- [ ] 3. Create comprehensive GetMessages test cases
  - [x] 3.1 Write happy path tests for GetMessages

    - Test with default parameters (no pagination)
    - Test with before_timestamp cursor
    - Test with custom limit
    - Test empty result set
    - Verify response structure and pagination cursor generation
    - _Requirements: 2.1, 2.2_
  
  - [x] 3.2 Write validation error tests for GetMessages

    - Test nil request
    - Test empty conversation_id
    - Test invalid conversation_id UUID format
    - Test invalid before_timestamp format
    - _Requirements: 2.4_
  
  - [x] 3.3 Write limit sanitization tests for GetMessages

    - Test limit=0 defaults to 50
    - Test limit>100 caps at 100
    - Test negative limit defaults to 50
    - _Requirements: 2.3_
  
  - [x] 3.4 Write database error test for GetMessages

    - Test repository query failure returns Internal error
    - _Requirements: 2.5_

- [ ] 4. Create comprehensive GetConversations test cases
  - [x] 4.1 Write happy path tests for GetConversations

    - Test with default parameters
    - Test with cursor pagination
    - Test with custom limit
    - Test empty result set
    - Verify response includes unread counts and last message info
    - _Requirements: 3.1_
  
  - [x] 4.2 Write authentication error test for GetConversations

    - Test missing user_id in context returns Unauthenticated error
    - _Requirements: 3.2_
  
  - [x] 4.3 Write validation error tests for GetConversations

    - Test nil request
    - Test invalid cursor format
    - _Requirements: 3.3_
  
  - [x] 4.4 Write database error test for GetConversations

    - Test repository query failure returns Internal error
    - _Requirements: 3.4_

- [ ] 5. Create comprehensive MarkAsRead test cases
  - [x] 5.1 Write happy path test for MarkAsRead

    - Test successful mark as read with valid inputs
    - Verify success response
    - _Requirements: 4.1_
  
  - [x] 5.2 Write authentication error test for MarkAsRead





    - Test missing user_id in context returns Unauthenticated error
    - _Requirements: 4.2_
  
  - [x] 5.3 Write validation error tests for MarkAsRead




    - Test nil request
    - Test empty conversation_id
    - Test invalid conversation_id UUID format
    - _Requirements: 4.3_
  
  - [x] 5.4 Write database error test for MarkAsRead





    - Test repository update failure returns Internal error
    - _Requirements: 4.4_

- [x] 6. Add edge case and helper function tests




  - [x] 6.1 Write context cancellation tests


    - Test SendMessage with cancelled context
    - Test GetMessages with cancelled context
    - _Requirements: 1.1, 2.1_
  
  - [x] 6.2 Write helper function tests

    - Test parseUUID with various formats (lowercase, uppercase, no hyphens)
    - Test uuidToString with valid and invalid UUIDs
    - Test createMessageEventPayload with special characters and unicode
    - Test sanitizeLimit edge cases
    - Test parseTimestampToPgtype with various formats
    - Test formatTimestamp with valid and invalid timestamps
    - _Requirements: 5.1, 5.2, 5.3_

- [x] 7. Verify test coverage and quality





  - Run go test with coverage flag to generate coverage report
  - Analyze coverage report to identify any gaps below 80%
  - Add additional test cases for uncovered code paths
  - Verify all tests pass consistently (run 10 times)
  - Verify test execution time is under 5 seconds
  - _Requirements: 5.4, 5.5_

- [x] 8. Document test patterns and update README





  - Add comments explaining mock setup patterns for future test authors
  - Document how to run tests with coverage
  - Add examples of table-driven test patterns used
  - Update project README with testing guidelines
  - _Requirements: 5.1, 5.2, 5.3_

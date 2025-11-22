package service

import (
	"context"
	"testing"
	"time"

	chatv1 "chat-service/api/chat/v1"
	"chat-service/internal/repository"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/assert"
	"go.uber.org/zap"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func TestGetConversations_HappyPath_DefaultParameters(t *testing.T) {
	logger := zap.NewNop()
	
	// Return sample conversations
	ts := time.Now().UTC()
	conv1 := repository.GetConversationsForUserRow{
		ID: mustParseUUID(t, "550e8400-e29b-41d4-a716-446655440001"),
		LastMessageContent: pgtype.Text{
			String: "Hello, how are you?",
			Valid:  true,
		},
		UnreadCount: 3,
	}
	conv1.LastMessageAt.Scan(ts)
	
	conv2 := repository.GetConversationsForUserRow{
		ID: mustParseUUID(t, "550e8400-e29b-41d4-a716-446655440002"),
		LastMessageContent: pgtype.Text{
			String: "See you tomorrow!",
			Valid:  true,
		},
		UnreadCount: 0,
	}
	conv2.LastMessageAt.Scan(ts.Add(-1 * time.Hour))
	
	service := &ChatService{
		logger: logger,
	}
	
	service.getConversationsForUserFn = func(ctx context.Context, arg repository.GetConversationsForUserParams) ([]repository.GetConversationsForUserRow, error) {
		// Verify default parameters
		assert.Equal(t, defaultMessagesLimit, arg.Limit, "Should use default limit")
		assert.False(t, arg.Column2.Valid, "Cursor should not be set for default parameters")
		
		return []repository.GetConversationsForUserRow{conv1, conv2}, nil
	}
	
	ctx := contextWithUserID("660e8400-e29b-41d4-a716-446655440000")
	req := &chatv1.GetConversationsRequest{}
	
	resp, err := service.GetConversations(ctx, req)
	
	assert.NoError(t, err)
	assert.NotNil(t, resp)
	assert.Len(t, resp.Conversations, 2, "Should return 2 conversations")
	
	// Verify first conversation
	assert.Equal(t, "550e8400-e29b-41d4-a716-446655440001", resp.Conversations[0].Id)
	assert.Equal(t, "Hello, how are you?", resp.Conversations[0].LastMessageContent)
	assert.Equal(t, int32(3), resp.Conversations[0].UnreadCount)
	assert.NotEmpty(t, resp.Conversations[0].LastMessageAt)
	
	// Verify second conversation
	assert.Equal(t, "550e8400-e29b-41d4-a716-446655440002", resp.Conversations[1].Id)
	assert.Equal(t, "See you tomorrow!", resp.Conversations[1].LastMessageContent)
	assert.Equal(t, int32(0), resp.Conversations[1].UnreadCount)
	assert.NotEmpty(t, resp.Conversations[1].LastMessageAt)
	
	// Verify pagination cursor is set
	assert.NotEmpty(t, resp.NextCursor, "NextCursor should be set when conversations exist")
}

func TestGetConversations_HappyPath_WithCursorPagination(t *testing.T) {
	logger := zap.NewNop()
	
	cursorTime := time.Date(2025, 1, 1, 12, 0, 0, 0, time.UTC)
	cursorTimestamp := cursorTime.Format(time.RFC3339Nano)
	
	// Return conversations after cursor
	ts := time.Date(2025, 1, 1, 11, 0, 0, 0, time.UTC)
	conv := repository.GetConversationsForUserRow{
		ID: mustParseUUID(t, "550e8400-e29b-41d4-a716-446655440003"),
		LastMessageContent: pgtype.Text{
			String: "Older message",
			Valid:  true,
		},
		UnreadCount: 1,
	}
	conv.LastMessageAt.Scan(ts)
	
	service := &ChatService{
		logger: logger,
	}
	
	service.getConversationsForUserFn = func(ctx context.Context, arg repository.GetConversationsForUserParams) ([]repository.GetConversationsForUserRow, error) {
		// Verify cursor is passed correctly
		assert.True(t, arg.Column2.Valid, "Cursor should be set")
		assert.Equal(t, cursorTime.Unix(), arg.Column2.Time.Unix(), "Cursor timestamp should match")
		
		return []repository.GetConversationsForUserRow{conv}, nil
	}
	
	ctx := contextWithUserID("660e8400-e29b-41d4-a716-446655440000")
	req := &chatv1.GetConversationsRequest{
		Cursor: cursorTimestamp,
	}
	
	resp, err := service.GetConversations(ctx, req)
	
	assert.NoError(t, err)
	assert.NotNil(t, resp)
	assert.Len(t, resp.Conversations, 1, "Should return 1 conversation")
	assert.Equal(t, "Older message", resp.Conversations[0].LastMessageContent)
	assert.NotEmpty(t, resp.NextCursor)
}

func TestGetConversations_HappyPath_WithCustomLimit(t *testing.T) {
	logger := zap.NewNop()
	
	service := &ChatService{
		logger: logger,
	}
	
	service.getConversationsForUserFn = func(ctx context.Context, arg repository.GetConversationsForUserParams) ([]repository.GetConversationsForUserRow, error) {
		// Verify custom limit is applied (but capped at max)
		assert.Equal(t, maxMessagesLimit, arg.Limit, "Limit should be capped at 100")
		
		// Return empty for simplicity
		return []repository.GetConversationsForUserRow{}, nil
	}
	
	ctx := contextWithUserID("660e8400-e29b-41d4-a716-446655440000")
	req := &chatv1.GetConversationsRequest{
		Limit: 200, // Request more than max
	}
	
	resp, err := service.GetConversations(ctx, req)
	
	assert.NoError(t, err)
	assert.NotNil(t, resp)
}

func TestGetConversations_HappyPath_EmptyResultSet(t *testing.T) {
	logger := zap.NewNop()
	
	service := &ChatService{
		logger: logger,
	}
	
	service.getConversationsForUserFn = func(ctx context.Context, arg repository.GetConversationsForUserParams) ([]repository.GetConversationsForUserRow, error) {
		// Return empty slice to simulate no conversations
		return []repository.GetConversationsForUserRow{}, nil
	}
	
	ctx := contextWithUserID("660e8400-e29b-41d4-a716-446655440000")
	req := &chatv1.GetConversationsRequest{}
	
	resp, err := service.GetConversations(ctx, req)
	
	assert.NoError(t, err)
	assert.NotNil(t, resp)
	assert.Empty(t, resp.Conversations, "Conversations should be empty")
	assert.Empty(t, resp.NextCursor, "NextCursor should be empty when no conversations")
}

func TestGetConversations_HappyPath_VerifyUnreadCountsAndLastMessage(t *testing.T) {
	logger := zap.NewNop()
	
	ts1 := time.Date(2025, 1, 2, 10, 0, 0, 0, time.UTC)
	ts2 := time.Date(2025, 1, 1, 10, 0, 0, 0, time.UTC)
	
	// Conversation with unread messages
	conv1 := repository.GetConversationsForUserRow{
		ID: mustParseUUID(t, "550e8400-e29b-41d4-a716-446655440001"),
		LastMessageContent: pgtype.Text{
			String: "Latest message with unread",
			Valid:  true,
		},
		UnreadCount: 5,
	}
	conv1.LastMessageAt.Scan(ts1)
	
	// Conversation with no unread messages
	conv2 := repository.GetConversationsForUserRow{
		ID: mustParseUUID(t, "550e8400-e29b-41d4-a716-446655440002"),
		LastMessageContent: pgtype.Text{
			String: "All read",
			Valid:  true,
		},
		UnreadCount: 0,
	}
	conv2.LastMessageAt.Scan(ts2)
	
	// Conversation with no last message (edge case)
	conv3 := repository.GetConversationsForUserRow{
		ID: mustParseUUID(t, "550e8400-e29b-41d4-a716-446655440003"),
		LastMessageContent: pgtype.Text{
			Valid: false, // No last message
		},
		UnreadCount: 0,
	}
	conv3.LastMessageAt.Scan(ts2.Add(-1 * time.Hour))
	
	service := &ChatService{
		logger: logger,
	}
	
	service.getConversationsForUserFn = func(ctx context.Context, arg repository.GetConversationsForUserParams) ([]repository.GetConversationsForUserRow, error) {
		return []repository.GetConversationsForUserRow{conv1, conv2, conv3}, nil
	}
	
	ctx := contextWithUserID("660e8400-e29b-41d4-a716-446655440000")
	req := &chatv1.GetConversationsRequest{}
	
	resp, err := service.GetConversations(ctx, req)
	
	assert.NoError(t, err)
	assert.NotNil(t, resp)
	assert.Len(t, resp.Conversations, 3, "Should return 3 conversations")
	
	// Verify conversation 1 - with unread messages
	assert.Equal(t, "550e8400-e29b-41d4-a716-446655440001", resp.Conversations[0].Id)
	assert.Equal(t, "Latest message with unread", resp.Conversations[0].LastMessageContent)
	assert.Equal(t, int32(5), resp.Conversations[0].UnreadCount)
	assert.NotEmpty(t, resp.Conversations[0].LastMessageAt)
	
	// Verify conversation 2 - all read
	assert.Equal(t, "550e8400-e29b-41d4-a716-446655440002", resp.Conversations[1].Id)
	assert.Equal(t, "All read", resp.Conversations[1].LastMessageContent)
	assert.Equal(t, int32(0), resp.Conversations[1].UnreadCount)
	assert.NotEmpty(t, resp.Conversations[1].LastMessageAt)
	
	// Verify conversation 3 - no last message
	assert.Equal(t, "550e8400-e29b-41d4-a716-446655440003", resp.Conversations[2].Id)
	assert.Empty(t, resp.Conversations[2].LastMessageContent, "LastMessageContent should be empty when not valid")
	assert.Equal(t, int32(0), resp.Conversations[2].UnreadCount)
	assert.NotEmpty(t, resp.Conversations[2].LastMessageAt)
	
	// Verify pagination cursor is set to the last conversation's timestamp
	assert.NotEmpty(t, resp.NextCursor, "NextCursor should be set")
}



func TestGetConversations_AuthenticationError_MissingUserID(t *testing.T) {
	logger := zap.NewNop()
	
	service := &ChatService{
		logger: logger,
	}
	
	// Create context without user_id
	ctx := context.Background()
	req := &chatv1.GetConversationsRequest{}
	
	resp, err := service.GetConversations(ctx, req)
	
	assert.Error(t, err)
	assert.Nil(t, resp)
	
	// Verify it's an Unauthenticated error
	st, ok := status.FromError(err)
	assert.True(t, ok, "Error should be a gRPC status error")
	assert.Equal(t, codes.Unauthenticated, st.Code(), "Should return Unauthenticated error code")
	assert.Contains(t, st.Message(), "user_id not found in context", "Error message should indicate missing user_id")
}

func TestGetConversations_ValidationError_NilRequest(t *testing.T) {
	logger := zap.NewNop()
	
	service := &ChatService{
		logger: logger,
	}
	
	ctx := contextWithUserID("660e8400-e29b-41d4-a716-446655440000")
	
	resp, err := service.GetConversations(ctx, nil)
	
	assert.Error(t, err)
	assert.Nil(t, resp)
	
	// Verify it's an InvalidArgument error
	st, ok := status.FromError(err)
	assert.True(t, ok, "Error should be a gRPC status error")
	assert.Equal(t, codes.InvalidArgument, st.Code(), "Should return InvalidArgument error code")
	assert.Contains(t, st.Message(), "request cannot be nil", "Error message should indicate nil request")
}

func TestGetConversations_ValidationError_InvalidCursorFormat(t *testing.T) {
	logger := zap.NewNop()
	
	ctx := contextWithUserID("660e8400-e29b-41d4-a716-446655440000")
	
	testCases := []struct {
		name   string
		cursor string
	}{
		{
			name:   "Invalid timestamp format",
			cursor: "not-a-timestamp",
		},
		{
			name:   "Invalid RFC3339 format",
			cursor: "2025-13-45T99:99:99Z",
		},
		{
			name:   "Random string",
			cursor: "random-string-123",
		},
	}
	
	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			service := &ChatService{
				logger: logger,
			}
			
			req := &chatv1.GetConversationsRequest{
				Cursor: tc.cursor,
			}
			
			resp, err := service.GetConversations(ctx, req)
			
			assert.Error(t, err)
			assert.Nil(t, resp)
			
			// Verify it's an InvalidArgument error
			st, ok := status.FromError(err)
			assert.True(t, ok, "Error should be a gRPC status error")
			assert.Equal(t, codes.InvalidArgument, st.Code(), "Should return InvalidArgument error code")
			assert.Contains(t, st.Message(), "invalid cursor", "Error message should indicate invalid cursor")
		})
	}
}

func TestGetConversations_DatabaseError_QueryFailure(t *testing.T) {
	logger := zap.NewNop()
	
	service := &ChatService{
		logger: logger,
	}
	
	// Mock repository to return an error
	service.getConversationsForUserFn = func(ctx context.Context, arg repository.GetConversationsForUserParams) ([]repository.GetConversationsForUserRow, error) {
		return nil, assert.AnError // Simulate database query failure
	}
	
	ctx := contextWithUserID("660e8400-e29b-41d4-a716-446655440000")
	req := &chatv1.GetConversationsRequest{}
	
	resp, err := service.GetConversations(ctx, req)
	
	assert.Error(t, err)
	assert.Nil(t, resp)
	
	// Verify it's an Internal error
	st, ok := status.FromError(err)
	assert.True(t, ok, "Error should be a gRPC status error")
	assert.Equal(t, codes.Internal, st.Code(), "Should return Internal error code")
	assert.Contains(t, st.Message(), "failed to fetch conversations", "Error message should indicate query failure")
}

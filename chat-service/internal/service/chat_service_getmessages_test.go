package service

import (
	"context"
	"errors"
	"testing"
	"time"

	chatv1 "chat-service/api/chat/v1"
	"chat-service/internal/repository"

	"github.com/stretchr/testify/assert"
	"go.uber.org/zap"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

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
		{
			name: "invalid uuid",
			req: &chatv1.GetMessagesRequest{
				ConversationId: "not-a-uuid",
			},
			errCode: codes.InvalidArgument,
		},
		{
			name: "invalid timestamp",
			req: &chatv1.GetMessagesRequest{
				ConversationId:  "550e8400-e29b-41d4-a716-446655440000",
				BeforeTimestamp: "invalid",
			},
			errCode: codes.InvalidArgument,
		},
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

func TestGetMessages_Success(t *testing.T) {
	logger := zap.NewNop()
	ts := time.Now().UTC()

	service := &ChatService{
		logger: logger,
	}

	service.getMessagesFn = func(ctx context.Context, arg repository.GetMessagesParams) ([]repository.Message, error) {
		assert.Equal(t, defaultMessagesLimit, arg.Limit)
		assert.False(t, arg.Before.Valid, "Before timestamp should not be set")

		message := repository.Message{
			ID:             mustParseUUID(t, "550e8400-e29b-41d4-a716-446655440000"),
			ConversationID: mustParseUUID(t, "660e8400-e29b-41d4-a716-446655440000"),
			SenderID:       mustParseUUID(t, "770e8400-e29b-41d4-a716-446655440000"),
			Content:        "Hello world",
		}
		message.CreatedAt.Scan(ts)

		return []repository.Message{message}, nil
	}

	req := &chatv1.GetMessagesRequest{
		ConversationId: "660e8400-e29b-41d4-a716-446655440000",
	}

	resp, err := service.GetMessages(context.Background(), req)
	assert.NoError(t, err)
	assert.Len(t, resp.Messages, 1)
	assert.Equal(t, "Hello world", resp.Messages[0].Content)
	assert.NotEmpty(t, resp.NextCursor)
}

func TestGetMessages_WithBeforeTimestampAndLimit(t *testing.T) {
	logger := zap.NewNop()

	var capturedParams repository.GetMessagesParams

	service := &ChatService{
		logger: logger,
	}

	service.getMessagesFn = func(ctx context.Context, arg repository.GetMessagesParams) ([]repository.Message, error) {
		capturedParams = arg
		return []repository.Message{}, nil
	}

	req := &chatv1.GetMessagesRequest{
		ConversationId:  "550e8400-e29b-41d4-a716-446655440000",
		Limit:           200,
		BeforeTimestamp: "2025-01-02T15:04:05Z",
	}

	resp, err := service.GetMessages(context.Background(), req)
	assert.NoError(t, err)
	assert.NotNil(t, resp)
	assert.Equal(t, maxMessagesLimit, capturedParams.Limit)
	assert.NotNil(t, capturedParams.Before)
}

func TestGetMessages_EmptyResultSet(t *testing.T) {
	logger := zap.NewNop()

	service := &ChatService{
		logger: logger,
	}

	service.getMessagesFn = func(ctx context.Context, arg repository.GetMessagesParams) ([]repository.Message, error) {
		// Return empty slice to simulate no messages found
		return []repository.Message{}, nil
	}

	req := &chatv1.GetMessagesRequest{
		ConversationId: "550e8400-e29b-41d4-a716-446655440000",
	}

	resp, err := service.GetMessages(context.Background(), req)
	assert.NoError(t, err)
	assert.NotNil(t, resp)
	assert.Empty(t, resp.Messages, "Messages should be empty")
	assert.Empty(t, resp.NextCursor, "NextCursor should be empty when no messages")
}

func TestGetMessages_PaginationCursorGeneration(t *testing.T) {
	logger := zap.NewNop()
	ts1 := time.Date(2025, 1, 1, 12, 0, 0, 0, time.UTC)
	ts2 := time.Date(2025, 1, 1, 12, 1, 0, 0, time.UTC)
	ts3 := time.Date(2025, 1, 1, 12, 2, 0, 0, time.UTC)

	service := &ChatService{
		logger: logger,
	}

	service.getMessagesFn = func(ctx context.Context, arg repository.GetMessagesParams) ([]repository.Message, error) {
		msg1 := repository.Message{
			ID:             mustParseUUID(t, "550e8400-e29b-41d4-a716-446655440001"),
			ConversationID: mustParseUUID(t, "660e8400-e29b-41d4-a716-446655440000"),
			SenderID:       mustParseUUID(t, "770e8400-e29b-41d4-a716-446655440000"),
			Content:        "First message",
		}
		msg1.CreatedAt.Scan(ts1)

		msg2 := repository.Message{
			ID:             mustParseUUID(t, "550e8400-e29b-41d4-a716-446655440002"),
			ConversationID: mustParseUUID(t, "660e8400-e29b-41d4-a716-446655440000"),
			SenderID:       mustParseUUID(t, "770e8400-e29b-41d4-a716-446655440000"),
			Content:        "Second message",
		}
		msg2.CreatedAt.Scan(ts2)

		msg3 := repository.Message{
			ID:             mustParseUUID(t, "550e8400-e29b-41d4-a716-446655440003"),
			ConversationID: mustParseUUID(t, "660e8400-e29b-41d4-a716-446655440000"),
			SenderID:       mustParseUUID(t, "770e8400-e29b-41d4-a716-446655440000"),
			Content:        "Third message",
		}
		msg3.CreatedAt.Scan(ts3)

		return []repository.Message{msg1, msg2, msg3}, nil
	}

	req := &chatv1.GetMessagesRequest{
		ConversationId: "660e8400-e29b-41d4-a716-446655440000",
	}

	resp, err := service.GetMessages(context.Background(), req)
	assert.NoError(t, err)
	assert.NotNil(t, resp)
	assert.Len(t, resp.Messages, 3, "Should return 3 messages")
	
	// Verify response structure
	assert.Equal(t, "First message", resp.Messages[0].Content)
	assert.Equal(t, "Second message", resp.Messages[1].Content)
	assert.Equal(t, "Third message", resp.Messages[2].Content)
	
	// Verify all messages have required fields
	for i, msg := range resp.Messages {
		assert.NotEmpty(t, msg.Id, "Message %d should have ID", i)
		assert.NotEmpty(t, msg.ConversationId, "Message %d should have ConversationId", i)
		assert.NotEmpty(t, msg.SenderId, "Message %d should have SenderId", i)
		assert.NotEmpty(t, msg.Content, "Message %d should have Content", i)
		assert.NotEmpty(t, msg.CreatedAt, "Message %d should have CreatedAt", i)
	}
	
	// Verify pagination cursor is set to the last message's timestamp
	assert.NotEmpty(t, resp.NextCursor, "NextCursor should be set")
	expectedCursor := formatTimestamp(mustTimestamptz(t, ts3))
	assert.Equal(t, expectedCursor, resp.NextCursor, "NextCursor should be the timestamp of the last message")
}

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
			assert.Equal(t, tt.expectedLimit, capturedLimit, "limit should be sanitized to %d", tt.expectedLimit)
		})
	}
}

func TestGetMessages_DBError(t *testing.T) {
	logger := zap.NewNop()

	service := &ChatService{
		logger: logger,
	}

	service.getMessagesFn = func(ctx context.Context, arg repository.GetMessagesParams) ([]repository.Message, error) {
		return nil, errors.New("db error")
	}

	req := &chatv1.GetMessagesRequest{
		ConversationId: "550e8400-e29b-41d4-a716-446655440000",
	}

	resp, err := service.GetMessages(context.Background(), req)
	assert.Nil(t, resp)
	assert.Equal(t, codes.Internal, status.Code(err))
}

func TestGetMessages_ContextCancellation(t *testing.T) {
	logger := zap.NewNop()

	service := &ChatService{
		logger: logger,
	}

	service.getMessagesFn = func(ctx context.Context, arg repository.GetMessagesParams) ([]repository.Message, error) {
		return nil, context.Canceled
	}

	// Create a cancelled context
	ctx, cancel := context.WithCancel(context.Background())
	cancel() // Cancel immediately

	req := &chatv1.GetMessagesRequest{
		ConversationId: "550e8400-e29b-41d4-a716-446655440000",
	}

	resp, err := service.GetMessages(ctx, req)

	assert.Nil(t, resp)
	assert.Error(t, err)
	assert.Equal(t, codes.Internal, status.Code(err))
}

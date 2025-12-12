package service

import (
	"context"
	"errors"
	"testing"

	chatv1 "chat-service/api/chat/v1"
	"chat-service/internal/repository"

	"github.com/stretchr/testify/assert"
	"go.uber.org/zap"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func TestMarkAsRead_Success(t *testing.T) {
	logger := zap.NewNop()

	var capturedParams repository.MarkAsReadParams

	service := &ChatService{
		logger: logger,
	}

	// Mock the MarkAsRead repository call using injectable function
	service.markAsReadFn = func(ctx context.Context, arg repository.MarkAsReadParams) error {
		capturedParams = arg
		return nil
	}

	// Create context with authenticated user
	ctx := contextWithUserID("660e8400-e29b-41d4-a716-446655440000")

	req := &chatv1.MarkAsReadRequest{
		ConversationId: "550e8400-e29b-41d4-a716-446655440000",
	}

	resp, err := service.MarkAsRead(ctx, req)

	// Verify success
	assert.NoError(t, err)
	assert.NotNil(t, resp)
	assert.True(t, resp.Success, "Response should indicate success")

	// Verify the correct parameters were passed to the repository
	expectedConversationID := mustParseUUID(t, "550e8400-e29b-41d4-a716-446655440000")
	expectedUserID := mustParseUUID(t, "660e8400-e29b-41d4-a716-446655440000")

	assert.Equal(t, expectedConversationID, capturedParams.ConversationID, "ConversationID should match")
	assert.Equal(t, expectedUserID, capturedParams.UserID, "UserID should match")
}

func TestMarkAsRead_AuthenticationError_MissingUserID(t *testing.T) {
	logger := zap.NewNop()

	service := &ChatService{
		logger: logger,
	}

	// Create context WITHOUT user_id (unauthenticated)
	ctx := context.Background()

	req := &chatv1.MarkAsReadRequest{
		ConversationId: "550e8400-e29b-41d4-a716-446655440000",
	}

	resp, err := service.MarkAsRead(ctx, req)

	// Verify error
	assert.Error(t, err)
	assert.Nil(t, resp)

	// Verify it's an Unauthenticated error
	st, ok := status.FromError(err)
	assert.True(t, ok, "Error should be a gRPC status error")
	assert.Equal(t, codes.Unauthenticated, st.Code(), "Should return Unauthenticated error code")
	assert.Contains(t, st.Message(), "user_id not found in context", "Error message should indicate missing user_id")
}

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

func TestMarkAsRead_DatabaseError(t *testing.T) {
	logger := zap.NewNop()

	service := &ChatService{
		logger: logger,
	}

	// Mock the MarkAsRead repository call to return an error
	service.markAsReadFn = func(ctx context.Context, arg repository.MarkAsReadParams) error {
		return errors.New("database connection failed")
	}

	// Create context with authenticated user
	ctx := contextWithUserID("660e8400-e29b-41d4-a716-446655440000")

	req := &chatv1.MarkAsReadRequest{
		ConversationId: "550e8400-e29b-41d4-a716-446655440000",
	}

	resp, err := service.MarkAsRead(ctx, req)

	// Verify error
	assert.Error(t, err)
	assert.Nil(t, resp)

	// Verify it's an Internal error
	st, ok := status.FromError(err)
	assert.True(t, ok, "Error should be a gRPC status error")
	assert.Equal(t, codes.Internal, st.Code(), "Should return Internal error code")
	assert.Contains(t, st.Message(), "failed to mark conversation as read", "Error message should indicate mark as read failure")
}

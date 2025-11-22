package middleware

import (
	"context"
	"testing"

	ctxkeys "chat-service/internal/context"

	"github.com/stretchr/testify/assert"
	"go.uber.org/zap"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
)

func TestGrpcAuthExtractor(t *testing.T) {
	logger := zap.NewNop()

	tests := []struct {
		name           string
		metadata       metadata.MD
		expectedUserID string
		expectedError  codes.Code
	}{
		{
			name: "valid x-user-id header",
			metadata: metadata.New(map[string]string{
				"x-user-id": "user-123",
			}),
			expectedUserID: "user-123",
			expectedError:  codes.OK,
		},
		{
			name:          "missing metadata",
			metadata:      nil,
			expectedError: codes.Unauthenticated,
		},
		{
			name:          "missing authentication headers",
			metadata:      metadata.New(map[string]string{}),
			expectedError: codes.Unauthenticated,
		},
		{
			name: "authorization header without implementation",
			metadata: metadata.New(map[string]string{
				"authorization": "Bearer some-token",
			}),
			expectedError: codes.Unauthenticated,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Create context with metadata
			var ctx context.Context
			if tt.metadata != nil {
				ctx = metadata.NewIncomingContext(context.Background(), tt.metadata)
			} else {
				ctx = context.Background()
			}

			// Create mock handler
			handlerCalled := false
			handler := func(ctx context.Context, req interface{}) (interface{}, error) {
				handlerCalled = true
				if tt.expectedError == codes.OK {
					// Verify user_id is in context
					userID, err := GetUserIDFromContext(ctx)
					assert.NoError(t, err)
					assert.Equal(t, tt.expectedUserID, userID)
				}
				return "response", nil
			}

			// Create interceptor
			interceptor := GrpcAuthExtractor(logger)

			// Call interceptor
			_, err := interceptor(ctx, "request", &grpc.UnaryServerInfo{FullMethod: "/test.Service/Method"}, handler)

			if tt.expectedError == codes.OK {
				assert.NoError(t, err)
				assert.True(t, handlerCalled)
			} else {
				assert.Error(t, err)
				assert.Equal(t, tt.expectedError, status.Code(err))
				assert.False(t, handlerCalled)
			}
		})
	}
}

func TestGetUserIDFromContext(t *testing.T) {
	tests := []struct {
		name          string
		ctx           context.Context
		expectedID    string
		expectedError bool
	}{
		{
			name:          "valid user_id in context",
			ctx:           context.WithValue(context.Background(), ctxkeys.UserIDKey, "user-123"),
			expectedID:    "user-123",
			expectedError: false,
		},
		{
			name:          "missing user_id in context",
			ctx:           context.Background(),
			expectedError: true,
		},
		{
			name:          "empty user_id in context",
			ctx:           context.WithValue(context.Background(), ctxkeys.UserIDKey, ""),
			expectedError: true,
		},
		{
			name:          "wrong type in context",
			ctx:           context.WithValue(context.Background(), ctxkeys.UserIDKey, 123),
			expectedError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			userID, err := GetUserIDFromContext(tt.ctx)

			if tt.expectedError {
				assert.Error(t, err)
				assert.Equal(t, codes.Unauthenticated, status.Code(err))
			} else {
				assert.NoError(t, err)
				assert.Equal(t, tt.expectedID, userID)
			}
		})
	}
}

func TestExtractUserIDFromToken(t *testing.T) {
	tests := []struct {
		name          string
		authHeader    string
		expectedError bool
	}{
		{
			name:          "invalid format - no bearer",
			authHeader:    "some-token",
			expectedError: true,
		},
		{
			name:          "invalid format - wrong prefix",
			authHeader:    "Basic some-token",
			expectedError: true,
		},
		{
			name:          "valid format but not implemented",
			authHeader:    "Bearer some-token",
			expectedError: true, // Not implemented yet
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := extractUserIDFromToken(tt.authHeader)

			if tt.expectedError {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
			}
		})
	}
}

package auth

import (
	"context"
	"testing"

	ctxkeys "chat-service/internal/context"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
)

func TestGrpcAuthInterceptor_Success(t *testing.T) {
	logger, _ := zap.NewDevelopment()
	interceptor := GrpcAuthInterceptor(logger)

	// Create context with metadata
	md := metadata.New(map[string]string{
		"x-user-id": "test-user-123",
	})
	ctx := metadata.NewIncomingContext(context.Background(), md)

	// Mock handler that checks if user_id is in context
	handlerCalled := false
	handler := func(ctx context.Context, req interface{}) (interface{}, error) {
		handlerCalled = true
		userID, ok := ctx.Value(ctxkeys.UserIDKey).(string)
		assert.True(t, ok, "user_id should be in context")
		assert.Equal(t, "test-user-123", userID)
		return "success", nil
	}

	info := &grpc.UnaryServerInfo{
		FullMethod: "/test.Service/Method",
	}

	resp, err := interceptor(ctx, nil, info, handler)

	require.NoError(t, err)
	assert.True(t, handlerCalled, "handler should be called")
	assert.Equal(t, "success", resp)
}

func TestGrpcAuthInterceptor_NoMetadata(t *testing.T) {
	logger, _ := zap.NewDevelopment()
	interceptor := GrpcAuthInterceptor(logger)

	ctx := context.Background()

	handlerCalled := false
	handler := func(ctx context.Context, req interface{}) (interface{}, error) {
		handlerCalled = true
		return nil, nil
	}

	info := &grpc.UnaryServerInfo{
		FullMethod: "/test.Service/Method",
	}

	resp, err := interceptor(ctx, nil, info, handler)

	require.Error(t, err)
	assert.False(t, handlerCalled, "handler should not be called")
	assert.Nil(t, resp)

	st, ok := status.FromError(err)
	require.True(t, ok)
	assert.Equal(t, codes.Unauthenticated, st.Code())
	assert.Contains(t, st.Message(), "missing metadata")
}

func TestGrpcAuthInterceptor_MissingUserIDHeader(t *testing.T) {
	logger, _ := zap.NewDevelopment()
	interceptor := GrpcAuthInterceptor(logger)

	// Create context with metadata but no x-user-id
	md := metadata.New(map[string]string{
		"other-header": "value",
	})
	ctx := metadata.NewIncomingContext(context.Background(), md)

	handlerCalled := false
	handler := func(ctx context.Context, req interface{}) (interface{}, error) {
		handlerCalled = true
		return nil, nil
	}

	info := &grpc.UnaryServerInfo{
		FullMethod: "/test.Service/Method",
	}

	resp, err := interceptor(ctx, nil, info, handler)

	require.Error(t, err)
	assert.False(t, handlerCalled, "handler should not be called")
	assert.Nil(t, resp)

	st, ok := status.FromError(err)
	require.True(t, ok)
	assert.Equal(t, codes.Unauthenticated, st.Code())
	assert.Contains(t, st.Message(), "missing user id")
}

func TestGrpcAuthInterceptor_EmptyUserID(t *testing.T) {
	logger, _ := zap.NewDevelopment()
	interceptor := GrpcAuthInterceptor(logger)

	// Create context with empty x-user-id
	md := metadata.New(map[string]string{
		"x-user-id": "",
	})
	ctx := metadata.NewIncomingContext(context.Background(), md)

	handlerCalled := false
	handler := func(ctx context.Context, req interface{}) (interface{}, error) {
		handlerCalled = true
		return nil, nil
	}

	info := &grpc.UnaryServerInfo{
		FullMethod: "/test.Service/Method",
	}

	resp, err := interceptor(ctx, nil, info, handler)

	require.Error(t, err)
	assert.False(t, handlerCalled, "handler should not be called")
	assert.Nil(t, resp)

	st, ok := status.FromError(err)
	require.True(t, ok)
	assert.Equal(t, codes.Unauthenticated, st.Code())
}

func TestGrpcAuthInterceptor_MultipleUserIDs(t *testing.T) {
	logger, _ := zap.NewDevelopment()
	interceptor := GrpcAuthInterceptor(logger)

	// Create context with multiple x-user-id values (should use first one)
	md := metadata.MD{
		"x-user-id": []string{"user-1", "user-2"},
	}
	ctx := metadata.NewIncomingContext(context.Background(), md)

	handlerCalled := false
	handler := func(ctx context.Context, req interface{}) (interface{}, error) {
		handlerCalled = true
		userID, ok := ctx.Value(ctxkeys.UserIDKey).(string)
		assert.True(t, ok)
		assert.Equal(t, "user-1", userID, "should use first user_id")
		return "success", nil
	}

	info := &grpc.UnaryServerInfo{
		FullMethod: "/test.Service/Method",
	}

	resp, err := interceptor(ctx, nil, info, handler)

	require.NoError(t, err)
	assert.True(t, handlerCalled)
	assert.Equal(t, "success", resp)
}

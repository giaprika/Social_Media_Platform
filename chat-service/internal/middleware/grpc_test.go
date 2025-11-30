package middleware

import (
	"context"
	"errors"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func TestGrpcLogger_Success(t *testing.T) {
	logger, _ := zap.NewDevelopment()
	interceptor := GrpcLogger(logger)

	handlerCalled := false
	handler := func(ctx context.Context, req interface{}) (interface{}, error) {
		handlerCalled = true
		return "success", nil
	}

	info := &grpc.UnaryServerInfo{
		FullMethod: "/test.Service/Method",
	}

	resp, err := interceptor(context.Background(), nil, info, handler)

	require.NoError(t, err)
	assert.True(t, handlerCalled)
	assert.Equal(t, "success", resp)
}

func TestGrpcLogger_WithError(t *testing.T) {
	logger, _ := zap.NewDevelopment()
	interceptor := GrpcLogger(logger)

	expectedErr := status.Error(codes.NotFound, "not found")
	handler := func(ctx context.Context, req interface{}) (interface{}, error) {
		return nil, expectedErr
	}

	info := &grpc.UnaryServerInfo{
		FullMethod: "/test.Service/Method",
	}

	resp, err := interceptor(context.Background(), nil, info, handler)

	require.Error(t, err)
	assert.Nil(t, resp)
	assert.Equal(t, expectedErr, err)
}

func TestGrpcLogger_WithGenericError(t *testing.T) {
	logger, _ := zap.NewDevelopment()
	interceptor := GrpcLogger(logger)

	expectedErr := errors.New("generic error")
	handler := func(ctx context.Context, req interface{}) (interface{}, error) {
		return nil, expectedErr
	}

	info := &grpc.UnaryServerInfo{
		FullMethod: "/test.Service/Method",
	}

	resp, err := interceptor(context.Background(), nil, info, handler)

	require.Error(t, err)
	assert.Nil(t, resp)
	assert.Equal(t, expectedErr, err)
}

func TestGrpcRecovery_NoPanic(t *testing.T) {
	logger, _ := zap.NewDevelopment()
	interceptor := GrpcRecovery(logger)

	handlerCalled := false
	handler := func(ctx context.Context, req interface{}) (interface{}, error) {
		handlerCalled = true
		return "success", nil
	}

	info := &grpc.UnaryServerInfo{
		FullMethod: "/test.Service/Method",
	}

	resp, err := interceptor(context.Background(), nil, info, handler)

	require.NoError(t, err)
	assert.True(t, handlerCalled)
	assert.Equal(t, "success", resp)
}

func TestGrpcRecovery_WithPanic(t *testing.T) {
	logger, _ := zap.NewDevelopment()
	interceptor := GrpcRecovery(logger)

	handler := func(ctx context.Context, req interface{}) (interface{}, error) {
		panic("test panic")
	}

	info := &grpc.UnaryServerInfo{
		FullMethod: "/test.Service/Method",
	}

	// Should not panic
	resp, err := interceptor(context.Background(), nil, info, handler)

	require.Error(t, err)
	assert.Nil(t, resp)

	st, ok := status.FromError(err)
	require.True(t, ok)
	assert.Equal(t, codes.Internal, st.Code())
	assert.Contains(t, st.Message(), "internal server error")
}

func TestGrpcRecovery_WithPanicString(t *testing.T) {
	logger, _ := zap.NewDevelopment()
	interceptor := GrpcRecovery(logger)

	handler := func(ctx context.Context, req interface{}) (interface{}, error) {
		panic("string panic")
	}

	info := &grpc.UnaryServerInfo{
		FullMethod: "/test.Service/Method",
	}

	resp, err := interceptor(context.Background(), nil, info, handler)

	require.Error(t, err)
	assert.Nil(t, resp)

	st, ok := status.FromError(err)
	require.True(t, ok)
	assert.Equal(t, codes.Internal, st.Code())
}

func TestGrpcRecovery_WithPanicError(t *testing.T) {
	logger, _ := zap.NewDevelopment()
	interceptor := GrpcRecovery(logger)

	handler := func(ctx context.Context, req interface{}) (interface{}, error) {
		panic(errors.New("error panic"))
	}

	info := &grpc.UnaryServerInfo{
		FullMethod: "/test.Service/Method",
	}

	resp, err := interceptor(context.Background(), nil, info, handler)

	require.Error(t, err)
	assert.Nil(t, resp)

	st, ok := status.FromError(err)
	require.True(t, ok)
	assert.Equal(t, codes.Internal, st.Code())
}

func TestGrpcRecovery_WithHandlerError(t *testing.T) {
	logger, _ := zap.NewDevelopment()
	interceptor := GrpcRecovery(logger)

	expectedErr := status.Error(codes.InvalidArgument, "invalid argument")
	handler := func(ctx context.Context, req interface{}) (interface{}, error) {
		return nil, expectedErr
	}

	info := &grpc.UnaryServerInfo{
		FullMethod: "/test.Service/Method",
	}

	resp, err := interceptor(context.Background(), nil, info, handler)

	require.Error(t, err)
	assert.Nil(t, resp)
	assert.Equal(t, expectedErr, err)
}

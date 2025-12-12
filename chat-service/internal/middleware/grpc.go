package middleware

import (
	"context"
	"runtime/debug"
	"time"

	"go.uber.org/zap"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// GrpcLogger logs gRPC requests
func GrpcLogger(logger *zap.Logger) grpc.UnaryServerInterceptor {
	return func(ctx context.Context, req interface{}, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (interface{}, error) {
		startTime := time.Now()

		resp, err := handler(ctx, req)

		duration := time.Since(startTime)
		statusCode := codes.OK
		if err != nil {
			statusCode = status.Code(err)
		}

		logger.Info("grpc request",
			zap.String("method", info.FullMethod),
			zap.Int("status_code", int(statusCode)),
			zap.String("status", statusCode.String()),
			zap.Duration("duration", duration),
			zap.Error(err),
		)

		return resp, err
	}
}

// GrpcRecovery recovers from panics
func GrpcRecovery(logger *zap.Logger) grpc.UnaryServerInterceptor {
	return func(ctx context.Context, req interface{}, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (resp interface{}, err error) {
		defer func() {
			if r := recover(); r != nil {
				logger.Error("grpc panic recovery",
					zap.Any("panic", r),
					zap.String("stack", string(debug.Stack())),
				)
				err = status.Errorf(codes.Internal, "internal server error")
			}
		}()
		return handler(ctx, req)
	}
}

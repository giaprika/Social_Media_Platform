package auth

import (
	"context"

	ctxkeys "chat-service/internal/context"

	"go.uber.org/zap"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
)

// GrpcAuthInterceptor extracts user_id from x-user-id header (set by API Gateway)
// and injects it into the gRPC context.
func GrpcAuthInterceptor(logger *zap.Logger) grpc.UnaryServerInterceptor {
	return func(ctx context.Context, req interface{}, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (interface{}, error) {
		md, ok := metadata.FromIncomingContext(ctx)
		if !ok {
			logger.Warn("no metadata in context", zap.String("method", info.FullMethod))
			return nil, status.Error(codes.Unauthenticated, "missing metadata")
		}

		// Get user_id from x-user-id header (set by API Gateway after JWT validation)
		userIDs := md.Get("x-user-id")
		if len(userIDs) == 0 || userIDs[0] == "" {
			logger.Warn("missing x-user-id header", zap.String("method", info.FullMethod))
			return nil, status.Error(codes.Unauthenticated, "missing user id")
		}

		ctx = context.WithValue(ctx, ctxkeys.UserIDKey, userIDs[0])
		return handler(ctx, req)
	}
}

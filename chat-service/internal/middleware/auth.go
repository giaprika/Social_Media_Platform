package middleware

import (
	"context"
	"strings"

	ctxkeys "chat-service/internal/context"

	"go.uber.org/zap"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
)

// GrpcAuthExtractor extracts user_id from JWT token (assumed validated by API Gateway)
// and injects it into the gRPC context.
func GrpcAuthExtractor(logger *zap.Logger) grpc.UnaryServerInterceptor {
	return func(ctx context.Context, req interface{}, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (interface{}, error) {
		// Extract metadata from context
		md, ok := metadata.FromIncomingContext(ctx)
		if !ok {
			logger.Warn("no metadata in context", zap.String("method", info.FullMethod))
			return nil, status.Error(codes.Unauthenticated, "missing metadata")
		}

		// Try to get user_id from x-user-id header (set by API Gateway after JWT validation)
		userIDs := md.Get("x-user-id")
		if len(userIDs) == 0 {
			// Fallback: try to extract from authorization header
			authHeaders := md.Get("authorization")
			if len(authHeaders) == 0 {
				logger.Warn("missing authentication headers", zap.String("method", info.FullMethod))
				return nil, status.Error(codes.Unauthenticated, "missing authentication")
			}

			// Extract user_id from JWT token
			userID, err := extractUserIDFromToken(authHeaders[0])
			if err != nil {
				logger.Error("failed to extract user_id from token",
					zap.Error(err),
					zap.String("method", info.FullMethod),
				)
				return nil, status.Error(codes.Unauthenticated, "invalid token")
			}

			// Inject user_id into context
			ctx = context.WithValue(ctx, ctxkeys.UserIDKey, userID)
		} else {
			// Use user_id from API Gateway
			ctx = context.WithValue(ctx, ctxkeys.UserIDKey, userIDs[0])
		}

		return handler(ctx, req)
	}
}

// extractUserIDFromToken extracts user_id from JWT token
// In production, this should validate the JWT signature and expiry
// For now, we assume the API Gateway has already validated it
func extractUserIDFromToken(authHeader string) (string, error) {
	// Expected format: "Bearer <token>"
	parts := strings.Split(authHeader, " ")
	if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
		return "", status.Error(codes.Unauthenticated, "invalid authorization header format")
	}

	// In a real implementation, you would:
	// 1. Parse the JWT token
	// 2. Validate signature
	// 3. Check expiry
	// 4. Extract user_id from claims
	//
	// For now, we assume API Gateway has done this and just return empty
	// This function is a placeholder for future JWT parsing logic
	return "", status.Error(codes.Unauthenticated, "token validation not implemented")
}

// GetUserIDFromContext retrieves user_id from context
func GetUserIDFromContext(ctx context.Context) (string, error) {
	userID, ok := ctx.Value(ctxkeys.UserIDKey).(string)
	if !ok || userID == "" {
		return "", status.Error(codes.Unauthenticated, "user_id not found in context")
	}
	return userID, nil
}

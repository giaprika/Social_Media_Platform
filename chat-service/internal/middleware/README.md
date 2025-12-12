# Auth Middleware

## Overview
Auth middleware extracts `user_id` from JWT token (assumed validated by API Gateway) and injects it into gRPC context.

## Usage

### In gRPC Server
```go
grpcServer := grpc.NewServer(
    grpc.ChainUnaryInterceptor(
        middleware.GrpcAuthExtractor(logger),
    ),
)
```

### In Service Handler
```go
func (s *ChatService) SendMessage(ctx context.Context, req *chatv1.SendMessageRequest) (*chatv1.SendMessageResponse, error) {
    userID, err := middleware.GetUserIDFromContext(ctx)
    if err != nil {
        return nil, err
    }
    // Use userID...
}
```

## Authentication Flow

### Option 1: API Gateway sets x-user-id header (Recommended)
```
Client → API Gateway (validates JWT) → Chat Service
         └─ Sets x-user-id header
```

Request metadata:
```
x-user-id: user-123-uuid
```

### Option 2: Direct JWT token (Future implementation)
```
Client → Chat Service (validates JWT)
```

Request metadata:
```
authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## Current Implementation

- ✅ Extracts `user_id` from `x-user-id` header (set by API Gateway)
- ✅ Injects `user_id` into context
- ✅ Provides `GetUserIDFromContext()` helper
- ⚠️ JWT token parsing is placeholder (assumes API Gateway validation)

## Future Enhancements

1. Implement full JWT validation:
   - Parse JWT token
   - Validate signature with public key
   - Check expiry
   - Extract claims (user_id, roles, etc.)

2. Add role-based authorization:
   - Extract roles from token
   - Check permissions per endpoint

3. Add token refresh logic

## Testing

Run tests:
```bash
go test ./internal/middleware/... -v
```

Coverage:
```bash
go test ./internal/middleware/... -cover
```

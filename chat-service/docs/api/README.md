# Chat Service API Documentation

## 🚀 Quick Start

### View API Documentation

The easiest way to view the interactive API documentation:

**Windows (PowerShell):**
```powershell
cd docs/api
.\serve.ps1
```

**Linux/Mac:**
```bash
cd docs/api
./serve.sh
```

**Or using Make:**
```bash
make docs
```

Then open your browser at: **http://localhost:8081**

## 📋 Setup

### Prerequisites

The OpenAPI spec is already generated and committed to the repository. If you need to regenerate it:

1. Install the `protoc-gen-openapiv2` plugin:
```bash
go install github.com/grpc-ecosystem/grpc-gateway/v2/protoc-gen-openapiv2@latest
```

2. Regenerate the spec:
```bash
make gen-proto
```

This will update `chat-service.swagger.json` in the `docs/api` directory.

## 📚 API Endpoints

The Chat Service exposes the following REST endpoints:

### Send Message
- **POST** `/v1/messages`
- Send a new message to a conversation
- Requires: `Authorization` header with JWT token
- Requires: `X-Idempotency-Key` header for idempotency
- Body: `{ "conversation_id": "string", "content": "string", "idempotency_key": "string" }`

### Get Messages
- **GET** `/v1/conversations/{conversation_id}/messages`
- Retrieve messages from a conversation with pagination
- Query params: `limit` (default 50, max 100), `before_timestamp` (RFC3339)

### Get Conversations
- **GET** `/v1/conversations`
- Get list of user's conversations with unread counts
- Query params: `limit`, `cursor` (for pagination)

### Mark as Read
- **POST** `/v1/conversations/{conversation_id}/read`
- Mark all messages in a conversation as read

## 🔐 Authentication

All endpoints require authentication via JWT token in the `Authorization` header:

```
Authorization: Bearer YOUR_JWT_TOKEN
```

The `user_id` is automatically extracted from the JWT token by the auth middleware.

## 🧪 Testing the API

### Using Swagger UI (Recommended)

1. Start the documentation server (see Quick Start above)
2. Open http://localhost:8081 in your browser
3. Click "Authorize" and enter your JWT token
4. Try out the endpoints directly from the UI

### Using curl

```bash
# Send a message
curl -X POST http://localhost:8080/v1/messages \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -H "X-Idempotency-Key: unique-key-$(date +%s)" \
  -d '{
    "conversation_id": "conv-123",
    "content": "Hello, world!"
  }'

# Get messages
curl -X GET "http://localhost:8080/v1/conversations/conv-123/messages?limit=20" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Get conversations
curl -X GET "http://localhost:8080/v1/conversations?limit=10" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Mark as read
curl -X POST http://localhost:8080/v1/conversations/conv-123/read \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
```

## 📁 Files

- `chat-service.swagger.json` - OpenAPI 2.0 specification
- `index.html` - Swagger UI interface
- `serve.sh` / `serve.ps1` - Helper scripts to start documentation server
- `README.md` - This file

## 🔄 Regenerating Documentation

If you modify the proto files, regenerate the OpenAPI spec:

```bash
# Update proto definitions
vim api/proto/chat/v1/chat.proto

# Regenerate everything
make gen-proto

# View updated docs
make docs
```

## 🛠️ Alternative HTTP Servers

If Python is not available, you can use:

### Node.js (http-server)
```bash
npm install -g http-server
cd docs/api
http-server -p 8081
```

### Go
```bash
cd docs/api
go run github.com/shurcooL/goexec@latest 'http.ListenAndServe(":8081", http.FileServer(http.Dir(".")))'
```

### PHP
```bash
cd docs/api
php -S localhost:8081
```

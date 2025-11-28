# Chat Service

A high-performance, scalable real-time chat service built with Go, gRPC, PostgreSQL, and Redis. Designed for reliability with idempotency guarantees, transactional outbox pattern, and comprehensive observability.

## Features

- ✅ **Real-time Messaging** - Send and receive messages with sub-second latency
- ✅ **Idempotency** - Exactly-once message delivery using Redis-based deduplication
- ✅ **Transactional Outbox** - Reliable event publishing with guaranteed delivery
- ✅ **Pagination** - Cursor-based pagination for messages and conversations
- ✅ **Read Receipts** - Track unread message counts per conversation
- ✅ **gRPC + HTTP/JSON** - Dual API support via gRPC-Gateway
- ✅ **Authentication** - JWT-based authentication with middleware
- ✅ **Observability** - Structured logging, metrics, and distributed tracing
- ✅ **High Test Coverage** - >85% test coverage with comprehensive unit tests

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Clients                              │
│              (gRPC / HTTP+JSON / WebSocket)                 │
└────────────────────┬────────────────────────────────────────┘
                     │
         ┌───────────┴───────────┐
         │                       │
    ┌────▼─────┐          ┌─────▼──────┐
    │  gRPC    │          │   HTTP     │
    │  Server  │          │  Gateway   │
    └────┬─────┘          └─────┬──────┘
         │                      │
         └──────────┬───────────┘
                    │
         ┌──────────▼──────────┐
         │   Middleware        │
         │  - Auth             │
         │  - Logging          │
         │  - Recovery         │
         └──────────┬──────────┘
                    │
         ┌──────────▼──────────┐
         │   Service Layer     │
         │  - SendMessage      │
         │  - GetMessages      │
         │  - GetConversations │
         │  - MarkAsRead       │
         └──────────┬──────────┘
                    │
         ┌──────────┴──────────┐
         │                     │
    ┌────▼─────┐        ┌─────▼──────┐
    │  Redis   │        │ PostgreSQL │
    │(Idempot.)│        │ (Messages) │
    └──────────┘        └─────┬──────┘
                              │
                        ┌─────▼──────┐
                        │   Outbox   │
                        │  Processor │
                        └────────────┘
```

## Tech Stack

- **Language**: Go 1.25+
- **API**: gRPC with gRPC-Gateway (HTTP/JSON)
- **Database**: PostgreSQL 15 with pgx/v5
- **Cache**: Redis 7 for idempotency
- **Code Generation**: 
  - Protocol Buffers (Buf)
  - sqlc for type-safe SQL
- **Observability**:
  - Structured logging (zap)
  - Metrics (Prometheus)
  - Dashboards (Grafana)
- **Testing**: testify with >85% coverage

## Quick Start

### Prerequisites

- Go 1.25 or higher
- Docker and Docker Compose
- Make (optional, for convenience)

### 1. Clone the Repository

```bash
git clone <repository-url>
cd chat-service
```

### 2. Start Infrastructure

```bash
docker-compose up -d
```

This starts:
- PostgreSQL on port 5432
- Redis on port 6379
- Prometheus on port 9090
- Grafana on port 3000

### 3. Run Database Migrations

```bash
# Install migrate tool if not already installed
go install -tags 'postgres' github.com/golang-migrate/migrate/v4/cmd/migrate@latest

# Run migrations
migrate -path migrations -database "postgresql://user:password@localhost:5432/chat_db?sslmode=disable" up
```

### 4. Configure Environment

Create an `app.env` file in the project root:

```env
ENVIRONMENT=development
DB_SOURCE=postgresql://user:password@localhost:5432/chat_db?sslmode=disable
REDIS_ADDR=localhost:6379
HTTP_SERVER_ADDRESS=0.0.0.0:8080
GRPC_SERVER_ADDRESS=0.0.0.0:9090
```

### 5. Run the Server

```bash
go run cmd/server/main.go
```

The service will start:
- gRPC server on port 9090
- HTTP gateway on port 8080

### 6. Test the API

#### Using gRPC (grpcurl)

```bash
# Send a message
grpcurl -plaintext \
  -H "authorization: Bearer <your-jwt-token>" \
  -d '{
    "conversation_id": "550e8400-e29b-41d4-a716-446655440000",
    "content": "Hello, World!",
    "idempotency_key": "unique-key-123"
  }' \
  localhost:9090 chat.v1.ChatService/SendMessage

# Get messages
grpcurl -plaintext \
  -d '{
    "conversation_id": "550e8400-e29b-41d4-a716-446655440000",
    "limit": 50
  }' \
  localhost:9090 chat.v1.ChatService/GetMessages
```

#### Using HTTP/JSON

```bash
# Send a message
curl -X POST http://localhost:8080/v1/messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-jwt-token>" \
  -d '{
    "conversation_id": "550e8400-e29b-41d4-a716-446655440000",
    "content": "Hello, World!",
    "idempotency_key": "unique-key-123"
  }'

# Get messages
curl "http://localhost:8080/v1/conversations/550e8400-e29b-41d4-a716-446655440000/messages?limit=50"
```

## Project Structure

```
chat-service/
├── api/                          # API definitions
│   ├── chat/v1/                  # Generated gRPC code
│   └── proto/                    # Protocol Buffer definitions
├── cmd/                          # Application entry points
│   ├── server/                   # Main gRPC/HTTP server
│   ├── outbox/                   # Outbox processor
│   └── ws-gateway/               # WebSocket gateway
├── internal/                     # Private application code
│   ├── config/                   # Configuration management
│   ├── context/                  # Context keys
│   ├── domain/                   # Domain models
│   ├── middleware/               # gRPC/HTTP middleware
│   │   ├── auth.go              # Authentication
│   │   ├── logger.go            # Request logging
│   │   └── recovery.go          # Panic recovery
│   ├── repository/               # Database layer (sqlc)
│   └── service/                  # Business logic
│       ├── chat_service.go      # Service implementation
│       ├── README.md            # Service documentation
│       └── TESTING_GUIDE.md     # Testing patterns
├── pkg/                          # Public libraries
│   ├── idempotency/             # Idempotency checker
│   └── ws/                      # WebSocket utilities
├── migrations/                   # Database migrations
├── scripts/                      # Utility scripts
├── deploy/                       # Deployment configs
│   └── prometheus/              # Prometheus config
├── docs/                         # Documentation
├── docker-compose.yml           # Local development stack
├── Makefile                     # Build automation
├── buf.gen.yaml                 # Buf code generation
├── sqlc.yaml                    # sqlc configuration
└── go.mod                       # Go dependencies
```

## API Documentation

### gRPC Service Definition

```protobuf
service ChatService {
  // Send a message to a conversation
  rpc SendMessage(SendMessageRequest) returns (SendMessageResponse);
  
  // Get messages from a conversation with pagination
  rpc GetMessages(GetMessagesRequest) returns (GetMessagesResponse);
  
  // Get all conversations for the authenticated user
  rpc GetConversations(GetConversationsRequest) returns (GetConversationsResponse);
  
  // Mark all messages in a conversation as read
  rpc MarkAsRead(MarkAsReadRequest) returns (MarkAsReadResponse);
}
```

### Key Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/v1/messages` | Send a message |
| GET | `/v1/conversations/{id}/messages` | Get messages |
| GET | `/v1/conversations` | List conversations |
| POST | `/v1/conversations/{id}/read` | Mark as read |

For detailed API documentation, see the [Protocol Buffer definitions](api/proto/chat/v1/chat.proto).

## Development

### Code Generation

```bash
# Generate Protocol Buffers
make gen-proto

# Generate SQL code (sqlc)
make gen-sql

# Generate both
make gen
```

### Running Tests

```bash
# Run all tests
go test ./... -v

# Run with coverage
go test ./... -v -cover

# Generate coverage report
go test ./... -coverprofile=coverage.out
go tool cover -html=coverage.out

# Run specific package tests
go test ./internal/service/... -v

# Run integration tests (requires Docker)
go test -v -tags=integration ./internal/outbox/... -timeout 120s
```

### Testing Guidelines

The project follows comprehensive testing practices:

- **Unit Tests**: >85% coverage with mocked dependencies
- **Table-Driven Tests**: For validation and edge cases
- **Mock Pattern**: Using testify/mock for external dependencies
- **Fast Tests**: All unit tests complete in <5 seconds

See [internal/service/TESTING_GUIDE.md](internal/service/TESTING_GUIDE.md) for detailed testing patterns and examples.

### Database Migrations

```bash
# Create a new migration
migrate create -ext sql -dir migrations -seq <migration_name>

# Run migrations
migrate -path migrations -database "postgresql://user:password@localhost:5432/chat_db?sslmode=disable" up

# Rollback last migration
migrate -path migrations -database "postgresql://user:password@localhost:5432/chat_db?sslmode=disable" down 1
```

### Utility Scripts

```bash
# Test chat flow (PowerShell)
.\scripts\test_chat_flow.ps1

# Test chat flow (Bash)
./scripts/test_chat_flow.sh

# Clear Redis idempotency key
.\scripts\clear-redis-key.ps1 <key>
```

## Configuration

Configuration is managed via environment variables or `app.env` file:

| Variable | Description | Default |
|----------|-------------|---------|
| `ENVIRONMENT` | Environment name | `development` |
| `DB_SOURCE` | PostgreSQL connection string | - |
| `REDIS_ADDR` | Redis address | `localhost:6379` |
| `HTTP_SERVER_ADDRESS` | HTTP server bind address | `0.0.0.0:8080` |
| `GRPC_SERVER_ADDRESS` | gRPC server bind address | `0.0.0.0:9090` |
| `METRICS_PORT` | Prometheus metrics port | `9090` |
| `OUTBOX_POLL_INTERVAL_MS` | Outbox poll interval (ms) | `100` |
| `OUTBOX_BATCH_SIZE` | Outbox batch size | `100` |

## Key Features

### Idempotency

All message sends are idempotent using Redis-based deduplication:

```go
// Each request requires a unique idempotency key
req := &chatv1.SendMessageRequest{
    ConversationId: "550e8400-e29b-41d4-a716-446655440000",
    Content:        "Hello",
    IdempotencyKey: "unique-key-123", // Required
}
```

Duplicate requests (same idempotency key) return `AlreadyExists` error without side effects.

See [pkg/idempotency/README.md](pkg/idempotency/README.md) for details.

### Transactional Outbox Pattern

Messages are stored atomically with outbox events in a single transaction:

1. Begin transaction
2. Insert message into `messages` table
3. Insert event into `outbox` table
4. Commit transaction

A separate outbox processor publishes events asynchronously to Redis Streams, ensuring reliable event delivery even if the message service crashes.

#### Outbox Processor Features

- **Batch Processing**: 100 events per batch with concurrent worker pool (10 workers)
- **Retry Logic**: Exponential backoff (1s → 2s → 4s) with max 3 retries
- **Dead Letter Queue**: Failed events moved to DLQ for manual recovery
- **Graceful Shutdown**: Completes current batch before exit
- **Metrics**: Prometheus metrics for monitoring
- **P99 Latency**: < 200ms from insert to Redis Streams

#### Running the Outbox Processor

```bash
go run cmd/outbox/main.go
```

Metrics available at `http://localhost:9090/metrics`:
- `outbox_pending_count` - Current pending events
- `outbox_processed_total` - Total processed events
- `outbox_publish_errors_total` - Total publish errors
- `outbox_dlq_total` - Events moved to Dead Letter Queue

#### Dead Letter Queue Recovery

```sql
-- View failed events
SELECT * FROM outbox_dlq ORDER BY moved_to_dlq_at DESC;

-- Replay an event
INSERT INTO outbox (aggregate_type, aggregate_id, payload)
SELECT aggregate_type, aggregate_id, payload FROM outbox_dlq WHERE id = '<dlq_id>';

-- Delete from DLQ after successful replay
DELETE FROM outbox_dlq WHERE id = '<dlq_id>';
```

### Pagination

Cursor-based pagination for efficient message retrieval:

```bash
# First page
GET /v1/conversations/{id}/messages?limit=50

# Next page using cursor from previous response
GET /v1/conversations/{id}/messages?limit=50&before_timestamp=2025-01-15T10:30:00Z
```

### Authentication

JWT-based authentication via middleware:

```go
// Middleware extracts user_id from JWT token
// Available in context for all handlers
userID := ctx.Value(ctxkeys.UserIDKey).(string)
```

See [internal/middleware/README.md](internal/middleware/README.md) for details.

## Observability

### Logging

Structured logging with zap:

```go
logger.Info("message sent",
    zap.String("message_id", messageID),
    zap.String("conversation_id", conversationID),
    zap.String("user_id", userID),
)
```

### Metrics

Prometheus metrics available at `http://localhost:9090/metrics`:

- Request counts by method and status
- Request duration histograms
- Active connections
- Database connection pool stats

### Monitoring

Access Grafana dashboards at `http://localhost:3000`:
- Username: `admin`
- Password: `admin`

Pre-configured dashboards for:
- Request rates and latencies
- Error rates
- Database performance
- Redis operations

### Alerting

Prometheus alert rules configured in `deploy/prometheus/alert_rules.yml`:

| Alert | Condition | Severity |
|-------|-----------|----------|
| `OutboxBacklogHigh` | pending > 1000 for 5m | warning |
| `OutboxBacklogCritical` | pending > 5000 for 2m | critical |
| `OutboxPublishErrorsHigh` | error rate > 10/sec | warning |
| `OutboxDLQIncreasing` | DLQ rate > 0 | warning |
| `OutboxProcessorStuck` | no processing + pending > 0 | critical |

## Performance

### Benchmarks

- **SendMessage**: ~2ms average (with Redis + PostgreSQL)
- **GetMessages**: ~1ms average (50 messages)
- **GetConversations**: ~1.5ms average (50 conversations)
- **MarkAsRead**: ~1ms average

### Scalability

- Horizontal scaling: Stateless service, scale by adding instances
- Database: PostgreSQL with connection pooling (pgxpool)
- Cache: Redis for idempotency with automatic key expiration
- Outbox: Separate processor for async event publishing

## Deployment

### Docker

```bash
# Build image
docker build -t chat-service:latest .

# Run container
docker run -p 8080:8080 -p 9090:9090 \
  -e DB_SOURCE="postgresql://..." \
  -e REDIS_ADDR="redis:6379" \
  chat-service:latest
```

### Kubernetes

See [deploy/](deploy/) directory for Kubernetes manifests.

## Troubleshooting

### Common Issues

**Database connection failed**
```bash
# Check PostgreSQL is running
docker ps | grep postgres

# Test connection
psql -h localhost -U user -d chat_db
```

**Redis connection failed**
```bash
# Check Redis is running
docker ps | grep redis

# Test connection
redis-cli -h localhost ping
```

**Port already in use**
```bash
# Find process using port
lsof -i :8080  # macOS/Linux
netstat -ano | findstr :8080  # Windows

# Kill process or change port in app.env
```

### Debug Mode

Enable debug logging:

```env
ENVIRONMENT=development
```

This enables:
- Verbose request/response logging
- SQL query logging
- Stack traces on errors

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Write tests for your changes
4. Ensure tests pass (`go test ./... -v`)
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

### Code Standards

- Follow [Effective Go](https://golang.org/doc/effective_go) guidelines
- Write tests for all new features (maintain >80% coverage)
- Use `gofmt` for formatting
- Add comments for exported functions
- Update documentation for API changes

## License

[Your License Here]

## Support

For questions or issues:
- Open an issue on GitHub
- Check existing documentation in [docs/](docs/)
- Review component READMEs:
  - [Service Layer](internal/service/README.md)
  - [Testing Guide](internal/service/TESTING_GUIDE.md)
  - [Idempotency](pkg/idempotency/README.md)
  - [Middleware](internal/middleware/README.md)

## Roadmap

- [x] ~~Transactional Outbox Pattern~~
- [x] ~~Outbox Processor with Redis Streams~~
- [x] ~~Retry Logic with Exponential Backoff~~
- [x] ~~Dead Letter Queue~~
- [x] ~~Prometheus Metrics & Alerts~~
- [ ] WebSocket Gateway for real-time updates
- [ ] Message reactions and threading
- [ ] File attachments
- [ ] End-to-end encryption
- [ ] Message search with full-text indexing
- [ ] Rate limiting
- [ ] Multi-tenancy support
- [ ] GraphQL API

---

Built with ❤️ using Go and gRPC

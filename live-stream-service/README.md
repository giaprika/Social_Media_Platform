# Live Streaming Service

A microservice-based live streaming platform that enables users to broadcast live video content and allows viewers to watch in real-time.

## Features

- **Live Broadcasting**: Support for RTMP (OBS Studio) and WebRTC (browser) ingest
- **Real-time Playback**: HLS delivery via CDN with 10-15s latency
- **Stream Management**: Create, manage, and monitor live sessions
- **Authentication**: Secure stream keys and user validation
- **Scalability**: Support for 50+ concurrent streams

## Technology Stack

- **Backend**: Go 1.21+ with Gin framework
- **Database**: PostgreSQL with connection pooling
- **Media Server**: SRS (Simple Realtime Server) v5
- **Storage**: Google Cloud Storage with gcsfuse mount
- **CDN**: Google Cloud CDN

## Quick Start

### Prerequisites

- Go 1.21+
- PostgreSQL 13+
- Docker (for SRS media server)

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd live-service
```

2. Install dependencies:
```bash
make deps
```

3. Setup database:
```bash
# Create database
createdb live_service

# Run migrations
make migrate-up
```

4. Configure environment:
```bash
# Copy environment template
cp .env.example .env
# Edit .env with your settings (database credentials, etc.)
```

5. Start the service:
```bash
make run
```

## Development

### Project Structure

```
live-service/
├── cmd/                    # Application entry points
├── internal/              # Private application code
│   ├── config/           # Configuration management
│   ├── entity/           # Domain entities/models
│   ├── repository/       # Data access layer
│   ├── handler/          # HTTP handlers
│   ├── service/          # Business logic layer
│   └── middleware/       # HTTP middleware
├── pkg/                   # Public library code
├── bin/                   # Build output directory
├── migrations/           # Database migration files
├── .env                  # Environment configuration
├── .env.example          # Environment template
└── docs/                 # Documentation
```

### Available Commands

```bash
make build        # Build the application
make run          # Run the application
make test         # Run tests
make test-race    # Run tests with race detection
make deps         # Download dependencies
make migrate-up   # Run database migrations
make fmt          # Format code
make lint         # Lint code
```

### API Endpoints

- `POST /api/v1/live/create` - Create new live stream
- `GET /api/v1/live/feed` - List active streams
- `GET /api/v1/live/:id` - Get stream details
- `POST /api/v1/callbacks/on_publish` - SRS publish callback
- `POST /api/v1/callbacks/on_unpublish` - SRS unpublish callback

## Configuration

The service uses environment variables for configuration. Configuration is loaded from:

- `.env` file (recommended for development)
- System environment variables (for production)

### Environment Variables

- `DB_HOST` - Database host
- `DB_PORT` - Database port
- `DB_USER` - Database user
- `DB_PASSWORD` - Database password
- `SRS_SERVER_URL` - SRS server URL
- `GCS_BUCKET_NAME` - Google Cloud Storage bucket name

## License

[MIT License]
# Live Streaming Service

A microservice-based live streaming platform that enables users to broadcast live video content via RTMP/WebRTC and allows viewers to watch in real-time via HLS.

## Features

- **Live Broadcasting**: RTMP (OBS Studio) and WebRTC (browser) ingest
- **Real-time Playback**: HLS delivery via CDN with 10-15s latency
- **Real-time Chat**: WebSocket-based chat with viewer count updates
- **Stream Management**: Create, manage, and monitor live sessions
- **Authentication**: Secure stream keys (auth via API Gateway)
- **Rate Limiting**: Chat spam protection (5 msg/sec limit)
- **Scalability**: Support for 50+ concurrent streams

## Technology Stack

- **Backend**: Go 1.21+ with Gin framework
- **Database**: PostgreSQL with connection pooling
- **Media Server**: SRS (Simple Realtime Server) v5
- **WebSocket**: gorilla/websocket for real-time chat
- **Storage**: Google Cloud Storage with gcsfuse mount
- **CDN**: Google Cloud CDN

---

## Quick Start

### Prerequisites

- Go 1.21+
- PostgreSQL 13+
- Docker (for SRS media server)

### Installation

```bash
# Clone repository
git clone <repository-url>
cd live-service

# Install dependencies
make deps

# Setup database
createdb live_service
make migrate-up

# Configure environment
cp .env.example .env
# Edit .env with your settings

# Start the service
make run
```

---

## API Reference

Base URL: 
- Development: `http://localhost:8080`
- Production: `https://api.extase.dev`

### Authentication

Authentication is handled by API Gateway/upstream service. This service expects `X-User-ID` header:

```
X-User-ID: 123
```

---

### Stream Management

#### Create Stream
```http
POST /api/v1/live/create
X-User-ID: 123
Content-Type: application/json

{
  "title": "My Live Stream",
  "description": "Optional description"
}
```

**Response (201):**
```json
{
  "id": 123,
  "stream_key": "abc123xyz",
  "rtmp_url": "rtmp://server-ip:1935/live/123?token=abc123xyz",
  "webrtc_url": "webrtc://server-ip/live/123?token=abc123xyz",
  "hls_url": "https://cdn.example.com/live/123/index.m3u8"
}
```

#### List Live Streams (Feed)
```http
GET /api/v1/live/feed?page=1&limit=20
```

**Response (200):**
```json
{
  "streams": [
    {
      "id": 123,
      "user_id": 1,
      "title": "My Stream",
      "status": "LIVE",
      "viewer_count": 42,
      "hls_url": "https://cdn.example.com/live/123/index.m3u8",
      "started_at": "2024-01-15T10:30:00Z",
      "created_at": "2024-01-15T10:25:00Z"
    }
  ],
  "total": 100,
  "page": 1,
  "limit": 20,
  "total_pages": 5
}
```

#### Get Stream Details
```http
GET /api/v1/live/:id
X-User-ID: 123  (optional - shows stream_key if owner)
```

**Response (200):**
```json
{
  "id": 123,
  "user_id": 1,
  "title": "My Stream",
  "description": "Stream description",
  "status": "LIVE",
  "stream_key": "abc123xyz",      // Only if owner
  "rtmp_url": "rtmp://...",       // Only if owner
  "webrtc_url": "webrtc://...",   // Only if owner
  "hls_url": "https://cdn.example.com/live/123/index.m3u8",
  "viewer_count": 42,
  "started_at": "2024-01-15T10:30:00Z",
  "is_owner": true
}
```

#### Get WebRTC Info
```http
GET /api/v1/live/:id/webrtc
X-User-ID: 123  (optional - shows publish_url if owner)
```

**Response (200):**
```json
{
  "id": 123,
  "status": "LIVE",
  "publish_url": "webrtc://server-ip/live/123?token=abc123xyz",
  "play_url": "webrtc://server-ip/live/123",
  "whip_endpoint": "http://server-ip:1985/rtc/v1/whip/?app=live&stream=123",
  "whep_endpoint": "http://server-ip:1985/rtc/v1/whep/?app=live&stream=123",
  "ice_servers": [
    {
      "urls": ["stun:stun.l.google.com:19302"]
    },
    {
      "urls": ["turn:server-ip:3478"],
      "username": "timestamp:username",
      "credential": "hmac-sha1-credential"
    }
  ],
  "is_owner": true
}
```

#### Get Viewer Count
```http
GET /api/v1/live/:id/viewers
```

**Response (200):**
```json
{
  "stream_id": 123,
  "viewer_count": 42
}
```

---

### WebSocket (Real-time Chat)

#### Connect
```
ws://localhost:8080/ws/live/:id?user_id=456&username=John
```

**Query Parameters:**
| Param | Required | Description |
|-------|----------|-------------|
| `user_id` | Yes | User identifier |
| `username` | No | Display name (default: `User_{user_id}`) |

#### Message Types

**Client → Server:**
```json
{
  "type": "CHAT",
  "content": "Hello everyone!"
}
```

**Server → Client:**

1. **Chat Broadcast**
```json
{
  "type": "CHAT_BROADCAST",
  "stream_id": 123,
  "user_id": 456,
  "username": "John",
  "content": "Hello everyone!",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

2. **Viewer Count Update** (throttled to max 1/3s)
```json
{
  "type": "VIEW_UPDATE",
  "stream_id": 123,
  "count": 42,
  "timestamp": "2024-01-15T10:30:00Z"
}
```

3. **Joined Confirmation**
```json
{
  "type": "JOINED",
  "stream_id": 123,
  "count": 42,
  "timestamp": "2024-01-15T10:30:00Z"
}
```

4. **Error**
```json
{
  "type": "ERROR",
  "content": "Rate limit exceeded. Connection closed.",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

#### Rate Limits
- Max **5 messages per second** per connection
- Max **200 characters** per message
- Exceeding rate limit closes connection

---

### SRS Callbacks (Internal)

These endpoints are called by SRS media server (IP whitelisted):

```http
POST /api/v1/callbacks/on_publish   # Stream started
POST /api/v1/callbacks/on_unpublish # Stream ended
```

---

### Health Checks

```http
GET /health      # API service health
GET /health/srs  # SRS media server health
```

---

## Frontend Integration Examples

### JavaScript - WebSocket Chat

```javascript
class LiveChat {
  constructor(streamId, userId, username, baseUrl = 'wss://api.extase.dev') {
    this.streamId = streamId;
    this.ws = new WebSocket(
      `${baseUrl}/ws/live/${streamId}?user_id=${userId}&username=${encodeURIComponent(username)}`
    );
    
    this.ws.onopen = () => console.log('Connected to chat');
    
    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      
      switch (msg.type) {
        case 'CHAT_BROADCAST':
          this.onChat(msg.username, msg.content);
          break;
        case 'VIEW_UPDATE':
          this.onViewerUpdate(msg.count);
          break;
        case 'JOINED':
          this.onViewerUpdate(msg.count);
          break;
        case 'ERROR':
          console.error('Chat error:', msg.content);
          break;
      }
    };
    
    this.ws.onclose = () => console.log('Disconnected from chat');
  }
  
  sendMessage(content) {
    if (content.length > 200) {
      console.error('Message too long');
      return;
    }
    this.ws.send(JSON.stringify({ type: 'CHAT', content }));
  }
  
  onChat(username, content) {
    // Override this method
    console.log(`${username}: ${content}`);
  }
  
  onViewerUpdate(count) {
    // Override this method
    console.log(`Viewers: ${count}`);
  }
  
  disconnect() {
    this.ws.close();
  }
}

// Usage
const chat = new LiveChat(123, 456, 'John');
chat.onChat = (user, msg) => appendToChatUI(user, msg);
chat.onViewerUpdate = (count) => updateViewerCount(count);
chat.sendMessage('Hello!');
```

### JavaScript - HLS Player (hls.js)

```javascript
import Hls from 'hls.js';

function playStream(streamId) {
  const video = document.getElementById('video');
  const hlsUrl = `https://cdn.example.com/live/${streamId}/index.m3u8`;
  
  if (Hls.isSupported()) {
    const hls = new Hls({
      lowLatencyMode: true,
      liveSyncDuration: 3,
      liveMaxLatencyDuration: 10,
    });
    hls.loadSource(hlsUrl);
    hls.attachMedia(video);
    hls.on(Hls.Events.MANIFEST_PARSED, () => video.play());
  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    // Safari native HLS
    video.src = hlsUrl;
    video.play();
  }
}
```

### OBS Studio Configuration

1. Go to **Settings → Stream**
2. Service: **Custom**
3. Server: `rtmp://your-server-ip:1935/live`
4. Stream Key: `{stream_id}?token={stream_key}` (from create response)

Example: `123?token=abc123xyz`

---

## Development

### Project Structure

```
live-service/
├── cmd/main.go              # Application entry point
├── internal/
│   ├── config/              # Configuration management
│   ├── entity/              # Domain models
│   ├── repository/          # Data access layer
│   ├── handler/             # HTTP & WebSocket handlers
│   ├── service/             # Business logic
│   ├── middleware/          # Auth, CORS, logging
│   └── websocket/           # WebSocket hub & client
├── pkg/utils/               # Utility functions
├── migrations/              # Database migrations
├── configs/                 # SRS & Caddy configs
├── scripts/                 # Setup & deployment scripts
├── web/demo/                # WebRTC demo client
└── docs/                    # Documentation
```

### Available Commands

```bash
make build        # Build binary
make run          # Run application
make test         # Run tests
make test-race    # Run tests with race detection
make deps         # Download dependencies
make migrate-up   # Run database migrations
make migrate-down # Rollback migrations
make fmt          # Format code
make lint         # Lint code
```

### Environment Variables

See `.env.example` for full list. Key variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `SERVER_PORT` | API server port | 8080 |
| `DB_HOST` | PostgreSQL host | localhost |
| `DB_PORT` | PostgreSQL port | 5432 |
| `SRS_SERVER_IP` | SRS server IP | localhost |
| `SRS_PUBLIC_IP` | Public IP for WebRTC | 127.0.0.1 |
| `TURN_SECRET` | TURN server shared secret | - |

---

## Deployment

See `docs/` for detailed guides:
- `docs/caddy-ssl-setup.md` - SSL/TLS with Caddy
- `docs/gcsfuse-setup.md` - GCS bucket mounting
- `docs/SRS.md` - SRS media server configuration

## License

MIT License

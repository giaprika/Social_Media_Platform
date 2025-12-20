# Feed Service

A high-performance feed service that delivers personalized content feeds using intelligent scoring algorithms and efficient fan-out architecture.

## Features

- **Intelligent Feed Scoring**: Dynamic scoring based on likes, comments, and time decay
- **Efficient Fan-Out**: RabbitMQ-based message distribution to followers
- **Real-time Updates**: Score updates on post engagement (likes/comments)
- **Lazy Loading**: Pagination support with view tracking
- **Automatic Cleanup**: Scheduled removal of old viewed items (every 12 hours)
- **Scalable Architecture**: PostgreSQL with optimized indexes

## Architecture

### Database Schema

```sql
feed_items (
  id: SERIAL PRIMARY KEY,
  user_id: INTEGER,
  post_id: INTEGER,
  score: DECIMAL(10, 4),
  created_at: TIMESTAMP,
  viewed_at: TIMESTAMP
)
```

### Score Calculation Formula

```
score = (likes × 2 + comments × 5) × e^(-0.1 × age_in_days) × view_penalty

where:
- likes × 2: Each like contributes 2 points
- comments × 5: Each comment contributes 5 points (more valuable)
- e^(-0.1 × age_in_days): Exponential time decay (10% per day)
- view_penalty: 0.1 if viewed, 1.0 if not viewed
```

## API Endpoints

### Get User Feed

```http
GET /api/feed?userId={userId}&page=1&limit=10
```

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "user_id": 123,
      "post_id": 456,
      "score": 12.5432,
      "created_at": "2025-12-11T10:00:00Z",
      "viewed_at": null
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "hasMore": true
  }
}
```

### Mark Items as Viewed

```http
POST /api/feed/view
Content-Type: application/json

{
  "feedItemIds": [1, 2, 3]
}
```

### Manual Cleanup (Admin)

```http
POST /api/feed/cleanup?days=10
```

### Health Check

```http
GET /api/feed/health
```

## RabbitMQ Integration

### Exchanges and Queues

**Post Events Exchange**: `post.events`

- Routing Key: `post.created`
- Queue: `feed.fanout`

**Engagement Events Exchange**: `engagement.events`

- Routing Keys: `post.liked`, `post.unliked`, `comment.created`, `comment.deleted`
- Queue: `feed.score.update`

### Message Formats

**Post Created (Fan-out)**

```json
{
  "postId": 456,
  "authorId": 123,
  "followerIds": [1, 2, 3, 4, 5]
}
```

**Engagement Update (Score Update)**

```json
{
  "postId": 456,
  "likes": 10,
  "comments": 3,
  "createdAt": "2025-12-11T10:00:00Z"
}
```

## Environment Variables

```env
PORT=3006
NODE_ENV=development

# Database
DB_HOST=postgres
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=feed_db

# RabbitMQ
RABBITMQ_URL=amqp://rabbitmq:5672

# Cleanup Job
CLEANUP_CRON_SCHEDULE=0 */12 * * *
CLEANUP_DAYS_THRESHOLD=10
```

## Running the Service

### Development

```bash
npm install
npm run dev
```

### Production

```bash
npm install --only=production
npm start
```

### Docker

```bash
docker build -t feed-service .
docker run -p 3006:3006 --env-file .env feed-service
```

## Integration Guide

### 1. Post Service Integration

When a post is created, publish to RabbitMQ:

```javascript
// In post-service
await channel.publish(
  "post.events",
  "post.created",
  Buffer.from(
    JSON.stringify({
      postId: newPost.id,
      authorId: newPost.author_id,
      followerIds: [1, 2, 3], // Get from user-service
    })
  )
);
```

### 2. Engagement Updates

When likes/comments change:

```javascript
// In post-service or engagement handler
await channel.publish(
  "engagement.events",
  "post.liked", // or 'post.unliked', 'comment.created', 'comment.deleted'
  Buffer.from(
    JSON.stringify({
      postId: post.id,
      likes: post.like_count,
      comments: post.comment_count,
      createdAt: post.created_at,
    })
  )
);
```

### 3. Frontend Integration

**Load Feed:**

```javascript
const response = await fetch("/api/feed?userId=123&page=1&limit=10");
const { data, pagination } = await response.json();
```

**Mark as Viewed (on scroll):**

```javascript
const visibleFeedIds = [1, 2, 3]; // IDs of visible items
await fetch("/api/feed/view", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ feedItemIds: visibleFeedIds }),
});
```

## Performance Considerations

- **Indexes**: Optimized for user feed retrieval and cleanup queries
- **Batch Operations**: Bulk insert for fan-out, bulk update for scores
- **Connection Pooling**: PostgreSQL connection pool (max 20 connections)
- **Message Prefetch**: RabbitMQ prefetch set to 1 for even distribution

## Cleanup Strategy

- Runs every 12 hours (configurable)
- Deletes records where:
  - `viewed_at IS NOT NULL`
  - `created_at < NOW() - INTERVAL '10 days'`
- Keeps unviewed items indefinitely for discovery

## Monitoring

- Winston logger for structured logging
- Health check endpoint for uptime monitoring
- RabbitMQ automatic reconnection on connection loss

## Future Enhancements

- [ ] Redis caching for hot feeds
- [ ] Machine learning-based personalization
- [ ] A/B testing for scoring algorithms
- [ ] Feed diversity algorithms
- [ ] Real-time feed updates via WebSocket

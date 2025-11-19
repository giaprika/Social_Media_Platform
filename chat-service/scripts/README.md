# Test Scripts

Scripts để test Chat Service API endpoints.

## Prerequisites

- Server đang chạy tại `http://localhost:8080`
- Database đã được migrate
- Redis đang chạy

## Scripts

### 1. Full E2E Test - Chat Flow

Test đầy đủ kịch bản 2 user nhắn tin cho nhau.

**Windows (PowerShell):**
```powershell
.\scripts\test_chat_flow.ps1
```

**Linux/Mac (Bash):**
```bash
chmod +x scripts/test_chat_flow.sh
./scripts/test_chat_flow.sh
```

**Test Cases:**
1. ✅ User A gửi tin nhắn đầu tiên
2. ✅ User B reply
3. ✅ User A gửi tin nhắn tiếp theo
4. ✅ User B reply lại
5. ✅ User A lấy danh sách messages
6. ✅ User B lấy danh sách messages
7. ✅ User A lấy danh sách conversations
8. ✅ User B lấy danh sách conversations
9. ✅ User B đánh dấu đã đọc
10. ✅ Test idempotency (gửi lại message với cùng key)
11. ✅ Test pagination (limit=2)

### 2. Quick Test

Test nhanh gửi 1 message để verify server hoạt động.

**Windows (PowerShell):**
```powershell
.\scripts\quick_test.ps1
```

## Endpoints Tested

### POST /v1/messages
Gửi tin nhắn mới.

**Headers:**
- `x-user-id`: User ID của người gửi
- `Content-Type`: application/json

**Body:**
```json
{
  "conversation_id": "conv-123",
  "content": "Hello!",
  "idempotency_key": "unique-key-123"
}
```

**Response:**
```json
{
  "message_id": "msg-uuid",
  "status": "SENT"
}
```

### GET /v1/conversations/{conversation_id}/messages
Lấy danh sách messages trong conversation.

**Headers:**
- `x-user-id`: User ID

**Query Params:**
- `limit`: Số lượng messages (default: 50, max: 100)
- `before_timestamp`: RFC3339 timestamp cho pagination

**Response:**
```json
{
  "messages": [
    {
      "id": "msg-uuid",
      "conversation_id": "conv-123",
      "sender_id": "user-123",
      "content": "Hello!",
      "created_at": "2024-01-01T00:00:00Z"
    }
  ],
  "next_cursor": "2024-01-01T00:00:00Z"
}
```

### GET /v1/conversations
Lấy danh sách conversations của user.

**Headers:**
- `x-user-id`: User ID

**Query Params:**
- `limit`: Số lượng conversations (default: 20)
- `cursor`: Timestamp cursor cho pagination

**Response:**
```json
{
  "conversations": [
    {
      "id": "conv-123",
      "last_message_content": "Hello!",
      "last_message_at": "2024-01-01T00:00:00Z",
      "unread_count": 5
    }
  ],
  "next_cursor": "2024-01-01T00:00:00Z"
}
```

### POST /v1/conversations/{conversation_id}/read
Đánh dấu conversation đã đọc.

**Headers:**
- `x-user-id`: User ID
- `Content-Type`: application/json

**Body:**
```json
{}
```

**Response:**
```json
{
  "success": true
}
```

## Manual Testing với curl

### Gửi message:
```bash
curl -X POST http://localhost:8080/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-user-id: user-alice" \
  -d '{
    "conversation_id": "conv-123",
    "content": "Hello!",
    "idempotency_key": "key-1"
  }'
```

### Lấy messages:
```bash
curl -X GET "http://localhost:8080/v1/conversations/conv-123/messages?limit=10" \
  -H "x-user-id: user-alice"
```

### Lấy conversations:
```bash
curl -X GET "http://localhost:8080/v1/conversations?limit=10" \
  -H "x-user-id: user-alice"
```

### Đánh dấu đã đọc:
```bash
curl -X POST http://localhost:8080/v1/conversations/conv-123/read \
  -H "Content-Type: application/json" \
  -H "x-user-id: user-alice" \
  -d '{}'
```

## Troubleshooting

### Error: "user_id not found in context"
- Đảm bảo header `x-user-id` được gửi kèm
- Check server logs để verify middleware hoạt động
- Restart server sau khi thay đổi code

### Error: Connection refused
- Đảm bảo server đang chạy: `go run ./cmd/server`
- Check port 8080 không bị chiếm bởi process khác

### Error: Database connection failed
- Đảm bảo PostgreSQL đang chạy
- Check connection string trong `.env`
- Verify database đã được tạo và migrate

### Error: Redis connection failed
- Đảm bảo Redis đang chạy
- Check Redis address trong `.env`

## Verify Data

Sau khi chạy test, bạn có thể verify data trong database:

```sql
-- Xem tất cả messages
SELECT * FROM messages ORDER BY created_at DESC LIMIT 10;

-- Xem conversations
SELECT * FROM conversations ORDER BY last_message_at DESC LIMIT 10;

-- Xem conversation_participants
SELECT * FROM conversation_participants;

-- Xem unread counts
SELECT * FROM conversation_unread_counts;
```

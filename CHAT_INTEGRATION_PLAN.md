# Chat Service Integration Plan

## 📋 Tổng Quan

### Chat Service Architecture

Chat service là một Go microservice với:

- **gRPC Server**: Port `50051` - Dành cho internal service-to-service communication
- **HTTP Gateway**: Port `8080` - REST API via grpc-gateway (dành cho frontend/API Gateway)
- **Database**: PostgreSQL
- **Cache**: Redis (idempotency checking)
- **Auth**: JWT-based, expects `x-user-id` header từ API Gateway

### Current System Architecture

```
Frontend (React) → Backend Gateway (Express) → Microservices
                                             ├── user-service
                                             ├── community-service
                                             ├── notification-service
                                             └── post-service (disabled)
```

### Target Architecture

```
Frontend (React) → Backend Gateway (Express) → Microservices
                          │                  ├── user-service
                          │                  ├── community-service
                          │                  ├── notification-service
                          │                  └── post-service
                          │
                          └──────────────────→ Chat Service (Remote)
                                               (HTTP :8080)
```

---

## 🔐 Authentication Flow

Chat service authentication được thiết kế để hoạt động với API Gateway:

1. **Frontend** gửi JWT token trong `Authorization: Bearer <token>` header
2. **Backend Gateway** validates JWT và extract `user.id`
3. **Backend Gateway** forward request đến chat-service với `x-user-id: <userId>` header
4. **Chat Service** nhận `x-user-id` header và inject vào context

**Quan trọng**: Chat service KHÔNG tự validate JWT token, nó trust `x-user-id` header từ API Gateway.

---

## 📡 API Endpoints

### Chat Service HTTP API (Port 8080)

| Method | Endpoint                                       | Description                  | Request Body                                                               |
| ------ | ---------------------------------------------- | ---------------------------- | -------------------------------------------------------------------------- |
| `POST` | `/v1/messages`                                 | Send a message               | `{ "recipient_id": "uuid", "content": "text", "idempotency_key": "uuid" }` |
| `GET`  | `/v1/conversations/{conversation_id}/messages` | Get messages in conversation | Query: `cursor`, `limit`                                                   |
| `GET`  | `/v1/conversations`                            | List all conversations       | Query: `cursor`, `limit`                                                   |
| `POST` | `/v1/conversations/{conversation_id}/read`     | Mark conversation as read    | -                                                                          |

### Request Headers (Required)

```
x-user-id: <userId>           # User ID (set by API Gateway)
Content-Type: application/json
```

### Response Format

**Success Response:**

```json
{
	"message": {
		"id": "uuid",
		"conversation_id": "uuid",
		"sender_id": "uuid",
		"content": "Hello!",
		"created_at": "2024-01-01T00:00:00Z"
	}
}
```

**Error Response:**

```json
{
	"error": {
		"code": "INVALID_ARGUMENT",
		"message": "recipient_id is required"
	}
}
```

---

## 📝 Implementation Tasks

### Phase 1: Backend Gateway Configuration

#### Task 1.1: Add Chat Service Config

**File**: `backend-gateway/src/config/index.js`

```javascript
services: {
  // ... existing services ...

  chat: {
    target: process.env.CHAT_SERVICE_URL || "http://localhost:8080",
    pathRewrite: {
      "^/api/service/chat": "",  // /api/service/chat/v1/messages → /v1/messages
    },
    excludeList: [],
    timeout: 10000,
  },
}
```

#### Task 1.2: Add Environment Variable

**File**: `backend-gateway/.env`

```env
CHAT_SERVICE_URL=http://<REMOTE_CHAT_HOST>:8080
```

#### Task 1.3: Ensure x-user-id Header Forwarding

**File**: `backend-gateway/src/core/proxyFactory.js`

Proxy factory đã có logic forward `x-user-id`:

```javascript
if (req.user) {
	proxyReq.setHeader('x-user-id', req.user.id)
}
```

✅ Đã sẵn sàng - không cần thay đổi.

---

### Phase 2: Frontend API Client

#### Task 2.1: Create Chat API Module

**File**: `frontend/src/api/chat.js`

```javascript
import api from './index'
import { v4 as uuidv4 } from 'uuid'

/**
 * Send a message to a user
 * @param {string} recipientId - Target user ID
 * @param {string} content - Message content
 * @returns {Promise<{message: Object}>}
 */
export const sendMessage = async (recipientId, content) => {
	const response = await api.post('/service/chat/v1/messages', {
		recipient_id: recipientId,
		content: content,
		idempotency_key: uuidv4(), // Prevent duplicate messages
	})
	return response.data
}

/**
 * Get messages for a conversation
 * @param {string} conversationId - Conversation ID
 * @param {Object} options - Pagination options
 * @param {string} [options.cursor] - Pagination cursor
 * @param {number} [options.limit=50] - Number of messages
 * @returns {Promise<{messages: Array, next_cursor: string}>}
 */
export const getMessages = async (
	conversationId,
	{ cursor, limit = 50 } = {}
) => {
	const params = new URLSearchParams()
	if (cursor) params.append('cursor', cursor)
	if (limit) params.append('limit', limit.toString())

	const response = await api.get(
		`/service/chat/v1/conversations/${conversationId}/messages?${params}`
	)
	return response.data
}

/**
 * Get all conversations for current user
 * @param {Object} options - Pagination options
 * @returns {Promise<{conversations: Array, next_cursor: string}>}
 */
export const getConversations = async ({ cursor, limit = 20 } = {}) => {
	const params = new URLSearchParams()
	if (cursor) params.append('cursor', cursor)
	if (limit) params.append('limit', limit.toString())

	const response = await api.get(`/service/chat/v1/conversations?${params}`)
	return response.data
}

/**
 * Mark conversation as read
 * @param {string} conversationId - Conversation ID
 * @returns {Promise<void>}
 */
export const markAsRead = async (conversationId) => {
	await api.post(`/service/chat/v1/conversations/${conversationId}/read`)
}

/**
 * Start a new conversation with a user (send first message)
 * @param {string} userId - Target user ID
 * @param {string} message - Initial message
 * @returns {Promise<{message: Object}>}
 */
export const startConversation = async (userId, message) => {
	return sendMessage(userId, message)
}
```

#### Task 2.2: Install UUID Package (nếu chưa có)

```bash
cd frontend
npm install uuid
```

---

### Phase 3: Frontend Components

#### Task 3.1: Update ChatPanel Component

**File**: `frontend/src/components/layout/ChatPanel.jsx`

Cần update để:

1. Load conversations từ API khi mount
2. Load messages khi select conversation
3. Send message qua API
4. Implement infinite scroll cho messages

#### Task 3.2: Create Chat Context (Optional)

**File**: `frontend/src/contexts/ChatContext.jsx`

```javascript
import { createContext, useContext, useState, useCallback } from 'react'
import * as chatApi from '../api/chat'

const ChatContext = createContext(null)

export const ChatProvider = ({ children }) => {
	const [conversations, setConversations] = useState([])
	const [activeConversation, setActiveConversation] = useState(null)
	const [messages, setMessages] = useState([])
	const [unreadCount, setUnreadCount] = useState(0)

	const loadConversations = useCallback(async () => {
		const response = await chatApi.getConversations()
		setConversations(response.conversations || [])
	}, [])

	const loadMessages = useCallback(async (conversationId) => {
		const response = await chatApi.getMessages(conversationId)
		setMessages(response.messages || [])
	}, [])

	const sendMessage = useCallback(
		async (recipientId, content) => {
			const response = await chatApi.sendMessage(recipientId, content)
			// Add new message to state
			setMessages((prev) => [...prev, response.message])
			// Refresh conversations to update last_message
			loadConversations()
			return response
		},
		[loadConversations]
	)

	const markAsRead = useCallback(
		async (conversationId) => {
			await chatApi.markAsRead(conversationId)
			loadConversations() // Refresh to update unread counts
		},
		[loadConversations]
	)

	return (
		<ChatContext.Provider
			value={{
				conversations,
				activeConversation,
				messages,
				unreadCount,
				setActiveConversation,
				loadConversations,
				loadMessages,
				sendMessage,
				markAsRead,
			}}
		>
			{children}
		</ChatContext.Provider>
	)
}

export const useChat = () => {
	const context = useContext(ChatContext)
	if (!context) {
		throw new Error('useChat must be used within ChatProvider')
	}
	return context
}
```

---

### Phase 4: Real-time Updates (Future Enhancement)

Chat service hiện tại KHÔNG có WebSocket. Có 2 options:

#### Option A: Polling (Simple)

- Poll `/v1/conversations` mỗi 10-30 giây
- Poll messages của active conversation mỗi 5 giây
- Pros: Simple, works with current architecture
- Cons: Not truly real-time, increased server load

#### Option B: WebSocket Gateway (Recommended)

- Add WebSocket support to backend-gateway
- Chat service publish events to RabbitMQ (outbox table exists)
- Gateway subscribe to RabbitMQ and push to clients via WebSocket
- Pros: True real-time, scalable
- Cons: Requires additional development

**Recommendation**: Start with Option A (polling), implement Option B later.

---

## 🗄️ Database Schema Reference

### conversations

| Column               | Type      | Description          |
| -------------------- | --------- | -------------------- |
| id                   | UUID      | Primary key          |
| last_message_content | TEXT      | Last message preview |
| last_message_at      | TIMESTAMP | Last activity time   |
| created_at           | TIMESTAMP | Creation time        |

### messages

| Column          | Type      | Description         |
| --------------- | --------- | ------------------- |
| id              | UUID      | Primary key         |
| conversation_id | UUID      | FK to conversations |
| sender_id       | UUID      | Message sender      |
| content         | TEXT      | Message content     |
| created_at      | TIMESTAMP | Send time           |

### conversation_participants

| Column          | Type      | Description         |
| --------------- | --------- | ------------------- |
| conversation_id | UUID      | FK to conversations |
| user_id         | UUID      | Participant user ID |
| last_read_at    | TIMESTAMP | Last read timestamp |

---

## 🔍 Testing Plan

### 1. Backend Gateway Test

```bash
# Test proxy to chat service
curl -X GET "http://localhost:3000/api/service/chat/v1/conversations" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json"
```

### 2. Send Message Test

```bash
curl -X POST "http://localhost:3000/api/service/chat/v1/messages" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "recipient_id": "user-uuid-here",
    "content": "Hello!",
    "idempotency_key": "unique-key-123"
  }'
```

### 3. Frontend Integration Test

1. Login as User A
2. Go to User B's profile
3. Click Chat button
4. Send a message
5. Verify message appears
6. Login as User B
7. Verify conversation appears in chat list
8. Verify message is received

---

## 📋 Implementation Checklist

### Backend Gateway

- [ ] Add `CHAT_SERVICE_URL` to `.env`
- [ ] Add chat service config to `config/index.js`
- [ ] Test proxy connection to remote chat service
- [ ] Verify `x-user-id` header is forwarded correctly

### Frontend API

- [ ] Create `src/api/chat.js` module
- [ ] Install `uuid` package
- [ ] Test API functions

### Frontend UI

- [ ] Update ChatPanel to use real API
- [ ] Implement conversation list loading
- [ ] Implement message list with pagination
- [ ] Implement send message functionality
- [ ] Add error handling and loading states
- [ ] Implement polling for new messages (temporary)

### Testing

- [ ] Test send message flow
- [ ] Test receive message flow
- [ ] Test conversation list
- [ ] Test mark as read
- [ ] Test error scenarios

---

## ⚠️ Important Notes

1. **User ID Format**: Chat service expects UUID format for user IDs. Ensure user-service generates UUIDs or convert IDs appropriately.

2. **CORS**: If chat-service is on different domain, ensure CORS is configured. Since requests go through backend-gateway, this shouldn't be an issue.

3. **Idempotency**: Always send unique `idempotency_key` with each message to prevent duplicates on retry.

4. **Error Handling**: Chat service returns gRPC-style errors. Handle appropriately in frontend.

5. **Remote Host**: Replace `<REMOTE_CHAT_HOST>` with actual IP/hostname of chat service.

---

## 🚀 Quick Start (After Implementation)

1. Set environment variable:

   ```bash
   CHAT_SERVICE_URL=http://192.168.1.100:8080
   ```

2. Restart backend-gateway

3. Test connection:

   ```bash
   curl http://localhost:3000/api/service/chat/v1/conversations \
     -H "Authorization: Bearer <your-token>"
   ```

4. Should return `{"conversations": [], "next_cursor": ""}` if empty.

---

**Author**: GitHub Copilot  
**Date**: ${new Date().toISOString().split('T')[0]}  
**Version**: 1.0

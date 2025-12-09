# 🔔💬 Notification & Chat Service Integration Plan

## 📋 Tổng Quan Hệ Thống

### Current Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Frontend (React)                                │
│                                   :3000                                      │
└─────────────────────────────┬───────────────────────────────────────────────┘
                              │
                              │ HTTP + WebSocket (Socket.IO)
                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Backend Gateway (Express)                            │
│                              :8000                                           │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ • JWT Authentication                                                     ││
│  │ • Proxy to microservices via http-proxy-middleware                      ││
│  │ • Socket.IO server (realtime notifications)                             ││
│  │ • x-user-id header injection                                            ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────┬───────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┬─────────────────────┐
        │                     │                     │                     │
        ▼                     ▼                     ▼                     ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│ user-service  │   │ notification  │   │  community    │   │ chat-service  │
│    :8001      │   │   service     │   │   service     │   │    :8080      │
│  (Express)    │   │    :8002      │   │    :8003      │   │     (Go)      │
│               │   │  (Express)    │   │  (Express)    │   │   [REMOTE]    │
└───────────────┘   └───────────────┘   └───────────────┘   └───────────────┘
        │                   │                   │                     │
        ▼                   ▼                   ▼                     ▼
   PostgreSQL          PostgreSQL          PostgreSQL         PostgreSQL
   (users,             (notifications)     (communities)      + Redis
   relationships)           │
                            │
                            ▼
                    ┌───────────────┐
                    │ Realtime Push │
                    │ via Gateway   │
                    │ Socket.IO     │
                    └───────────────┘
```

---

## 🔔 PART 1: NOTIFICATION SERVICE

### 1.1 Service Overview

| Attribute    | Value                                       |
| ------------ | ------------------------------------------- |
| **Port**     | 8002                                        |
| **Tech**     | Express.js, PostgreSQL                      |
| **Auth**     | `x-user-id` header from Gateway             |
| **Realtime** | Emit via Gateway's internal API → Socket.IO |

### 1.2 Database Schema (Updated)

```sql
CREATE TABLE notifications (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL,                    -- Người nhận thông báo

    -- Notification type & reference
    type            VARCHAR(50) NOT NULL,             -- Loại thông báo
    reference_id    UUID,                             -- ID của entity liên quan (post_id, comment_id, etc.)
    reference_type  VARCHAR(50),                      -- Loại entity (post, comment, community, user)

    -- Display content
    title_template  VARCHAR(200) NOT NULL,
    body_template   TEXT NOT NULL,

    -- Aggregation data (for grouping multiple actors)
    actor_ids       UUID[] DEFAULT '{}',              -- Danh sách user_ids đã thực hiện action
    actor_count     INTEGER DEFAULT 1,                -- Số lượng actors
    last_actor_id   UUID,                             -- Actor gần nhất
    last_actor_name VARCHAR(100),                     -- Username của actor gần nhất

    -- Status
    is_readed       BOOLEAN NOT NULL DEFAULT FALSE,
    link_url        VARCHAR(500),

    -- Timestamps
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for finding existing notifications to update
CREATE INDEX idx_notifications_reference ON notifications(user_id, type, reference_id);
CREATE INDEX idx_notifications_user_unread ON notifications(user_id, is_readed);
```

### 1.3 Notification Types

| Type                | Trigger                   | Template Example                                           | Aggregation                  |
| ------------------- | ------------------------- | ---------------------------------------------------------- | ---------------------------- |
| `new_follower`      | User A follows User B     | "**u/johndoe** đã theo dõi bạn"                            | ❌ No (1 notif per follower) |
| `community_welcome` | User joins community      | "Chào mừng bạn đến với **c/programming**!"                 | ❌ No                        |
| `post_comment`      | Comment on user's post    | "**u/jane** và 5 người khác đã bình luận bài viết của bạn" | ✅ Yes (per post)            |
| `comment_reply`     | Reply to user's comment   | "**u/mike** và 2 người khác đã trả lời bình luận của bạn"  | ✅ Yes (per comment)         |
| `post_like`         | Like on user's post       | "**u/alex** và 10 người khác đã thích bài viết của bạn"    | ✅ Yes (per post)            |
| `comment_like`      | Like on user's comment    | "**u/sarah** và 3 người khác đã thích bình luận của bạn"   | ✅ Yes (per comment)         |
| `mention`           | @username in post/comment | "**u/david** đã nhắc đến bạn trong một bình luận"          | ❌ No                        |

### 1.4 Aggregation Logic

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        NOTIFICATION AGGREGATION FLOW                         │
└─────────────────────────────────────────────────────────────────────────────┘

When new action occurs (e.g., User B comments on User A's post):

1. Check existing notification:
   SELECT * FROM notifications
   WHERE user_id = A
     AND type = 'post_comment'
     AND reference_id = post_id

2. If EXISTS → UPDATE (aggregate):
   UPDATE notifications SET
     actor_ids = array_append(actor_ids, B),
     actor_count = actor_count + 1,
     last_actor_id = B,
     last_actor_name = 'username_b',
     body_template = 'u/username_b và X người khác đã bình luận...',
     is_readed = FALSE,  -- ← Reset to unread!
     updated_at = NOW()
   WHERE id = existing_id

3. If NOT EXISTS → INSERT new:
   INSERT INTO notifications (
     user_id, type, reference_id, reference_type,
     actor_ids, actor_count, last_actor_id, last_actor_name,
     title_template, body_template, ...
   ) VALUES (...)

4. Emit realtime notification via Socket.IO
```

### 1.5 Body Template Examples

```javascript
// post_comment - single actor
'u/johndoe đã bình luận bài viết của bạn'

// post_comment - multiple actors
'u/johndoe và 5 người khác đã bình luận bài viết của bạn'

// post_like - single actor
'u/jane thích bài viết của bạn'

// post_like - multiple actors
'u/jane và 99 người khác đã thích bài viết của bạn'

// comment_reply - single actor
'u/mike đã trả lời bình luận của bạn'

// comment_reply - multiple actors
'u/mike và 2 người khác đã trả lời bình luận của bạn'

// mention
'u/david đã nhắc đến bạn trong một bình luận'

// new_follower
'u/alex đã theo dõi bạn'

// community_welcome
'Chào mừng bạn đến với c/programming!'
```

### 1.6 API Endpoints

| Method   | Endpoint                  | Description                | Auth           |
| -------- | ------------------------- | -------------------------- | -------------- |
| `GET`    | `/notifications`          | Get user's notifications   | ✅ `x-user-id` |
| `POST`   | `/notifications`          | Create/Update notification | ❌ Internal    |
| `PATCH`  | `/notifications/:id/read` | Mark as read               | ❌             |
| `DELETE` | `/notifications/:id`      | Delete notification        | ❌             |

### 1.7 Realtime Notification Flow

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│ Any Service     │───▶│ notification-   │───▶│ backend-gateway │
│ (create notif)  │    │ service         │    │ POST /internal/ │
│                 │    │ POST /notifs    │    │ emit-notification│
└─────────────────┘    └─────────────────┘    └────────┬────────┘
                                                       │
                                                       ▼
                                              ┌─────────────────┐
                                              │   Socket.IO     │
                                              │ emit('notification')│
                                              │ to user_${userId}│
                                              └────────┬────────┘
                                                       │
                                                       ▼
                                              ┌─────────────────┐
                                              │   Frontend      │
                                              │ useNotifications│
                                              │     hook        │
                                              └─────────────────┘
```

### 1.8 Current Frontend Status

| Component              | Status     | Location                                         | Notes                             |
| ---------------------- | ---------- | ------------------------------------------------ | --------------------------------- |
| `useNotifications`     | ✅ Exists  | `src/hooks/useNotifications.js`                  | Has Socket.IO, but no API loading |
| `NotificationDropdown` | ✅ Exists  | `src/components/layout/NotificationDropdown.jsx` | UI complete                       |
| Notification API       | ❌ Missing | -                                                | Need `src/api/notification.js`    |
| Header Integration     | ⚠️ Partial | `Header.jsx` line 250                            | Uses empty array `[]`             |

---

## 💬 PART 2: CHAT SERVICE

### 2.1 Service Overview

| Attribute    | Value                                                |
| ------------ | ---------------------------------------------------- |
| **Port**     | HTTP `8080`, gRPC `50051`                            |
| **Tech**     | Go 1.25+, gRPC-Gateway, PostgreSQL, Redis            |
| **Auth**     | `x-user-id` header from Gateway                      |
| **Location** | **REMOTE** (hosted on another machine)               |
| **Realtime** | ❌ No WebSocket (need polling or future enhancement) |

### 2.2 Database Schema

```sql
-- conversations
CREATE TABLE conversations (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    last_message_content  TEXT,
    last_message_at       TIMESTAMPTZ,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- messages
CREATE TABLE messages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id),
    sender_id       UUID NOT NULL,
    content         TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- conversation_participants
CREATE TABLE conversation_participants (
    conversation_id UUID NOT NULL REFERENCES conversations(id),
    user_id         UUID NOT NULL,
    last_read_at    TIMESTAMPTZ,
    PRIMARY KEY (conversation_id, user_id)
);
```

### 2.3 API Endpoints

| Method | Endpoint                          | Description        | Request Body                                 |
| ------ | --------------------------------- | ------------------ | -------------------------------------------- |
| `POST` | `/v1/messages`                    | Send message       | `{ recipient_id, content, idempotency_key }` |
| `GET`  | `/v1/conversations/{id}/messages` | Get messages       | Query: `cursor`, `limit`                     |
| `GET`  | `/v1/conversations`               | List conversations | Query: `cursor`, `limit`                     |
| `POST` | `/v1/conversations/{id}/read`     | Mark as read       | -                                            |

### 2.4 Current Frontend Status

| Component      | Status     | Location                              | Notes                          |
| -------------- | ---------- | ------------------------------------- | ------------------------------ |
| `ChatPanel`    | ✅ Exists  | `src/components/layout/ChatPanel.jsx` | UI complete, uses mock data    |
| Chat button    | ✅ Exists  | `ProfileHeader.jsx`                   | Opens ChatPanel                |
| Chat API       | ❌ Missing | -                                     | Need `src/api/chat.js`         |
| Gateway config | ❌ Missing | -                                     | Need to add chat service proxy |

---

## 📝 IMPLEMENTATION TASKS

---

## 🔔 PHASE 1: NOTIFICATION BACKEND

### Task 1.0: Update Database Schema

**File**: `notification-service/init.sql`

```sql
DROP TABLE IF EXISTS notifications;

CREATE TABLE notifications (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL,

    -- Notification type & reference
    type            VARCHAR(50) NOT NULL,
    reference_id    UUID,
    reference_type  VARCHAR(50),

    -- Display content
    title_template  VARCHAR(200) NOT NULL,
    body_template   TEXT NOT NULL,

    -- Aggregation data
    actor_ids       UUID[] DEFAULT '{}',
    actor_count     INTEGER DEFAULT 1,
    last_actor_id   UUID,
    last_actor_name VARCHAR(100),

    -- Status
    is_readed       BOOLEAN NOT NULL DEFAULT FALSE,
    link_url        VARCHAR(500),

    -- Timestamps
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_reference ON notifications(user_id, type, reference_id);
CREATE INDEX idx_notifications_user_unread ON notifications(user_id, is_readed) WHERE is_readed = FALSE;
```

### Task 1.1: Update Notification Service API

**File**: `notification-service/src/services/notification.service.js`

```javascript
// New method for aggregated notifications
static async createOrUpdateNotification(data) {
  const {
    user_id,           // Người nhận
    type,              // 'post_comment', 'post_like', etc.
    reference_id,      // post_id, comment_id, etc.
    reference_type,    // 'post', 'comment', etc.
    actor_id,          // Người thực hiện action
    actor_name,        // Username của actor
    title_template,
    link_url,
  } = data;

  // Check if aggregatable type
  const aggregatableTypes = ['post_comment', 'comment_reply', 'post_like', 'comment_like'];

  if (aggregatableTypes.includes(type)) {
    // Try to find existing notification
    const existing = await NotificationRepository.findByReference(user_id, type, reference_id);

    if (existing) {
      // Update existing (aggregate)
      return await NotificationRepository.aggregateNotification(existing.id, {
        actor_id,
        actor_name,
      });
    }
  }

  // Create new notification
  return await NotificationRepository.createNotification({
    user_id,
    type,
    reference_id,
    reference_type,
    actor_ids: [actor_id],
    actor_count: 1,
    last_actor_id: actor_id,
    last_actor_name: actor_name,
    title_template,
    body_template: generateBodyTemplate(type, actor_name, 1),
    link_url,
  });
}

function generateBodyTemplate(type, actorName, count) {
  const templates = {
    post_comment: count > 1
      ? `u/${actorName} và ${count - 1} người khác đã bình luận bài viết của bạn`
      : `u/${actorName} đã bình luận bài viết của bạn`,
    comment_reply: count > 1
      ? `u/${actorName} và ${count - 1} người khác đã trả lời bình luận của bạn`
      : `u/${actorName} đã trả lời bình luận của bạn`,
    post_like: count > 1
      ? `u/${actorName} và ${count - 1} người khác đã thích bài viết của bạn`
      : `u/${actorName} đã thích bài viết của bạn`,
    comment_like: count > 1
      ? `u/${actorName} và ${count - 1} người khác đã thích bình luận của bạn`
      : `u/${actorName} đã thích bình luận của bạn`,
    mention: `u/${actorName} đã nhắc đến bạn`,
    new_follower: `u/${actorName} đã theo dõi bạn`,
    community_welcome: `Chào mừng bạn đến với cộng đồng!`,
  };
  return templates[type] || `Bạn có thông báo mới`;
}
```

### Task 1.2: Update Notification Repository

**File**: `notification-service/src/repositories/notification.repository.js`

```javascript
static async findByReference(userId, type, referenceId) {
  const result = await db.query(
    `SELECT * FROM notifications
     WHERE user_id = $1 AND type = $2 AND reference_id = $3`,
    [userId, type, referenceId]
  );
  return result.rows[0];
}

static async aggregateNotification(notificationId, { actor_id, actor_name }) {
  const result = await db.query(
    `UPDATE notifications SET
       actor_ids = CASE
         WHEN $2 = ANY(actor_ids) THEN actor_ids
         ELSE array_append(actor_ids, $2)
       END,
       actor_count = CASE
         WHEN $2 = ANY(actor_ids) THEN actor_count
         ELSE actor_count + 1
       END,
       last_actor_id = $2,
       last_actor_name = $3,
       is_readed = FALSE,
       updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [notificationId, actor_id, actor_name]
  );

  // Update body_template based on new count
  const notification = result.rows[0];
  const bodyTemplate = generateBodyTemplate(
    notification.type,
    actor_name,
    notification.actor_count
  );

  await db.query(
    `UPDATE notifications SET body_template = $1 WHERE id = $2`,
    [bodyTemplate, notificationId]
  );

  return { ...notification, body_template: bodyTemplate };
}
```

### Task 1.3: Services That Need to Call Notification API

| Service               | Event                    | Notification Type   | Data Needed                                                      |
| --------------------- | ------------------------ | ------------------- | ---------------------------------------------------------------- |
| **user-service**      | User follows another     | `new_follower`      | follower_id, follower_name, target_user_id                       |
| **community-service** | User joins community     | `community_welcome` | user_id, community_name, community_id                            |
| **post-service**      | Comment on post          | `post_comment`      | commenter_id, commenter_name, post_id, post_owner_id             |
| **post-service**      | Reply to comment         | `comment_reply`     | replier_id, replier_name, comment_id, comment_owner_id           |
| **post-service**      | Like post                | `post_like`         | liker_id, liker_name, post_id, post_owner_id                     |
| **post-service**      | Like comment             | `comment_like`      | liker_id, liker_name, comment_id, comment_owner_id               |
| **post-service**      | @mention in post/comment | `mention`           | mentioner_id, mentioner_name, mentioned_user_id, post/comment_id |

### Task 1.4: Example - Add Follow Notification to User Service

**File**: `user-service/src/services/user.service.js`

```javascript
import axios from 'axios';

const NOTIFICATION_SERVICE_URL = process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:8002';

static async followUser(userId, targetId) {
  // Existing follow logic...
  const result = await UserRepository.followUser(userId, targetId);

  // Get follower info
  const follower = await UserRepository.findById(userId);

  // Create notification
  try {
    await axios.post(`${NOTIFICATION_SERVICE_URL}/notifications`, {
      user_ids: [targetId],
      type: 'new_follower',
      reference_id: userId,
      reference_type: 'user',
      actor_id: userId,
      actor_name: follower.username,
      title_template: 'Người theo dõi mới',
      body_template: `u/${follower.username} đã theo dõi bạn`,
      link_url: `/app/u/${follower.username}`,
    });
  } catch (error) {
    console.error('Failed to create follow notification:', error.message);
    // Don't fail the follow action if notification fails
  }

  return result;
}
```

---

## 🖥️ PHASE 2: NOTIFICATION FRONTEND

> **No remote URL needed** - notification-service runs locally!

#### Task 1.1: Create Notification API Module

**File**: `frontend/src/api/notification.js`

```javascript
import api from './axios'

/**
 * Get all notifications for current user
 * @returns {Promise<Array>}
 */
export const getNotifications = async () => {
	const response = await api.get('/api/service/notifications/notifications')
	return response.data
}

/**
 * Mark a notification as read
 * @param {string} notificationId
 * @returns {Promise<Object>}
 */
export const markAsRead = async (notificationId) => {
	const response = await api.patch(
		`/api/service/notifications/notifications/${notificationId}/read`
	)
	return response.data
}

/**
 * Delete a notification
 * @param {string} notificationId
 * @returns {Promise<void>}
 */
export const deleteNotification = async (notificationId) => {
	await api.delete(`/api/service/notifications/notifications/${notificationId}`)
}

/**
 * Mark all notifications as read
 * @param {string[]} notificationIds
 * @returns {Promise<void>}
 */
export const markAllAsRead = async (notificationIds) => {
	await Promise.all(notificationIds.map((id) => markAsRead(id)))
}
```

#### Task 1.2: Update useNotifications Hook

**File**: `frontend/src/hooks/useNotifications.js`

```javascript
import { useEffect, useState, useCallback } from 'react'
import { io } from 'socket.io-client'
import * as notificationApi from '../api/notification'

const GATEWAY_URL = process.env.REACT_APP_GATEWAY_URL || 'http://localhost:8000'

export const useNotifications = (token) => {
	const [notifications, setNotifications] = useState([])
	const [socket, setSocket] = useState(null)
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState(null)

	// Load initial notifications from API
	const loadNotifications = useCallback(async () => {
		if (!token) return

		try {
			setLoading(true)
			setError(null)
			const data = await notificationApi.getNotifications()

			// Transform API data to match component format
			const transformed = data.map((n) => ({
				id: n.id,
				title: n.title_template,
				message: n.body_template,
				content: n.body_template,
				read: n.is_readed,
				link: n.link_url,
				createdAt: n.created_at,
			}))

			setNotifications(transformed)
		} catch (err) {
			console.error('Failed to load notifications:', err)
			setError(err.message)
		} finally {
			setLoading(false)
		}
	}, [token])

	// Mark single notification as read
	const markAsRead = useCallback(async (notificationId) => {
		try {
			await notificationApi.markAsRead(notificationId)
			setNotifications((prev) =>
				prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n))
			)
		} catch (err) {
			console.error('Failed to mark as read:', err)
		}
	}, [])

	// Mark all as read
	const markAllAsRead = useCallback(async () => {
		const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id)
		if (unreadIds.length === 0) return

		try {
			await notificationApi.markAllAsRead(unreadIds)
			setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
		} catch (err) {
			console.error('Failed to mark all as read:', err)
		}
	}, [notifications])

	// Delete notification
	const deleteNotification = useCallback(async (notificationId) => {
		try {
			await notificationApi.deleteNotification(notificationId)
			setNotifications((prev) => prev.filter((n) => n.id !== notificationId))
		} catch (err) {
			console.error('Failed to delete notification:', err)
		}
	}, [])

	// Load on mount
	useEffect(() => {
		loadNotifications()
	}, [loadNotifications])

	// Socket connection for realtime updates
	useEffect(() => {
		if (!token) return

		const newSocket = io(GATEWAY_URL, {
			auth: { token },
			withCredentials: true,
		})

		newSocket.on('connect', () => {
			console.log('🔔 Notification socket connected:', newSocket.id)
		})

		newSocket.on('notification', (data) => {
			console.log('🔔 New notification received:', data)

			// Add new notification to top of list
			const newNotification = {
				id: data.id || `temp-${Date.now()}`,
				title: data.title,
				message: data.body,
				content: data.body,
				read: false,
				link: data.link,
				createdAt: data.createdAt || new Date().toISOString(),
			}

			setNotifications((prev) => [newNotification, ...prev])
		})

		newSocket.on('disconnect', () => {
			console.log('🔔 Notification socket disconnected')
		})

		newSocket.on('connect_error', (err) => {
			console.error('🔔 Socket connection error:', err.message)
		})

		setSocket(newSocket)

		return () => {
			newSocket.close()
		}
	}, [token])

	// Calculate unread count
	const unreadCount = notifications.filter((n) => !n.read).length

	return {
		notifications,
		socket,
		loading,
		error,
		unreadCount,
		markAsRead,
		markAllAsRead,
		deleteNotification,
		refresh: loadNotifications,
	}
}
```

#### Task 1.3: Update Header Component

**File**: `frontend/src/components/layout/Header.jsx`

Changes needed:

1. Import and use `useNotifications` hook
2. Get token from cookies
3. Pass real notifications to `NotificationDropdown`

```diff
// Add imports
+ import { useNotifications } from "src/hooks/useNotifications";
+ import Cookies from "universal-cookie";

// Inside Header component, before return:
+ const cookies = new Cookies();
+ const accessToken = cookies.get("accessToken");
+ const token = accessToken ? accessToken.replace("<Bearer> ", "") : null;
+ const {
+   notifications,
+   markAsRead: handleMarkAsRead,
+   markAllAsRead: handleMarkAllAsRead
+ } = useNotifications(token);

// Update NotificationDropdown:
  <NotificationDropdown
-   notifications={[]}
+   notifications={notifications}
    isOpen={isNotificationOpen}
    onClose={() => setIsNotificationOpen(false)}
    onToggle={() => setIsNotificationOpen((prev) => !prev)}
+   onMarkAsRead={handleMarkAsRead}
+   onMarkAllAsRead={handleMarkAllAsRead}
  />
```

#### Task 1.4: Update NotificationDropdown Component

**File**: `frontend/src/components/layout/NotificationDropdown.jsx`

Add handlers for mark as read:

```diff
- const NotificationDropdown = ({ notifications = [], isOpen, onClose, onToggle }) => {
+ const NotificationDropdown = ({
+   notifications = [],
+   isOpen,
+   onClose,
+   onToggle,
+   onMarkAsRead,
+   onMarkAllAsRead,
+ }) => {

// Update "Đánh dấu tất cả đã đọc" button:
  <button
    className="text-sm text-primary hover:underline"
+   onClick={onMarkAllAsRead}
  >
    Đánh dấu tất cả đã đọc
  </button>

// Update notification item click:
  <button
    onClick={() => {
-     // Handle notification click
+     if (!notification.read) {
+       onMarkAsRead?.(notification.id);
+     }
+     if (notification.link) {
+       window.location.href = notification.link;
+     }
      onClose();
    }}
  >
```

---

### Phase 2: Chat Service Integration

> ⚠️ **Requires remote chat service URL**

#### Task 2.1: Add Chat Service to Gateway Config

**File**: `backend-gateway/src/config/index.js`

```javascript
services: {
  // ... existing services ...

  chat: {
    target: process.env.CHAT_SERVICE_URL || "http://localhost:8080",
    pathRewrite: {
      "^/api/service/chat": "",  // /api/service/chat/v1/... → /v1/...
    },
    excludeList: [],
    timeout: 10000,
  },
}
```

#### Task 2.2: Add Environment Variable

**File**: `backend-gateway/.env`

```env
CHAT_SERVICE_URL=http://<REMOTE_IP>:8080
```

#### Task 2.3: Create Chat API Module

**File**: `frontend/src/api/chat.js`

```javascript
import api from './axios'
import { v4 as uuidv4 } from 'uuid'

/**
 * Send a message to a user
 */
export const sendMessage = async (recipientId, content) => {
	const response = await api.post('/api/service/chat/v1/messages', {
		recipient_id: recipientId,
		content: content,
		idempotency_key: uuidv4(),
	})
	return response.data
}

/**
 * Get messages for a conversation
 */
export const getMessages = async (
	conversationId,
	{ cursor, limit = 50 } = {}
) => {
	const params = new URLSearchParams()
	if (cursor) params.append('cursor', cursor)
	if (limit) params.append('limit', limit.toString())

	const response = await api.get(
		`/api/service/chat/v1/conversations/${conversationId}/messages?${params}`
	)
	return response.data
}

/**
 * Get all conversations for current user
 */
export const getConversations = async ({ cursor, limit = 20 } = {}) => {
	const params = new URLSearchParams()
	if (cursor) params.append('cursor', cursor)
	if (limit) params.append('limit', limit.toString())

	const response = await api.get(`/api/service/chat/v1/conversations?${params}`)
	return response.data
}

/**
 * Mark conversation as read
 */
export const markAsRead = async (conversationId) => {
	await api.post(`/api/service/chat/v1/conversations/${conversationId}/read`)
}

/**
 * Start a new conversation (send first message)
 */
export const startConversation = async (userId, message) => {
	return sendMessage(userId, message)
}
```

#### Task 2.4: Install UUID Package

```bash
cd frontend
npm install uuid
```

#### Task 2.5: Create useChat Hook

**File**: `frontend/src/hooks/useChat.js`

```javascript
import { useState, useCallback, useEffect, useRef } from 'react'
import * as chatApi from '../api/chat'

const POLL_INTERVAL = 10000 // 10 seconds

export const useChat = () => {
	const [conversations, setConversations] = useState([])
	const [activeConversation, setActiveConversation] = useState(null)
	const [messages, setMessages] = useState([])
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState(null)
	const pollRef = useRef(null)

	// Load conversations
	const loadConversations = useCallback(async () => {
		try {
			setLoading(true)
			const response = await chatApi.getConversations()
			setConversations(response.conversations || [])
		} catch (err) {
			console.error('Failed to load conversations:', err)
			setError(err.message)
		} finally {
			setLoading(false)
		}
	}, [])

	// Load messages for a conversation
	const loadMessages = useCallback(async (conversationId) => {
		try {
			setLoading(true)
			const response = await chatApi.getMessages(conversationId)
			setMessages(response.messages || [])
		} catch (err) {
			console.error('Failed to load messages:', err)
			setError(err.message)
		} finally {
			setLoading(false)
		}
	}, [])

	// Send a message
	const sendMessage = useCallback(
		async (recipientId, content) => {
			try {
				const response = await chatApi.sendMessage(recipientId, content)

				// Add message to local state
				if (response.message) {
					setMessages((prev) => [...prev, response.message])
				}

				// Refresh conversations to update last_message
				loadConversations()

				return response
			} catch (err) {
				console.error('Failed to send message:', err)
				throw err
			}
		},
		[loadConversations]
	)

	// Mark conversation as read
	const markAsRead = useCallback(
		async (conversationId) => {
			try {
				await chatApi.markAsRead(conversationId)
				loadConversations()
			} catch (err) {
				console.error('Failed to mark as read:', err)
			}
		},
		[loadConversations]
	)

	// Start polling when active conversation changes
	useEffect(() => {
		if (activeConversation) {
			loadMessages(activeConversation.id)

			// Poll for new messages
			pollRef.current = setInterval(() => {
				loadMessages(activeConversation.id)
			}, POLL_INTERVAL)
		}

		return () => {
			if (pollRef.current) {
				clearInterval(pollRef.current)
			}
		}
	}, [activeConversation, loadMessages])

	// Load conversations on mount
	useEffect(() => {
		loadConversations()
	}, [loadConversations])

	// Calculate unread count
	const unreadCount = conversations.reduce((count, conv) => {
		return count + (conv.unread_count || 0)
	}, 0)

	return {
		conversations,
		activeConversation,
		messages,
		loading,
		error,
		unreadCount,
		setActiveConversation,
		loadConversations,
		loadMessages,
		sendMessage,
		markAsRead,
	}
}
```

#### Task 2.6: Update ChatPanel Component

**File**: `frontend/src/components/layout/ChatPanel.jsx`

Replace mock data with real API integration using `useChat` hook.

---

## 📋 IMPLEMENTATION CHECKLIST

### 🔔 Phase 1: Notification Backend

- [ ] **1.0** Update `notification-service/init.sql` với schema mới
- [ ] **1.1** Update `notification-service/src/services/notification.service.js` với aggregation logic
- [ ] **1.2** Update `notification-service/src/repositories/notification.repository.js`
- [ ] **1.3** Add follow notification to `user-service`
- [ ] **1.4** Add community welcome notification to `community-service`
- [ ] **Test** Database migration

### 🖥️ Phase 2: Notification Frontend

- [ ] **2.1** Create `frontend/src/api/notification.js`
- [ ] **2.2** Update `frontend/src/hooks/useNotifications.js`
- [ ] **2.3** Update `frontend/src/components/layout/Header.jsx`
- [ ] **2.4** Update `frontend/src/components/layout/NotificationDropdown.jsx`
- [ ] **Test** Login and check notifications load
- [ ] **Test** Realtime notification via Socket.IO
- [ ] **Test** Mark as read functionality

### 📝 Phase 3: Post Service Notifications (Khi post-service sẵn sàng)

- [ ] **3.1** Add comment notification (`post_comment`)
- [ ] **3.2** Add reply notification (`comment_reply`)
- [ ] **3.3** Add post like notification (`post_like`)
- [ ] **3.4** Add comment like notification (`comment_like`)
- [ ] **3.5** Add mention notification (`mention`)
- [ ] **Test** Aggregation logic với multiple actors

### ⏳ Phase 4: Chat Service (Need Remote URL)

- [ ] **4.1** Get chat service URL from team
- [ ] **4.2** Add chat config to `backend-gateway/src/config/index.js`
- [ ] **4.3** Add `CHAT_SERVICE_URL` to `backend-gateway/.env`
- [ ] **4.4** Create `frontend/src/api/chat.js`
- [ ] **4.5** Install `uuid` package: `npm install uuid`
- [ ] **4.6** Create `frontend/src/hooks/useChat.js`
- [ ] **4.7** Update `ChatPanel.jsx` to use real API
- [ ] **Test** Send/receive messages
- [ ] **Test** Conversation list

---

## 📊 NOTIFICATION TYPES SUMMARY

| Type                | Trigger          | Aggregation    | Template                                                    |
| ------------------- | ---------------- | -------------- | ----------------------------------------------------------- |
| `new_follower`      | Follow user      | ❌             | `u/{actor} đã theo dõi bạn`                                 |
| `community_welcome` | Join community   | ❌             | `Chào mừng bạn đến với c/{community}!`                      |
| `post_comment`      | Comment on post  | ✅ Per post    | `u/{actor} [và X người khác] đã bình luận bài viết của bạn` |
| `comment_reply`     | Reply to comment | ✅ Per comment | `u/{actor} [và X người khác] đã trả lời bình luận của bạn`  |
| `post_like`         | Like post        | ✅ Per post    | `u/{actor} [và X người khác] đã thích bài viết của bạn`     |
| `comment_like`      | Like comment     | ✅ Per comment | `u/{actor} [và X người khác] đã thích bình luận của bạn`    |
| `mention`           | @username        | ❌             | `u/{actor} đã nhắc đến bạn trong {type}`                    |

### ❌ NOT Implemented (as requested)

- Message notifications (để sau khi có chat service)
- Unfollow notifications

---

## ⚠️ NOTES

### User ID Format

Both services use **UUID** format ✅

```
Example: fa0fe1b0-7b9b-4351-a5e0-5ba54ece726e
```

### Gateway Header Forwarding

Backend gateway already injects `x-user-id` header ✅

```javascript
// proxyFactory.js
if (req.user) {
	proxyReq.setHeader('x-user-id', req.user.id)
}
```

### Socket.IO Already Configured

Gateway has Socket.IO server with user rooms ✅

```javascript
// socketServer.js
socket.join(`user_${userId}`)
io.to(`user_${userId}`).emit('notification', payload)
```

---

## 🚀 QUICK START

### Start with Notifications (No remote URL needed):

```bash
# 1. Ensure services are running
docker compose up -d

# 2. Create the API file
# (see Task 1.1)

# 3. Update the hook
# (see Task 1.2)

# 4. Update Header
# (see Task 1.3)

# 5. Test!
# Login and check console for "🔔 Notification socket connected"
```

### Test Notification Flow:

```bash
# Create a test notification via curl
curl -X POST http://localhost:8002/notifications \
  -H "Content-Type: application/json" \
  -d '{
    "user_ids": ["<your-user-uuid>"],
    "title_template": "Test Notification",
    "body_template": "This is a test notification!",
    "link_url": "/app/home"
  }'
```

---

**Author**: GitHub Copilot  
**Date**: 2025-12-03  
**Version**: 2.0

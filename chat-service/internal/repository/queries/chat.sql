-- name: InsertMessage :one
INSERT INTO messages (conversation_id, sender_id, content, type, media_url, media_metadata)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: InsertTextMessage :one
INSERT INTO messages (conversation_id, sender_id, content, type)
VALUES ($1, $2, $3, 'TEXT')
RETURNING *;

-- name: InsertMediaMessage :one
INSERT INTO messages (conversation_id, sender_id, content, type, media_url, media_metadata)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: GetMessages :many
SELECT id, conversation_id, sender_id, content, created_at, type, media_url, media_metadata
FROM messages
WHERE conversation_id = sqlc.arg('conversation_id')
	AND (
		sqlc.narg('before')::timestamptz IS NULL
		OR created_at < sqlc.narg('before')::timestamptz
	)
ORDER BY created_at DESC
LIMIT sqlc.arg('limit');

-- name: UpsertConversation :one
INSERT INTO conversations (id)
VALUES ($1)
ON CONFLICT (id) DO UPDATE SET created_at = conversations.created_at
RETURNING *;

-- name: InsertOutbox :exec
INSERT INTO outbox (aggregate_type, aggregate_id, payload)
VALUES ($1, $2, $3);

-- name: GetUnprocessedOutbox :many
SELECT *
FROM outbox
WHERE processed_at IS NULL
ORDER BY created_at ASC
LIMIT $1;

-- name: GetAndLockUnprocessedOutbox :many
SELECT *
FROM outbox
WHERE processed_at IS NULL
ORDER BY created_at ASC
LIMIT $1
FOR UPDATE SKIP LOCKED;

-- name: GetConversationsForUser :many
SELECT 
    c.id,
    c.last_message_content,
    c.last_message_at,
    (
        SELECT COUNT(*) 
        FROM messages m 
        WHERE m.conversation_id = c.id 
          AND m.created_at > cp.last_read_at
    ) AS unread_count
FROM conversations c
JOIN conversation_participants cp ON c.id = cp.conversation_id
WHERE cp.user_id = $1
  AND ($2::timestamptz IS NULL OR c.last_message_at < $2::timestamptz)
ORDER BY c.last_message_at DESC
LIMIT $3;

-- name: UpdateConversationLastMessage :exec
UPDATE conversations
SET last_message_content = $2,
    last_message_at = $3
WHERE id = $1;

-- name: AddParticipant :exec
INSERT INTO conversation_participants (conversation_id, user_id, joined_at)
VALUES ($1, $2, NOW())
ON CONFLICT DO NOTHING;

-- name: AddConversationParticipants :exec
INSERT INTO conversation_participants (conversation_id, user_id, joined_at)
SELECT $1, unnest($2::uuid[]), NOW()
ON CONFLICT DO NOTHING;

-- name: MarkAsRead :exec
UPDATE conversation_participants
SET last_read_at = NOW()
WHERE conversation_id = $1
  AND user_id = $2;

-- name: GetConversationParticipants :many
SELECT user_id
FROM conversation_participants
WHERE conversation_id = $1;

-- name: MarkOutboxProcessed :exec
UPDATE outbox
SET processed_at = NOW()
WHERE id = $1;

-- name: IncrementOutboxRetry :exec
UPDATE outbox
SET retry_count = retry_count + 1,
    last_retry_at = NOW()
WHERE id = $1;

-- name: GetAndLockUnprocessedOutboxWithRetry :many
SELECT *
FROM outbox
WHERE processed_at IS NULL
  AND retry_count < $2
  AND (
    last_retry_at IS NULL 
    OR last_retry_at < NOW() - ($3::interval)
  )
ORDER BY created_at ASC
LIMIT $1
FOR UPDATE SKIP LOCKED;

-- name: MarkOutboxFailed :exec
UPDATE outbox
SET retry_count = retry_count + 1,
    last_retry_at = NOW()
WHERE id = $1;


-- Dead Letter Queue (DLQ) Operations

-- name: MoveOutboxToDLQ :exec
INSERT INTO outbox_dlq (original_event_id, aggregate_type, aggregate_id, payload, error_message, retry_count, original_created_at)
SELECT o.id, o.aggregate_type, o.aggregate_id, o.payload, $2, o.retry_count, o.created_at
FROM outbox o
WHERE o.id = $1;

-- name: DeleteOutboxEvent :exec
DELETE FROM outbox WHERE id = $1;

-- name: GetDLQEvents :many
SELECT *
FROM outbox_dlq
ORDER BY moved_to_dlq_at DESC
LIMIT $1;

-- name: GetDLQEventsByAggregateType :many
SELECT *
FROM outbox_dlq
WHERE aggregate_type = $1
ORDER BY moved_to_dlq_at DESC
LIMIT $2;

-- name: ReplayDLQEvent :exec
INSERT INTO outbox (aggregate_type, aggregate_id, payload)
SELECT d.aggregate_type, d.aggregate_id, d.payload
FROM outbox_dlq d
WHERE d.id = $1;

-- name: DeleteDLQEvent :exec
DELETE FROM outbox_dlq WHERE id = $1;

-- name: CountDLQEvents :one
SELECT COUNT(*) FROM outbox_dlq;

-- name: CountDLQEventsByAggregateType :one
SELECT COUNT(*) FROM outbox_dlq WHERE aggregate_type = $1;

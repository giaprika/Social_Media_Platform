-- name: InsertMessage :one
INSERT INTO messages (conversation_id, sender_id, content)
VALUES ($1, $2, $3)
RETURNING *;

-- name: GetMessages :many
SELECT *
FROM messages
WHERE conversation_id = sqlc.arg('conversation_id')
	AND (
		sqlc.narg('before') IS NULL
		OR created_at < sqlc.narg('before')
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

-- name: MarkAsRead :exec
UPDATE conversation_participants
SET last_read_at = NOW()
WHERE conversation_id = $1
  AND user_id = $2;

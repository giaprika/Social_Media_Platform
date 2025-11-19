-- name: InsertMessage :one
INSERT INTO messages (conversation_id, sender_id, content)
VALUES ($1, $2, $3)
RETURNING *;

-- name: GetMessages :many
SELECT *
FROM messages
WHERE conversation_id = $1
	AND ($2 IS NULL OR created_at < $2)
ORDER BY created_at DESC
LIMIT $3;

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
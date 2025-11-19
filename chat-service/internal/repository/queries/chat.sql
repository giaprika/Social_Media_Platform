-- name: CreateMessage :one
INSERT INTO messages (conversation_id, sender_id, content)
VALUES ($1, $2, $3)
RETURNING *;

-- name: CreateOutbox :exec
INSERT INTO outbox (aggregate_type, aggregate_id, payload)
VALUES ($1, $2, $3);
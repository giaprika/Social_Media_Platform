#!/bin/bash
# Clear idempotency key from Redis

KEY="$1"

if [ -z "$KEY" ]; then
    echo "Usage: ./clear-redis-key.sh <idempotency_key>"
    echo "Example: ./clear-redis-key.sh unique-key-001"
    exit 1
fi

REDIS_KEY="idempotency:${KEY}"

echo "Deleting Redis key: $REDIS_KEY"
docker exec chat_redis redis-cli DEL "$REDIS_KEY"
echo "Done!"


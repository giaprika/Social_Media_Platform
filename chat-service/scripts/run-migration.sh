#!/bin/bash

# Script to run database migrations
# Usage: ./scripts/run-migration.sh [up|down|version]

set -e

# Load environment variables
if [ -f "app.env" ]; then
    export $(cat app.env | grep -v '^#' | xargs)
fi

# Build connection string
DB_URL="postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}?sslmode=${DB_SSLMODE}"

# Default action is 'up'
ACTION=${1:-up}

echo "Running migration: $ACTION"
echo "Database: ${DB_HOST}:${DB_PORT}/${DB_NAME}"

migrate -path migrations -database "$DB_URL" $ACTION

echo "Migration completed successfully!"

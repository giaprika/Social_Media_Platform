#!/bin/bash
set -e

# Chạy init script mặc định của PostgreSQL
/docker-entrypoint.sh postgres &

# Đợi PostgreSQL sẵn sàng
until pg_isready -U postgres; do
  echo "Waiting for PostgreSQL to be ready..."
  sleep 1
done

# Kiểm tra xem database đã được init chưa
DB_EXISTS=$(psql -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname='social_media'")

if [ "$DB_EXISTS" = "1" ]; then
  echo "Database 'social_media' already exists"
  
  # Kiểm tra xem table users đã tồn tại chưa
  TABLE_EXISTS=$(psql -U postgres -d social_media -tAc "SELECT 1 FROM information_schema.tables WHERE table_name='users'")
  
  if [ "$TABLE_EXISTS" != "1" ]; then
    echo "Tables not found, running init.sql..."
    psql -U postgres -d social_media -f /docker-entrypoint-initdb.d/init.sql
    echo "Database initialized successfully!"
  else
    echo "Tables already exist, skipping init"
  fi
else
  echo "Database 'social_media' does not exist, it will be created by init scripts"
fi

# Đợi PostgreSQL process
wait


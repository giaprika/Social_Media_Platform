# Hướng dẫn Setup và Chạy Hệ thống Social Media Platform

## 📋 Yêu cầu hệ thống

- **Node.js** >= 18.x
- **Python** >= 3.8
- **PostgreSQL** >= 12.x
- **npm** hoặc **yarn**
- **pm2** (tùy chọn, để chạy multiple services)

## 🗄️ 1. Setup Database (PostgreSQL)

### Cài đặt PostgreSQL

**Windows:**
- Tải và cài đặt từ: https://www.postgresql.org/download/windows/
- Hoặc dùng Docker:
```bash
docker run --name postgres-social -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=social_media -p 5432:5432 -d postgres
```

**Linux/Mac:**
```bash
# Ubuntu/Debian
sudo apt-get install postgresql postgresql-contrib

# Mac (với Homebrew)
brew install postgresql
brew services start postgresql
```

### Tạo Database và User

```bash
# Đăng nhập vào PostgreSQL
psql -U postgres

# Tạo database
CREATE DATABASE social_media;
CREATE DATABASE notification_db;

# Tạo user (tùy chọn)
CREATE USER social_user WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE social_media TO social_user;
GRANT ALL PRIVILEGES ON DATABASE notification_db TO social_user;

# Thoát
\q
```

### Khởi tạo Schema

```bash
# User Service Database
cd user-service
psql -U postgres -d social_media -f init.sql

# Hoặc chạy script init
node init_db.js

# Notification Service Database
cd ../notification-service
psql -U postgres -d notification_db -f init.sql

# Hoặc chạy script init
node init_db.js
```

## 🔧 2. Cấu hình Environment Variables

### Backend Gateway

Tạo file `backend-gateway/.env`:

```env
PORT=8000
NODE_ENV=development

# JWT Secrets
ACCESS_TOKEN_SECRET=your_super_secret_access_token_key_change_this
REFRESH_TOKEN_SECRET=your_super_secret_refresh_token_key_change_this

# CORS
CORS_ORIGIN=http://localhost:3000

# Service URLs
USER_SERVICE_URL=http://localhost:8001
NOTIFICATION_SERVICE_URL=http://localhost:8002
POST_SERVICE_URL=http://localhost:8003
```

### User Service

Tạo file `user-service/.env`:

```env
PORT=8001
NODE_ENV=development

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=social_media
DB_USER=postgres
DB_PASSWORD=postgres
DB_MAX_CONNECTIONS=10
DB_SSL=false

# JWT (phải giống với gateway)
ACCESS_TOKEN_SECRET=your_super_secret_access_token_key_change_this
REFRESH_TOKEN_SECRET=your_super_secret_refresh_token_key_change_this
```

### Notification Service

Tạo file `notification-service/.env`:

```env
PORT=8002
NODE_ENV=development

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=notification_db
DB_USER=postgres
DB_PASSWORD=postgres
DB_MAX_CONNECTIONS=10
DB_SSL=false
```

### Post Service (Python)

Tạo file `post-service/.env`:

```env
PORT=8003
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_service_key
STORAGE_BUCKET_NAME=posts
```

**Lưu ý:** Post Service sử dụng Supabase để lưu trữ. Bạn cần:
1. Tạo tài khoản tại https://supabase.com
2. Tạo project mới
3. Lấy URL và Service Key từ Settings > API
4. Tạo Storage Bucket tên "posts" trong Storage

### Frontend

Tạo file `frontend/.env`:

```env
REACT_APP_GATEWAY_URL=http://localhost:8000
USER_SERVICE_BASE_URL=http://localhost:8001
```

## 🚀 3. Cài đặt Dependencies

### Backend Services (Node.js)

```bash
# Backend Gateway
cd backend-gateway
npm install

# User Service
cd ../user-service
npm install

# Notification Service
cd ../notification-service
npm install
```

### Post Service (Python)

```bash
cd post-service

# Tạo virtual environment (khuyến nghị)
python -m venv venv

# Kích hoạt virtual environment
# Windows:
venv\Scripts\activate
# Linux/Mac:
source venv/bin/activate

# Cài đặt dependencies
pip install -r requirements.txt
```

### Frontend

```bash
cd frontend
npm install
```

## ▶️ 4. Chạy Hệ thống

### Cách 1: Chạy từng service riêng lẻ (Development)

#### Terminal 1 - Backend Gateway
```bash
cd backend-gateway
npm run dev
# Hoặc
npm start
```
Gateway chạy tại: http://localhost:8000

#### Terminal 2 - User Service
```bash
cd user-service
npm run dev
# Hoặc
npm start
```
User Service chạy tại: http://localhost:8001

#### Terminal 3 - Notification Service
```bash
cd notification-service
npm run dev
# Hoặc
npm start
```
Notification Service chạy tại: http://localhost:8002

#### Terminal 4 - Post Service (Python)
```bash
cd post-service

# Kích hoạt virtual environment nếu chưa
# Windows:
venv\Scripts\activate
# Linux/Mac:
source venv/bin/activate

# Chạy service
uvicorn app:app --reload --port 8003 --host 0.0.0.0
```
Post Service chạy tại: http://localhost:8003
Swagger UI: http://localhost:8003/docs

#### Terminal 5 - Frontend
```bash
cd frontend
npm start
```
Frontend chạy tại: http://localhost:3000

### Cách 2: Chạy với PM2 (Production-like)

#### Cài đặt PM2
```bash
npm install -g pm2
```

#### Chạy tất cả services
```bash
# Từ thư mục root
pm2 start ecosystem.config.js

# Xem logs
pm2 logs

# Xem status
pm2 status

# Dừng tất cả
pm2 stop all

# Restart tất cả
pm2 restart all

# Xóa tất cả
pm2 delete all
```

**Lưu ý:** PM2 config chỉ chạy Node.js services. Post Service (Python) cần chạy riêng.

### Cách 3: Chạy với Script tự động (Windows)

Tạo file `start-all.bat`:

```batch
@echo off
echo Starting all services...

start "Backend Gateway" cmd /k "cd backend-gateway && npm run dev"
timeout /t 2
start "User Service" cmd /k "cd user-service && npm run dev"
timeout /t 2
start "Notification Service" cmd /k "cd notification-service && npm run dev"
timeout /t 2
start "Post Service" cmd /k "cd post-service && venv\Scripts\activate && uvicorn app:app --reload --port 8003 --host 0.0.0.0"
timeout /t 2
start "Frontend" cmd /k "cd frontend && npm start"

echo All services started!
pause
```

### Cách 4: Chạy với Script tự động (Linux/Mac)

Tạo file `start-all.sh`:

```bash
#!/bin/bash

echo "Starting all services..."

# Backend Gateway
cd backend-gateway && npm run dev &
sleep 2

# User Service
cd ../user-service && npm run dev &
sleep 2

# Notification Service
cd ../notification-service && npm run dev &
sleep 2

# Post Service
cd ../post-service && source venv/bin/activate && uvicorn app:app --reload --port 8003 --host 0.0.0.0 &
sleep 2

# Frontend
cd ../frontend && npm start &

echo "All services started!"
wait
```

Cấp quyền thực thi:
```bash
chmod +x start-all.sh
./start-all.sh
```

## ✅ 5. Kiểm tra Hệ thống

### Kiểm tra Services

1. **Backend Gateway**: http://localhost:8000
2. **User Service**: http://localhost:8001/users/health (nếu có)
3. **Notification Service**: http://localhost:8002/notifications/health (nếu có)
4. **Post Service**: http://localhost:8003/docs (Swagger UI)
5. **Frontend**: http://localhost:3000

### Test API

```bash
# Test User Service
curl http://localhost:8001/users/health

# Test Gateway
curl http://localhost:8000/api/service/users/health

# Test Post Service
curl http://localhost:8003/posts
```

## 🔍 6. Troubleshooting

### Lỗi kết nối Database

- Kiểm tra PostgreSQL đang chạy: `pg_isready` hoặc `psql -U postgres`
- Kiểm tra thông tin kết nối trong `.env`
- Kiểm tra firewall/port 5432

### Lỗi Port đã được sử dụng

- Windows: `netstat -ano | findstr :8000`
- Linux/Mac: `lsof -i :8000`
- Kill process: `kill -9 <PID>`

### Lỗi Module không tìm thấy

- Xóa `node_modules` và `package-lock.json`
- Chạy lại `npm install`

### Lỗi Python dependencies

- Đảm bảo virtual environment đã được kích hoạt
- Chạy lại `pip install -r requirements.txt`

## 📝 7. Cấu trúc Ports

| Service | Port | URL |
|---------|------|-----|
| Frontend | 3000 | http://localhost:3000 |
| Backend Gateway | 8000 | http://localhost:8000 |
| User Service | 8001 | http://localhost:8001 |
| Notification Service | 8002 | http://localhost:8002 |
| Post Service | 8003 | http://localhost:8003 |
| PostgreSQL | 5432 | localhost:5432 |

## 🎯 Quick Start (Tóm tắt)

```bash
# 1. Setup Database
psql -U postgres -c "CREATE DATABASE social_media;"
psql -U postgres -c "CREATE DATABASE notification_db;"
cd user-service && psql -U postgres -d social_media -f init.sql
cd ../notification-service && psql -U postgres -d notification_db -f init.sql

# 2. Cài đặt dependencies
cd backend-gateway && npm install
cd ../user-service && npm install
cd ../notification-service && npm install
cd ../post-service && pip install -r requirements.txt
cd ../frontend && npm install

# 3. Tạo các file .env (xem phần 2)

# 4. Chạy services (5 terminals riêng biệt)
# Terminal 1: cd backend-gateway && npm run dev
# Terminal 2: cd user-service && npm run dev
# Terminal 3: cd notification-service && npm run dev
# Terminal 4: cd post-service && uvicorn app:app --reload --port 8003 --host 0.0.0.0
# Terminal 5: cd frontend && npm start
```

## 📚 Tài liệu thêm

- API Documentation: http://localhost:8003/docs (Post Service Swagger)
- User Service Swagger: http://localhost:8001/api-docs (nếu có)
- Notification Service Swagger: http://localhost:8002/api-docs (nếu có)


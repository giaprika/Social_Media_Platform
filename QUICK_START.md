# 🚀 Quick Start Guide

Hướng dẫn nhanh để chạy hệ thống Social Media Platform.

## ⚡ Bước nhanh (5 phút)

### 1. Database Setup

```bash
# Tạo databases
psql -U postgres -c "CREATE DATABASE social_media;"
psql -U postgres -c "CREATE DATABASE notification_db;"

# Khởi tạo schema
cd user-service
psql -U postgres -d social_media -f init.sql

cd ../notification-service
psql -U postgres -d notification_db -f init.sql
```

### 2. Cài đặt Dependencies

```bash
# Backend services
cd backend-gateway && npm install && cd ..
cd user-service && npm install && cd ..
cd notification-service && npm install && cd ..

# Post service (Python)
cd post-service
python -m venv venv
# Windows:
venv\Scripts\activate
# Linux/Mac:
source venv/bin/activate
pip install -r requirements.txt
cd ..

# Frontend
cd frontend && npm install
```

### 3. Tạo file .env

**backend-gateway/.env:**
```env
PORT=8000
ACCESS_TOKEN_SECRET=your_secret_key_here
REFRESH_TOKEN_SECRET=your_refresh_secret_here
USER_SERVICE_URL=http://localhost:8001
NOTIFICATION_SERVICE_URL=http://localhost:8002
CORS_ORIGIN=http://localhost:3000
```

**user-service/.env:**
```env
PORT=8001
DB_HOST=localhost
DB_PORT=5432
DB_NAME=social_media
DB_USER=postgres
DB_PASSWORD=postgres
ACCESS_TOKEN_SECRET=your_secret_key_here
REFRESH_TOKEN_SECRET=your_refresh_secret_here
```

**notification-service/.env:**
```env
PORT=8002
DB_HOST=localhost
DB_PORT=5432
DB_NAME=notification_db
DB_USER=postgres
DB_PASSWORD=postgres
```

**post-service/.env:**
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your_service_key
STORAGE_BUCKET_NAME=posts
```

**frontend/.env:**
```env
REACT_APP_GATEWAY_URL=http://localhost:8000
USER_SERVICE_BASE_URL=http://localhost:8001
```

### 4. Chạy Services

Mở **5 terminals** và chạy:

**Terminal 1 - Gateway:**
```bash
cd backend-gateway
npm run dev
```

**Terminal 2 - User Service:**
```bash
cd user-service
npm run dev
```

**Terminal 3 - Notification Service:**
```bash
cd notification-service
npm run dev
```

**Terminal 4 - Post Service:**
```bash
cd post-service
# Windows:
venv\Scripts\activate
# Linux/Mac:
source venv/bin/activate
uvicorn app:app --reload --port 8003 --host 0.0.0.0
```

**Terminal 5 - Frontend:**
```bash
cd frontend
npm start
```

### 5. Truy cập

- Frontend: http://localhost:3000
- Gateway: http://localhost:8000
- Post Service API Docs: http://localhost:8003/docs

## 🐳 Hoặc dùng PM2 (Production-like)

```bash
# Cài đặt PM2
npm install -g pm2

# Chạy Node.js services
pm2 start ecosystem.config.js

# Chạy Post Service riêng (Python)
cd post-service
source venv/bin/activate  # hoặc venv\Scripts\activate trên Windows
uvicorn app:app --port 8003 --host 0.0.0.0

# Xem logs
pm2 logs
```

## ❗ Lưu ý quan trọng

1. **PostgreSQL phải đang chạy** trước khi start services
2. **Supabase** cần setup cho Post Service (hoặc có thể skip nếu chưa cần)
3. **JWT secrets** phải giống nhau giữa Gateway và User Service
4. **Ports** phải available: 3000, 8000, 8001, 8002, 8003, 5432

## 🔧 Troubleshooting

**Lỗi kết nối database:**
```bash
# Kiểm tra PostgreSQL
pg_isready
# hoặc
psql -U postgres -c "SELECT version();"
```

**Port đã được sử dụng:**
```bash
# Windows
netstat -ano | findstr :8000
# Linux/Mac
lsof -i :8000
```

**Module không tìm thấy:**
```bash
# Xóa và cài lại
rm -rf node_modules package-lock.json
npm install
```

Xem chi tiết tại [SETUP.md](./SETUP.md)


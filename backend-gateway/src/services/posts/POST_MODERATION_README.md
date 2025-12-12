# 🎯 Post Service với AI Content Moderation

## 📋 Tổng quan

Aggregation service trong backend-gateway xử lý flow:

```
Frontend → Gateway (POST /api/posts) → AI Moderation → Post Service
```

**Flow chi tiết:**
1. User gửi request tạo/update post từ frontend
2. Gateway nhận request và extract content + files
3. Gateway gọi AI Service kiểm duyệt:
   - Kiểm tra text content (từ cấm, hate speech, violence, ...)
   - Kiểm tra images (inappropriate content, size, type, ...)
4. Nếu AI trả về **is_safe = true** → Gateway forward request đến Post Service
5. Nếu AI trả về **is_safe = false** → Gateway trả về 400 error với lý do

---

## 🚀 Cách chạy

### **1. Chạy AI Moderation Service (Port 9001)**

```bash
cd ai-service
uvicorn moderation_api:app --reload --port 9001
```

### **2. Chạy Post Service (Port 8000)**

```bash
cd post-service
# Activate virtual environment
.\venv\Scripts\Activate.ps1
# Run server
uvicorn app:app --reload --port 8000
```

### **3. Chạy User Service (Port 3001)**

```bash
cd user-service
npm run dev
```

### **4. Chạy Backend Gateway (Port 3000)**

```bash
cd backend-gateway
npm run dev
```

---

## 📝 Test API

### **Endpoint: POST /api/posts**

**URL:** `http://localhost:3000/api/posts`

**Headers:**
```
Authorization: Bearer {accessToken}
x-user-id: {userId}
```

**Body (form-data):**
```
content: "This is my post content"
tags: ["happy", "fun"]
visibility: "public"
files: [file1.jpg, file2.png]
```

---

## ✅ Test Case 1: Content Pass Moderation

**Request:**
```bash
POST http://localhost:3000/api/posts
Content-Type: multipart/form-data

content: "Hello world! This is a nice day"
tags: ["happy", "sunny"]
files: image.jpg (< 5MB, valid image)
```

**Expected Response (201):**
```json
{
  "status": "success",
  "message": "Post created successfully",
  "data": {
    "post_id": "uuid",
    "user_id": "uuid",
    "content": "Hello world! This is a nice day",
    "tags": ["happy", "sunny"],
    ...
  }
}
```

---

## ❌ Test Case 2: Text Content Rejected

**Request:**
```bash
POST http://localhost:3000/api/posts

content: "I hate everyone and want violence"
```

**Expected Response (400):**
```json
{
  "status": "error",
  "message": "Content violates community guidelines",
  "reason": "Content contains prohibited word: 'hate'",
  "moderation": {
    "is_safe": false,
    "reason": "Content contains prohibited word: 'hate'",
    "confidence": 0.95
  }
}
```

---

## ❌ Test Case 3: Image Too Large

**Request:**
```bash
POST http://localhost:3000/api/posts

content: "Check this image"
files: large_image.jpg (> 5MB)
```

**Expected Response (400):**
```json
{
  "status": "error",
  "message": "Images contain inappropriate content",
  "reason": "Some images contain inappropriate content",
  "moderation": {
    "is_safe": false,
    "results": [
      {
        "filename": "large_image.jpg",
        "is_safe": false,
        "reason": "File too large: 7.52MB"
      }
    ],
    "message": "Some images contain inappropriate content"
  }
}
```

---

## 🔧 Configuration

### **backend-gateway/.env**
```env
AI_SERVICE_URL=http://localhost:9001
POST_SERVICE_URL=http://localhost:8000
USER_SERVICE_URL=http://localhost:3001
```

### **AI Moderation Settings**

File: `ai-service/moderation_api.py`

**Từ cấm mặc định:**
```python
BANNED_WORDS = [
    "hate", "violence", "kill", "racist", "nsfw", 
    "nude", "porn", "explicit", "blood"
]
```

**File size limit:** 5MB per image

**Timeout:** 30 seconds

---

## 📊 Architecture

```
┌─────────────┐
│  Frontend   │
└──────┬──────┘
       │ POST /api/posts
       ▼
┌──────────────────────────────────────┐
│     Backend Gateway (Port 3000)      │
│  ┌────────────────────────────────┐  │
│  │  Post Aggregation Service      │  │
│  │  (/api/posts)                  │  │
│  │                                │  │
│  │  1. Extract content + files    │  │
│  │  2. Call AI moderation         │  │
│  │  3. Forward to Post Service    │  │
│  └────────────────────────────────┘  │
└──────┬───────────────────────┬───────┘
       │                       │
       │ Moderation            │ Create Post
       ▼                       ▼
┌────────────────┐      ┌────────────────┐
│  AI Service    │      │  Post Service  │
│  (Port 9001)   │      │  (Port 8000)   │
│                │      │                │
│ - Text check   │      │ - Store post   │
│ - Image check  │      │ - Upload files │
└────────────────┘      └────────────────┘
```

---

## 🛠️ Customization

### **Thay đổi logic moderation:**

Edit file `ai-service/moderation_api.py`:

```python
# Thêm từ cấm
BANNED_WORDS.append("spam")

# Thay đổi threshold
if confidence < 0.8:
    return ModerationResult(is_safe=True)
```

### **Tích hợp AI model thực:**

Replace logic đơn giản trong `moderate_images()` bằng:

```python
# Example with Google Gemini
import google.generativeai as genai

model = genai.GenerativeModel('gemini-2.5-flash')
response = model.generate_content([
    "Check if this image contains inappropriate content",
    image_data
])

is_safe = "safe" in response.text.lower()
```

### **Thay đổi timeout:**

File: `backend-gateway/src/services/posts/config.js`

```javascript
export default {
  aiTimeout: 60000, // 60 seconds
};
```

---

## 🐛 Troubleshooting

### **AI Service không khả dụng:**

Nếu AI service down, hiện tại sẽ throw error và reject request.

**Muốn fallback (cho pass):**

Edit `backend-gateway/src/services/posts/postService.js`:

```javascript
async moderateContent(content, userId) {
  try {
    // ... existing code
  } catch (error) {
    logger.error("AI moderation failed", error);
    
    // FALLBACK: Cho pass thay vì reject
    return { is_safe: true };
  }
}
```

### **Multer errors:**

Đảm bảo frontend gửi `Content-Type: multipart/form-data` và files đúng format.

### **CORS errors:**

Kiểm tra `backend-gateway/.env`:
```env
CORS_ORIGIN=http://localhost:3001,http://localhost:3000
```

---

## 📚 Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/posts` | Tạo post mới (với moderation) | ✅ |
| PATCH | `/api/posts/:id` | Update post (với moderation) | ✅ |
| GET | `/api/posts` | Lấy danh sách posts | ❌ |
| GET | `/api/posts/:id` | Lấy chi tiết post | ❌ |
| DELETE | `/api/posts/:id` | Xóa post | ✅ |

---

## 🔐 Security Notes

1. **AI Service nên được bảo vệ:** Thêm API key authentication
2. **Rate limiting:** Giới hạn số request moderation per user
3. **Content logging:** Log các nội dung bị reject để audit
4. **False positive handling:** Cho phép user appeal khi bị reject nhầm

---

## 📈 Monitoring

**Logs location:**
- Gateway logs: `backend-gateway/logs/`
- AI moderation results: Check terminal output

**Metrics to track:**
- Moderation pass rate
- Average moderation time
- False positive/negative rate
- AI service uptime

---

## 🎓 Next Steps

1. ✅ Tích hợp AI model thực (Gemini, OpenAI, Azure Content Safety)
2. ✅ Thêm caching cho moderation results
3. ✅ Implement appeals system
4. ✅ Add user reputation score
5. ✅ Queue-based moderation cho scale

---

**Questions?** Check logs hoặc file README trong từng service folder.

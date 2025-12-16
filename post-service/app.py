"""
Main Application - Posts & Comments & Reactions API
RESTful API tuân thủ OpenAPI specification
"""
import os
import sys
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from dotenv import load_dotenv

# Add routes to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Import routers
from routes import posts, comments, reactions

load_dotenv()

# Create FastAPI app
app = FastAPI(
    title="Social Media Post & Interaction API",
    description="""
API dành cho dịch vụ Bài viết (Post) và Tương tác (Comment, Reaction)

## User Identification
Mọi request cần có header `X-User-ID` chứa UUID của user.

**Để test trong Swagger UI:**
1. Mở bất kỳ endpoint nào (POST, PATCH, DELETE)
2. Click **"Try it out"**
3. Trong phần **Parameters**, điền `X-User-ID` với UUID hợp lệ
4. Ví dụ: `9b72d69d-32a4-44c7-b2f9-3f4a3b6e89f1`

**Test UUID mẫu:**
- `9b72d69d-32a4-44c7-b2f9-3f4a3b6e89f1`
- `a1b2c3d4-e5f6-7890-abcd-ef1234567890`
- `12345678-1234-1234-1234-123456789abc`

**Lưu ý:** Không cần authentication/authorization, chỉ cần user_id để tracking.
""",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    servers=[
        {"url": "http://localhost:8003", "description": "Local Development Server"},
        {"url": "http://127.0.0.1:8003", "description": "Local Development Server (IP)"}
    ]
)

# Tăng giới hạn file upload size (mặc định FastAPI không giới hạn, nhưng có thể bị giới hạn bởi server)
# Nếu dùng uvicorn, thêm --limit-max-requests vào command
# Hoặc cấu hình qua environment variable
app.state.max_upload_size = 100 * 1024 * 1024  # 100MB

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        "http://127.0.0.1:8003"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============= EXCEPTION HANDLERS =============
@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    """Xử lý các lỗi HTTPException (404, 400, 403, ...)"""
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "status": "error",
            "code": f"HTTP_{exc.status_code}",
            "message": exc.detail or "HTTP Error",
            "details": []
        },
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Xử lý lỗi validation từ Pydantic (thiếu field, sai kiểu, ...)"""
    errors = []
    for err in exc.errors():
        field = ".".join(str(loc) for loc in err.get("loc", []))
        errors.append({
            "field": field,
            "message": err.get("msg", "Validation error"),
        })
    
    return JSONResponse(
        status_code=400,
        content={
            "status": "error",
            "code": "INVALID_INPUT",
            "message": "Một hoặc nhiều trường đầu vào không hợp lệ",
            "details": errors,
        },
    )


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    """Xử lý các lỗi còn lại (runtime, database, ...)"""
    return JSONResponse(
        status_code=500,
        content={
            "status": "error",
            "code": "INTERNAL_ERROR",
            "message": "Internal Server Error",
            "details": [{"message": str(exc)}]
        },
    )


# ============= HEALTH CHECK =============
@app.get("/api/v1/health", tags=["Health"])
def health_check():
    """Health check endpoint"""
    return {
        "status": "success",
        "message": "Server is healthy",
        "data": {
            "service": "Posts & Interactions API",
            "version": "1.0.0"
        }
    }


# ============= INCLUDE ROUTERS =============
# Posts routes: /api/v1/posts
app.include_router(posts.router, prefix="/api/v1")

# Comments routes: /api/v1/posts/{post_id}/comments
app.include_router(comments.router, prefix="/api/v1")

# Reactions routes: /api/v1/posts/{post_id}/reactions và /api/v1/comments/{comment_id}/reactions
app.include_router(reactions.router, prefix="/api/v1")


# ============= ROOT ENDPOINT =============
@app.get("/", tags=["Root"])
def root():
    """Root endpoint với thông tin API"""
    return {
        "message": "Welcome to Social Media API",
        "version": "1.0.0",
        "documentation": "/docs",
        "openapi": "/openapi.json",
        "_links": {
            "posts": {"href": "/api/v1/posts", "method": "GET"},
            "health": {"href": "/api/v1/health", "method": "GET"},
        }
    }


# ============= RUN APPLICATION =============
if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8003))
    uvicorn.run(
        "app:app",
        host="0.0.0.0",
        port=port,
        reload=True,
        log_level="info"
    )


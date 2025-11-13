import os
import uuid
import json
from typing import List, Optional
from enumType import PostType, ReactionType, SharedType, Visibility

from fastapi import FastAPI, HTTPException, Path, Query, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
POSTS_TABLE = os.getenv("POSTS_TABLE_NAME", "posts")
STORAGE_BUCKET = os.getenv("STORAGE_BUCKET_NAME", "posts_service")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise RuntimeError("Missing SUPABASE_URL or SUPABASE_KEY in environment")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
app = FastAPI(title="Posts API (FastAPI + Supabase)")

# Allow React dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class CreatePostRequest(BaseModel):
    user_id: str
    content: Optional[str] = None
    media_urls: Optional[List[str]] = None
    tags: Optional[List[str]] = None
    post_shared_id: Optional[str] = None
    group_id: Optional[str] = None
    visibility: Optional[str] = None
    shared_type: Optional[str] = None
    post_type: Optional[str] = None

from fastapi.responses import JSONResponse
from fastapi.requests import Request
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    """Xử lý các lỗi HTTPException (404, 400, 403, ...)"""
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "status": "fail",
            "message": exc.detail or "HTTP Error",
            "error": {
                "code": exc.status_code,
                "path": request.url.path,
            },
        },
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Xử lý lỗi validation từ Pydantic (thiếu field, sai kiểu, ...)"""
    errors = []
    for err in exc.errors():
        errors.append({
            "loc": err.get("loc"),
            "msg": err.get("msg"),
            "type": err.get("type"),
        })
    
    return JSONResponse(
        status_code=422,
        content={
            "status": "fail",
            "message": "Validation error",
            "error": {
                "code": 422,
                "details": errors,
            },
        },
    )


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    """Xử lý các lỗi còn lại (runtime, database, ...)"""
    return JSONResponse(
        status_code=500,
        content={
            "status": "fail",
            "message": "Internal Server Error",
            "error": {
                "code": 500,
                "detail": str(exc),
                "path": request.url.path,
            },
        },
    )


@app.get("/api/v1/health")
def health():
    return {"status": "success", "message": "Server is healthy"}


@app.get("/api/v1/posts")
async def get_posts(
    user_id: Optional[str] = Query(None, description="Lọc theo ID người dùng"),
    group_id: Optional[str] = Query(None, description="Lọc theo group ID"),
    visibility: Optional[str] = Query(None, description="Lọc theo chế độ hiển thị"),
    limit: int = Query(5, ge=1, le=10, description="Số bài tối đa mỗi trang"),
    offset: int = Query(0, ge=0, description="Bỏ qua n bài đầu tiên (phân trang)"),
):

    query = supabase.table(POSTS_TABLE).select("*")

    if user_id:
        query = query.eq("user_id", user_id)
    if group_id:
        query = query.eq("group_id", group_id)
    if visibility:
        query = query.eq("visibility", visibility)

    result = query.range(offset, offset + limit - 1).execute()
    posts = result.data or []

    return {
        "status": "success",
        "message": f"Fetched {len(posts)} posts successfully",
        "data": posts,
        "_links": {
            "self": {
                "href": f"/api/v1/posts?limit={limit}&offset={offset}",
                "method": "GET",
            },
            "next": {
                "href": f"/api/v1/posts?limit={limit}&offset={offset + limit}",
                "method": "GET",
            },
            "create": {"href": "/api/v1/posts", "method": "POST"},
        },
    }

@app.get("/api/v1/posts/{post_id}")
async def get_post_detail(
    post_id: str = Path(..., description="ID của bài viết cần lấy"),
):
    result = supabase.table(POSTS_TABLE).select("*").eq("post_id", post_id).execute()
    post_data = result.data

    if not post_data or len(post_data) == 0:
        raise HTTPException(status_code=404, detail=f"Post with id '{post_id}' not found")

    post = post_data[0]
    return {
        "status": "success",
        "message": f"Post '{post_id}' retrieved successfully",
        "data": post,
        "_links": {
            "self": {"href": f"/api/v1/posts/{post_id}", "method": "GET"},
            "all": {"href": "/api/v1/posts", "method": "GET"},
            "delete": {"href": f"/api/v1/posts/{post_id}", "method": "DELETE"},
            "update": {"href": f"/api/v1/posts/{post_id}", "method": "PUT"},
        },
    }

# Post
async def upload_to_supabase(file: UploadFile) -> str:
    content_type = file.content_type
    if not (content_type.startswith("image/") or content_type.startswith("video/")):
        raise HTTPException(status_code=400, detail="Chỉ chấp nhận ảnh hoặc video")

    ext = os.path.splitext(file.filename)[1]
    path = f"{uuid.uuid4()}{ext}"
    data = await file.read()
    res = supabase.storage.from_(STORAGE_BUCKET).upload(path, data)
    if hasattr(res, "error") and res.error:
        raise HTTPException(status_code=500, detail=str(res.error))

    return supabase.storage.from_(STORAGE_BUCKET).get_public_url(path)

def normalize_tags(tags):
    if not tags:
        return None

    # Nếu Swagger gửi array thật
    if isinstance(tags, list):
        clean = [t.strip() for t in tags if isinstance(t, str) and t.strip()]
        return clean if clean else None

    # Nếu frontend gửi JSON string (ví dụ: '["funny","happy"]')
    if isinstance(tags, str):
        tags = tags.strip()
        if tags in ["", "[]", "null"]:
            return None
        try:
            parsed = json.loads(tags)
            if isinstance(parsed, list):
                clean = [t.strip() for t in parsed if isinstance(t, str) and t.strip()]
                return clean if clean else None
            return [tags] if tags else None
        except json.JSONDecodeError:
            return [tags] if tags else None

    return None

@app.post("/api/v1/posts")
async def create_post(
    user_id: str = Form(...),
    content: Optional[str] = Form(None),
    media_files: List[UploadFile] = File(default=[]),
    tags: Optional[List[str]] = Form(None),
    post_share_id: Optional[str] = Form(None),
    group_id: Optional[str] = Form(None),
    visibility: Optional[str] = Form(Visibility.PUBLIC.value),
    shared_type: Optional[str] = Form(SharedType.ORIGINAL.value),
    post_type: Optional[str] = Form(PostType.USER.value),

):
    if not user_id.strip():
        raise HTTPException(status_code=400, detail="user_id is required")
    
    media_urls = []
    # Only process if we have actual files (not empty strings)
    if media_files and len(media_files) > 0:
        for file in media_files:
            if file.filename:  # Skip if no actual file
                url = await upload_to_supabase(file)
                media_urls.append(url)

    tags_list = normalize_tags(tags)
    if tags_list == [""]:
        tags_list = None

    new_post = {
        "user_id": user_id,
        "content": content or None,
        "media_urls": media_urls if media_urls else None,
        "tags": tags_list or None,
        "post_share_id": post_share_id or None,
        "group_id": group_id or None,
        "visibility": visibility or Visibility.PUBLIC.value,
        "shared_type": shared_type or SharedType.ORIGINAL.value,
        "post_type": post_type or PostType.USER.value,
    }

    result = supabase.table(POSTS_TABLE).insert(new_post).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Insert post failed")

    created_post = result.data[0]

    return {
        "status": "success",
        "message": "Post created successfully with uploaded",
        "data": {
            **created_post,
            "_links": {
                "self": {"href": f"/api/v1/posts/{created_post['post_id']}", "method": "GET"},
                "delete": {"href": f"/api/v1/posts/{created_post['post_id']}", "method": "DELETE"},
                "all": {"href": "/api/v1/posts", "method": "GET"},
            },
        },
    }

@app.delete("/api/v1/posts/{post_id}")
async def delete_post(
    post_id: str = Path(..., description="ID bài viết cần xóa"),
):
    result = supabase.table(POSTS_TABLE).select("*").eq("post_id", post_id).execute()
    post_data = result.data

    if not post_data or len(post_data) == 0:
        raise HTTPException(status_code=404, detail=f"Post with id '{post_id}' not found")

    post = post_data[0]

    # Nếu bài viết có media, xóa khỏi Supabase Storage
    media_urls = post.get("media_urls") or []
    deleted_files = []

    for url in media_urls:
        try:
            # Ví dụ: https://xxx.supabase.co/storage/v1/object/public/posts_service/uploads/abc.jpg
            # → ta cần lấy phần path: uploads/abc.jpg
            base_prefix = f"/storage/v1/object/public/{STORAGE_BUCKET}/"
            if base_prefix in url:
                path = url.split(base_prefix)[1]
                # Xóa file trong bucket
                res = supabase.storage.from_(STORAGE_BUCKET).remove([path])
                if hasattr(res, "error") and res.error:
                    print(f"⚠️ Warning: can't delete file {path}: {res.error}")
                else:
                    deleted_files.append(path)
        except Exception as e:
            print(f"⚠️ Lỗi xóa file {url}: {e}")

    delete_result = supabase.table(POSTS_TABLE).delete().eq("post_id", post_id).execute()

    if delete_result.data is None:
        raise HTTPException(status_code=500, detail="Failed to delete post")

    return {
        "status": "success",
        "message": f"Post '{post_id}' and {len(deleted_files)} media files deleted successfully",
        "data": {
            "deleted_post_id": post_id,
            "deleted_media": deleted_files,
        },
        "_links": {
            "all": {"href": "/api/v1/posts", "method": "GET"},
            "create": {"href": "/api/v1/posts", "method": "POST"},
        },
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)
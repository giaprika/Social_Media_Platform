import os
import uuid
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Query, Path, Header, UploadFile, File, Form
from dotenv import load_dotenv
from supabase import create_client
from .models import (
    PostObject, 
    PostSingleResponse, PostListResponse,
    Pagination, Metadata, Link
)
from .enumType import Visibility, ReactionType

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
POSTS_TABLE = os.getenv("POSTS_TABLE_NAME", "posts")
STORAGE_BUCKET = os.getenv("STORAGE_BUCKET_NAME", "posts_service")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise RuntimeError("Missing SUPABASE_URL or SUPABASE_KEY in environment")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
router = APIRouter(prefix="/posts", tags=["Posts"])


# ============= HELPER FUNCTIONS =============
async def upload_to_supabase(file: UploadFile) -> str:
    """Upload file to Supabase Storage and return public URL"""
    content_type = file.content_type
    if not (content_type and (content_type.startswith("image/") or content_type.startswith("video/"))):
        raise HTTPException(status_code=400, detail="Chỉ chấp nhận ảnh hoặc video")

    ext = os.path.splitext(file.filename)[1] if file.filename else ".jpg"
    path = f"{uuid.uuid4()}{ext}"
    data = await file.read()
    
    try:
        res = supabase.storage.from_(STORAGE_BUCKET).upload(path, data)
        if hasattr(res, "error") and res.error:
            raise HTTPException(status_code=500, detail=f"Upload failed: {str(res.error)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")

    return supabase.storage.from_(STORAGE_BUCKET).get_public_url(path)


def extract_storage_path_from_url(url: str) -> Optional[str]:
    """Extract storage path from Supabase public URL"""
    try:
        # URL format: https://{project}.supabase.co/storage/v1/object/public/{bucket}/{path}
        parts = url.split(f"/storage/v1/object/public/{STORAGE_BUCKET}/")
        if len(parts) == 2:
            return parts[1]
        return None
    except:
        return None


async def delete_files_from_storage(media_urls: Optional[List[str]]):
    """Delete files from Supabase Storage"""
    if not media_urls:
        return
    
    for url in media_urls:
        try:
            path = extract_storage_path_from_url(url)
            if path:
                supabase.storage.from_(STORAGE_BUCKET).remove([path])
        except Exception as e:
            # Log error but don't fail the request
            print(f"Failed to delete file {url}: {str(e)}")


def build_links(post_id: Optional[str] = None, base_path: str = "/api/v1/posts") -> dict:
    """Build HATEOAS links"""
    links = {}
    
    if post_id:
        links["self"] = Link(href=f"{base_path}/{post_id}", method="GET")
        links["update"] = Link(href=f"{base_path}/{post_id}", method="PATCH")
        links["delete"] = Link(href=f"{base_path}/{post_id}", method="DELETE")
        links["comments"] = Link(href=f"{base_path}/{post_id}/comments", method="GET")
        links["reactions"] = Link(href=f"{base_path}/{post_id}/reactions", method="GET")
        links["all"] = Link(href=base_path, method="GET")
    else:
        links["self"] = Link(href=base_path, method="GET")
        links["create"] = Link(href=base_path, method="POST")
    
    return {k: v.dict() for k, v in links.items()}


def get_user_id(x_user_id: Optional[str]) -> str:
    """Get user_id from X-User-ID header (no authentication)"""
    if not x_user_id:
        raise HTTPException(status_code=400, detail="X-User-ID header required")
    
    # Validate UUID format
    import re
    uuid_pattern = r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    if not re.match(uuid_pattern, x_user_id.lower()):
        raise HTTPException(status_code=400, detail="Invalid UUID format for X-User-ID")
    
    return x_user_id


# ============= GET /posts - Lấy danh sách bài viết =============
@router.get("", response_model=PostListResponse)
async def get_posts(
    limit: int = Query(10, ge=1, le=100),
    offset: int = Query(0, ge=0),
    cursor: Optional[str] = Query(None),
    q: Optional[str] = Query(None, description="Từ khóa tìm kiếm"),
    user_id: Optional[str] = Query(None),
    status: Optional[bool] = Query(None),
    tag: Optional[List[str]] = Query(None),
    sort_by: str = Query("created_at"),
    order: str = Query("desc", regex="^(asc|desc)$"),
):
    """Lấy danh sách bài viết với các tùy chọn lọc và phân trang"""
    try:
        query = supabase.table(POSTS_TABLE).select("*", count="exact")
        
        if q:
            query = query.ilike("content", f"%{q}%")
        if user_id:
            query = query.eq("user_id", user_id)
        if status is not None:
            query = query.eq("status", status)
        if tag:
            for t in tag:
                query = query.contains("tags", [t])
        if cursor:
            query = query.gt("post_id", cursor)
        
        query = query.order(sort_by, desc=(order == "desc"))
        query = query.range(offset, offset + limit - 1)
        
        result = query.execute()
        posts = result.data or []
        total_items = result.count if hasattr(result, 'count') else len(posts)
        
        return PostListResponse(
            status="success",
            message=f"Retrieved {len(posts)} posts",
            data=posts,
            _links=build_links(),
            metadata=Metadata(
                pagination=Pagination(limit=limit, offset=offset, total_items=total_items)
            )
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")



# ============= POST /posts - Tạo bài viết mới =============
@router.post("", response_model=PostSingleResponse, status_code=201)
async def create_post(
    content: Optional[str] = Form(None),
    tags: Optional[List[str]] = Form(None),
    post_share_id: Optional[str] = Form(None),
    group_id: Optional[str] = Form(None),
    visibility: Optional[str] = Form(None),
    files: Optional[List[UploadFile]] = File(None),
    x_user_id: str = Header(..., alias="X-User-ID")
):
    user_id = get_user_id(x_user_id)
    
    try:
        # Upload files if provided
        media_urls = []
        if files:
            for file in files:
                if file.filename:  # Skip empty files
                    url = await upload_to_supabase(file)
                    media_urls.append(url)
        
        new_post = {
            "user_id": user_id,
            "content": content,
            "media_urls": media_urls if media_urls else None,
            "tags": tags,
            "post_share_id": post_share_id,
            "group_id": group_id,
            "visibility": visibility or Visibility.PUBLIC.value,
            "reacts_count": 0,
            "comments_count": 0,
            "shares_count": 0,
            "status": True,
        }
        
        result = supabase.table(POSTS_TABLE).insert(new_post).execute()
        
        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to create post")
        
        created_post = result.data[0]
        
        # Publish notification event qua RabbitMQ
        # Publish notification event qua RabbitMQ
        try:
            from rabbitmq_producer import publish_event
            await publish_event("post.created", {
                "user_id": user_id,
                "post_id": created_post.get("post_id"),
                "post_title": content,
                "title_template": "Bài viết mới đã được tạo!",
                "body_template": f"Bài viết: {content}",
                "link_url": f"/posts/{created_post.get('post_id')}"
            })
        except Exception as e:
            print(f"[Notification] Failed to publish post.created event: {str(e)}")

        return PostSingleResponse(
            status="success",
            message="Post created successfully",
            data=PostObject(**created_post),
            _links=build_links(created_post.get("post_id"))
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


# ============= GET /posts/{post_id} - Xem chi tiết bài viết =============
@router.get("/{post_id}", response_model=PostSingleResponse)
async def get_post_by_id(
    post_id: str = Path(..., description="ID của bài viết")
):
    """Lấy chi tiết một bài viết cụ thể"""
    try:
        result = supabase.table(POSTS_TABLE).select("*").eq("post_id", post_id).execute()
        
        if not result.data or len(result.data) == 0:
            raise HTTPException(status_code=404, detail=f"Post with id '{post_id}' not found")
        
        post = result.data[0]
        
        return PostSingleResponse(
            status="success",
            message="Post retrieved successfully",
            data=PostObject(**post),
            _links=build_links(post_id)
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


# ============= PATCH /posts/{post_id} - Cập nhật bài viết =============
@router.patch("/{post_id}", response_model=PostSingleResponse)
async def update_post(
    post_id: str,
    content: Optional[str] = Form(None),
    tags: Optional[List[str]] = Form(None),
    visibility: Optional[str] = Form(None),
    files: Optional[List[UploadFile]] = File(None),
    x_user_id: str = Header(..., alias="X-User-ID")
):
    """Cập nhật bài viết - upload files mới nếu có
    
    **Required Header:**
    - X-User-ID: UUID của user (bắt buộc)
    
    **Form-data:**
    - content: Nội dung mới (optional)
    - files: Danh sách files mới để upload (optional)
    - tags: JSON string array hoặc single tag (optional)
    - visibility: public/private/friends (optional)
    """
    user_id = get_user_id(x_user_id)
    
    try:
        result = supabase.table(POSTS_TABLE).select("*").eq("post_id", post_id).execute()
        
        if not result.data:
            raise HTTPException(status_code=404, detail=f"Post with id '{post_id}' not found")
        
        post = result.data[0]
        
        if post.get("user_id") != user_id:
            raise HTTPException(status_code=403, detail="You don't have permission to update this post")
        
        # Delete old media files from storage if new files provided
        if files:
            old_media_urls = post.get("media_urls", [])
            if old_media_urls:
                await delete_files_from_storage(old_media_urls)
        
        # Upload new files
        media_urls = []
        if files:
            for file in files:
                if file.filename:  # Skip empty files
                    url = await upload_to_supabase(file)
                    media_urls.append(url)
        
        # Prepare update data
        update_fields = {}
        if content is not None:
            update_fields["content"] = content
        if files:  # Only update media_urls if new files provided
            update_fields["media_urls"] = media_urls if media_urls else None
        if tags is not None:
            update_fields["tags"] = tags
        if visibility is not None:
            update_fields["visibility"] = visibility
        
        if not update_fields:
            raise HTTPException(status_code=400, detail="No fields to update")
        
        update_fields["is_edited"] = True
        
        result = supabase.table(POSTS_TABLE).update(update_fields).eq("post_id", post_id).execute()
        
        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to update post")
        
        updated_post = result.data[0]
        
        return PostSingleResponse(
            status="success",
            message="Post updated successfully",
            data=PostObject(**updated_post),
            _links=build_links(post_id)
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


# ============= DELETE /posts/{post_id} - Xóa bài viết =============
@router.delete("/{post_id}", status_code=204)
async def delete_post(
    post_id: str = Path(..., description="ID của bài viết"),
    x_user_id: str = Header(..., alias="X-User-ID")
):
    """Xóa bài viết
    
    **Required Header:**
    - X-User-ID: UUID của user (bắt buộc)
    """
    user_id = get_user_id(x_user_id)
    
    try:
        result = supabase.table(POSTS_TABLE).select("*").eq("post_id", post_id).execute()
        
        if not result.data:
            raise HTTPException(status_code=404, detail=f"Post with id '{post_id}' not found")
        
        post = result.data[0]
        
        if post.get("user_id") != user_id:
            raise HTTPException(status_code=403, detail="You don't have permission to delete this post")
        
        result = supabase.table(POSTS_TABLE).delete().eq("post_id", post_id).execute()
        
        return None
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

"""
Comments Service - RESTful API for Comments Management
"""
import os
import uuid
import json
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Query, Path, Header, UploadFile, File, Form
from dotenv import load_dotenv
from supabase import create_client
from .models import (
    CommentObject,
    CommentSingleResponse, CommentListResponse,
    Pagination, Metadata, Link
)

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
COMMENTS_TABLE = os.getenv("COMMENTS_TABLE_NAME", "comments")
POSTS_TABLE = os.getenv("POSTS_TABLE_NAME", "posts")
STORAGE_BUCKET = os.getenv("STORAGE_BUCKET_NAME", "posts_service")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise RuntimeError("Missing SUPABASE_URL or SUPABASE_KEY in environment")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
router = APIRouter(tags=["Comments"])


# ============= HELPER FUNCTIONS =============
async def upload_to_supabase(file: UploadFile) -> str:
    """Upload file to Supabase Storage and return public URL"""
    content_type = file.content_type
    if not (content_type and (content_type.startswith("image/") or content_type.startswith("video/"))):
        raise HTTPException(status_code=400, detail="Chỉ chấp nhận ảnh hoặc video")

    ext = os.path.splitext(file.filename)[1] if file.filename else ".jpg"
    path = f"comments/{uuid.uuid4()}{ext}"
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


def build_links(post_id: str, comment_id: Optional[str] = None) -> dict:
    """Build HATEOAS links for comments"""
    base_path = f"/api/v1/posts/{post_id}/comments"
    
    if comment_id:
        links = {
            "self": Link(href=f"{base_path}/{comment_id}", method="GET"),
            "update": Link(href=f"{base_path}/{comment_id}", method="PATCH"),
            "delete": Link(href=f"{base_path}/{comment_id}", method="DELETE"),
            "reactions": Link(href=f"/api/v1/comments/{comment_id}/reactions", method="GET"),
            "all": Link(href=base_path, method="GET"),
        }
    else:
        links = {
            "self": Link(href=base_path, method="GET"),
            "create": Link(href=base_path, method="POST"),
        }
    
    return {k: v.dict() for k, v in links.items()}


# ============= GET /posts/{post_id}/comments - Lấy comments của post =============
@router.get("/posts/{post_id}/comments", response_model=CommentListResponse)
async def get_post_comments(
    post_id: str = Path(..., description="ID của bài viết"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    cursor: Optional[str] = Query(None),
    user_id: Optional[str] = Query(None),
):
    """Lấy danh sách comments của một bài viết"""
    try:
        post_result = supabase.table(POSTS_TABLE).select("post_id").eq("post_id", post_id).execute()
        if not post_result.data:
            raise HTTPException(status_code=404, detail=f"Post '{post_id}' not found")
        
        query = supabase.table(COMMENTS_TABLE).select("*", count="exact").eq("post_id", post_id)
        
        if user_id:
            query = query.eq("user_id", user_id)
        if cursor:
            query = query.gt("comment_id", cursor)
        
        query = query.order("created_at", desc=True)
        query = query.range(offset, offset + limit - 1)
        
        result = query.execute()
        comments = result.data or []
        total_items = result.count if hasattr(result, 'count') else len(comments)
        
        return CommentListResponse(
            status="success",
            message=f"Retrieved {len(comments)} comments",
            data=comments,
            _links=build_links(post_id),
            metadata=Metadata(
                pagination=Pagination(limit=limit, offset=offset, total_items=total_items)
            )
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


# ============= POST /comments/upload - Upload media for comments =============
@router.post("/comments/upload")
async def upload_comment_media(
    files: List[UploadFile] = File(...),
    x_user_id: Optional[str] = Header(None, alias="X-User-ID")
):
    """Upload media files for comments"""
    user_id = get_user_id(x_user_id)
    
    if not files:
        raise HTTPException(status_code=400, detail="No files provided")
    
    try:
        media_urls = []
        for file in files:
            if file.filename:
                url = await upload_to_supabase(file)
                media_urls.append(url)
        
        return {
            "status": "success",
            "message": f"Uploaded {len(media_urls)} files successfully",
            "data": {"media_urls": media_urls, "count": len(media_urls)}
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload error: {str(e)}")


# ============= POST /posts/{post_id}/comments - Tạo comment mới =============
@router.post("/posts/{post_id}/comments", response_model=CommentSingleResponse, status_code=201)
async def create_comment(
    post_id: str = Path(..., description="ID của bài viết"),
    content: Optional[str] = Form(None),
    tags: Optional[List[str]] = Form(None),
    parent_id: Optional[str] = Form(None),
    files: Optional[List[UploadFile]] = File(None),
    x_user_id: Optional[str] = Header(None, alias="X-User-ID")
):
    """Tạo comment mới cho bài viết với upload files"""
    user_id = get_user_id(x_user_id)
    
    try:
        # Get post and owner info
        post_result = supabase.table(POSTS_TABLE).select("post_id, user_id").eq("post_id", post_id).execute()
        if not post_result.data:
            raise HTTPException(status_code=404, detail=f"Post '{post_id}' not found")
        
        if parent_id:
            parent_result = supabase.table(COMMENTS_TABLE).select("comment_id")\
                .eq("comment_id", parent_id)\
                .eq("post_id", post_id)\
                .execute()
            if not parent_result.data:
                raise HTTPException(status_code=404, detail=f"Parent comment '{parent_id}' not found")
        
        # Upload files if provided
        media_urls = []
        if files:
            for file in files:
                if file.filename:  # Skip empty files
                    url = await upload_to_supabase(file)
                    media_urls.append(url)
        
        new_comment = {
            "user_id": user_id,
            "post_id": post_id,
            "content": content,
            "media_urls": media_urls if media_urls else None,
            "tags": tags,
            "parent_id": parent_id,
            "reacts_count": 0,
        }
        
        result = supabase.table(COMMENTS_TABLE).insert(new_comment).execute()
        
        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to create comment")
        
        created_comment = result.data[0]
        
        # Update post comments_count (+1)
        count_result = supabase.table(COMMENTS_TABLE).select("comment_id", count="exact")\
            .eq("post_id", post_id).execute()
        new_count = count_result.count if hasattr(count_result, 'count') else 0
        
        supabase.table(POSTS_TABLE).update({
            "comments_count": new_count
        }).eq("post_id", post_id).execute()
        
        # Publish notification event qua RabbitMQ
        try:
            from rabbitmq_producer import publish_event
            post_owner = post_result.data[0]["user_id"]
            # Get current counts
            post_info = supabase.table(POSTS_TABLE).select("reacts_count, comments_count").eq("post_id", post_id).execute()
            likes_count = post_info.data[0].get("reacts_count", 0) if post_info.data else 0
            comments_count = post_info.data[0].get("comments_count", 0) if post_info.data else 0
            
            if post_owner != user_id:
                await publish_event("post.commented", {
                    "user_id": post_owner,
                    "commenter_id": user_id,
                    "commenter_username": None,
                    "comment_content": content,
                    "title_template": "Bài viết của bạn có bình luận mới!",
                    "body_template": f"Ai đó đã bình luận: {content}",
                    "link_url": f"/posts/{post_id}#comment-{created_comment.get('comment_id')}",
                    "post_id": post_id,
                    "likes": likes_count,
                    "comments": comments_count
                })
        except Exception as e:
            print(f"[Notification] Failed to publish post.commented event: {str(e)}")

        return CommentSingleResponse(
            status="success",
            message="Comment created successfully",
            data=CommentObject(**created_comment),
            _links=build_links(post_id, created_comment.get("comment_id"))
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


# ============= GET /posts/{post_id}/comments/{comment_id} - Lấy chi tiết comment =============
@router.get("/posts/{post_id}/comments/{comment_id}", response_model=CommentSingleResponse)
async def get_comment_by_id(
    post_id: str = Path(..., description="ID của bài viết"),
    comment_id: str = Path(..., description="ID của comment")
):
    """Lấy chi tiết một comment cụ thể"""
    try:
        result = supabase.table(COMMENTS_TABLE).select("*")\
            .eq("comment_id", comment_id)\
            .eq("post_id", post_id)\
            .execute()
        
        if not result.data or len(result.data) == 0:
            raise HTTPException(status_code=404, detail=f"Comment '{comment_id}' not found in post '{post_id}'")
        
        comment = result.data[0]
        
        return CommentSingleResponse(
            status="success",
            message="Comment retrieved successfully",
            data=CommentObject(**comment),
            _links=build_links(post_id, comment_id)
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


# ============= PATCH /posts/{post_id}/comments/{comment_id} - Cập nhật comment =============
@router.patch("/posts/{post_id}/comments/{comment_id}", response_model=CommentSingleResponse)
async def update_comment(
    post_id: str = Path(..., description="ID của bài viết"),
    comment_id: str = Path(..., description="ID của comment"),
    content: Optional[str] = Form(None),
    tags: Optional[List[str]] = Form(None),
    files: Optional[List[UploadFile]] = File(None),
    x_user_id: Optional[str] = Header(None, alias="X-User-ID")
):
    """Cập nhật comment - xóa files cũ và upload files mới"""
    user_id = get_user_id(x_user_id)
    
    try:
        result = supabase.table(COMMENTS_TABLE).select("*")\
            .eq("comment_id", comment_id)\
            .eq("post_id", post_id)\
            .execute()
        
        if not result.data or len(result.data) == 0:
            raise HTTPException(status_code=404, detail=f"Comment '{comment_id}' not found in post '{post_id}'")
        
        comment = result.data[0]
        
        if comment.get("user_id") != user_id:
            raise HTTPException(status_code=403, detail="You don't have permission to update this comment")
        
        # Delete old media files from storage
        old_media_urls = comment.get("media_urls", [])
        if old_media_urls:
            await delete_files_from_storage(old_media_urls)
        
        # Upload new files
        media_urls = []
        if files:
            for file in files:
                if file.filename:  # Skip empty files
                    url = await upload_to_supabase(file)
                    media_urls.append(url)
        
        update_data = {}
        if content is not None:
            update_data["content"] = content
        # Always update media_urls (even if empty to clear old files)
        update_data["media_urls"] = media_urls if media_urls else None
        if tags is not None:
            update_data["tags"] = tags
        
        if len(update_data) == 1 and "media_urls" in update_data and not files:
            # If only media_urls would be updated but no files provided, still valid (clearing media)
            pass
        elif not update_data:
            raise HTTPException(status_code=400, detail="No fields to update")
        
        update_data["is_edited"] = True
        
        result = supabase.table(COMMENTS_TABLE).update(update_data).eq("comment_id", comment_id).execute()
        
        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to update comment")
        
        updated_comment = result.data[0]
        
        return CommentSingleResponse(
            status="success",
            message="Comment updated successfully",
            data=CommentObject(**updated_comment),
            _links=build_links(post_id, comment_id)
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


# ============= DELETE /posts/{post_id}/comments/{comment_id} - Xóa comment =============
@router.delete("/posts/{post_id}/comments/{comment_id}", status_code=204)
async def delete_comment(
    post_id: str = Path(..., description="ID của bài viết"),
    comment_id: str = Path(..., description="ID của comment"),
    x_user_id: Optional[str] = Header(None, alias="X-User-ID")
):
    """Xóa comment"""
    user_id = get_user_id(x_user_id)
    
    try:
        result = supabase.table(COMMENTS_TABLE).select("*")\
            .eq("comment_id", comment_id)\
            .eq("post_id", post_id)\
            .execute()
        
        if not result.data or len(result.data) == 0:
            raise HTTPException(status_code=404, detail=f"Comment '{comment_id}' not found in post '{post_id}'")
        
        comment = result.data[0]
        
        if comment.get("user_id") != user_id:
            raise HTTPException(status_code=403, detail="You don't have permission to delete this comment")
        
        supabase.table(COMMENTS_TABLE).delete().eq("comment_id", comment_id).execute()
        
        # Update post comments_count (-1)
        count_result = supabase.table(COMMENTS_TABLE).select("comment_id", count="exact")\
            .eq("post_id", post_id).execute()
        
        supabase.table(POSTS_TABLE).update({
            "comments_count": count_result.count if hasattr(count_result, 'count') else 0
        }).eq("post_id", post_id).execute()
        
        # Publish post.uncommented event for feed-service
        try:
            from rabbitmq_producer import publish_event
            # Get current counts
            post_info = supabase.table(POSTS_TABLE).select("reacts_count, comments_count").eq("post_id", post_id).execute()
            likes_count = post_info.data[0].get("reacts_count", 0) if post_info.data else 0
            comments_count = post_info.data[0].get("comments_count", 0) if post_info.data else 0
            
            await publish_event("post.uncommented", {
                "post_id": post_id,
                "likes": likes_count,
                "comments": comments_count
            })
        except Exception as e:
            print(f"[Feed] Failed to publish post.uncommented event: {str(e)}")
        
        return None
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

"""
Reactions Service - RESTful API for Reactions on Posts and Comments
Tuân thủ OpenAPI specification
"""
import os
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Query, Path, Header
from dotenv import load_dotenv
from supabase import create_client
from models import (
    ReactionUpsert, ReactionObject,
    ReactionSingleResponse, ReactionListResponse,
    Pagination, Metadata, Link
)

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
POST_REACTIONS_TABLE = os.getenv("POST_REACTIONS_TABLE_NAME", "post_reaction")
COMMENT_REACTIONS_TABLE = os.getenv("COMMENT_REACTIONS_TABLE_NAME", "comment_reaction")
POSTS_TABLE = os.getenv("POSTS_TABLE_NAME", "posts")
COMMENTS_TABLE = os.getenv("COMMENTS_TABLE_NAME", "comments")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise RuntimeError("Missing SUPABASE_URL or SUPABASE_KEY in environment")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
router = APIRouter(tags=["Reactions"])


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


def build_links(resource_type: str, resource_id: str) -> dict:
    """Build HATEOAS links for reactions"""
    if resource_type == "post":
        base = f"/api/v1/posts/{resource_id}/reactions"
    else:  # comment
        base = f"/api/v1/comments/{resource_id}/reactions"
    
    links = {
        "self": Link(href=base, method="GET"),
        "upsert": Link(href=base, method="POST"),
        "delete": Link(href=base, method="DELETE"),
    }
    
    return {k: v.dict() for k, v in links.items()}


# ============= GET /posts/{post_id}/reactions - Lấy reactions của post =============
@router.get("/posts/{post_id}/reactions", response_model=ReactionListResponse)
async def get_post_reactions(
    post_id: str = Path(..., description="ID của bài viết"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    cursor: Optional[str] = Query(None),
    reaction_type: Optional[str] = Query(None, regex="^(like|love|haha|wow|sad|angry)$")
):
    """
    Lấy danh sách reactions của một bài viết
    """
    try:
        # Check if post exists
        post_result = supabase.table(POSTS_TABLE).select("post_id").eq("post_id", post_id).execute()
        if not post_result.data:
            raise HTTPException(status_code=404, detail=f"Post '{post_id}' not found")
        
        # Build query
        query = supabase.table(POST_REACTIONS_TABLE).select("*", count="exact").eq("post_id", post_id)
        
        if reaction_type:
            query = query.eq("reaction_type", reaction_type)
        
        if cursor:
            query = query.gt("post_react_id", cursor)
        
        query = query.range(offset, offset + limit - 1)
        result = query.execute()
        
        reactions = result.data or []
        total_items = result.count if hasattr(result, 'count') else len(reactions)
        
        return ReactionListResponse(
            status="success",
            message=f"Retrieved {len(reactions)} reactions",
            data=reactions,
            _links=build_links("post", post_id),
            metadata=Metadata(
                pagination=Pagination(
                    limit=limit,
                    offset=offset,
                    total_items=total_items
                )
            )
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


# ============= POST /posts/{post_id}/reactions - Thêm/cập nhật reaction (UPSERT) =============
@router.post("/posts/{post_id}/reactions", response_model=ReactionSingleResponse)
async def upsert_post_reaction(
    post_id: str = Path(..., description="ID của bài viết"),
    reaction_data: ReactionUpsert = ...,
    x_user_id: Optional[str] = Header(None, alias="X-User-ID")
):
    """
    Thêm hoặc cập nhật reaction cho bài viết (UPSERT)
    Nếu user đã react, sẽ update reaction_type
    """
    user_id = get_user_id(x_user_id)
    
    try:
        # Check if post exists
        post_result = supabase.table(POSTS_TABLE).select("post_id").eq("post_id", post_id).execute()
        if not post_result.data:
            raise HTTPException(status_code=404, detail=f"Post '{post_id}' not found")
        
        # Check if user already reacted
        existing = supabase.table(POST_REACTIONS_TABLE).select("*")\
            .eq("post_id", post_id)\
            .eq("user_id", user_id)\
            .execute()
        
        if existing.data:
            # Update existing reaction
            reaction_id = existing.data[0]["post_react_id"]
            result = supabase.table(POST_REACTIONS_TABLE)\
                .update({"reaction_type": reaction_data.reaction_type})\
                .eq("post_react_id", reaction_id)\
                .execute()
            
            message = "Reaction updated successfully"
        else:
            # Insert new reaction
            new_reaction = {
                "user_id": user_id,
                "post_id": post_id,
                "reaction_type": reaction_data.reaction_type,
            }
            result = supabase.table(POST_REACTIONS_TABLE).insert(new_reaction).execute()
            message = "Reaction created successfully"
            
            # Update post reacts_count (+1 for new reaction)
            count_result = supabase.table(POST_REACTIONS_TABLE).select("post_react_id", count="exact")\
                .eq("post_id", post_id).execute()
            new_count = count_result.count if hasattr(count_result, 'count') else 0
            
            supabase.table(POSTS_TABLE).update({
                "reacts_count": new_count
            }).eq("post_id", post_id).execute()
        
        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to upsert reaction")
        
        reaction = result.data[0]
        
        return ReactionSingleResponse(
            status="success",
            message=message,
            data=ReactionObject(**reaction),
            _links=build_links("post", post_id)
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


# ============= DELETE /posts/{post_id}/reactions - Bỏ reaction =============
@router.delete("/posts/{post_id}/reactions", status_code=204)
async def delete_post_reaction(
    post_id: str = Path(..., description="ID của bài viết"),
    x_user_id: Optional[str] = Header(None, alias="X-User-ID")
):
    """
    Bỏ reaction của user cho bài viết
    """
    user_id = get_user_id(x_user_id)
    
    try:
        # Find reaction
        result = supabase.table(POST_REACTIONS_TABLE).select("*")\
            .eq("post_id", post_id)\
            .eq("user_id", user_id)\
            .execute()
        
        if not result.data:
            raise HTTPException(status_code=404, detail="Reaction not found")
        
        # Delete reaction
        reaction_id = result.data[0]["post_react_id"]
        supabase.table(POST_REACTIONS_TABLE).delete().eq("post_react_id", reaction_id).execute()
        
        # Update post reacts_count (-1)
        count_result = supabase.table(POST_REACTIONS_TABLE).select("post_react_id", count="exact")\
            .eq("post_id", post_id).execute()
        new_count = count_result.count if hasattr(count_result, 'count') else 0
        
        supabase.table(POSTS_TABLE).update({
            "reacts_count": new_count
        }).eq("post_id", post_id).execute()
        
        return None
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


# ============= GET /comments/{comment_id}/reactions - Lấy reactions của comment =============
@router.get("/comments/{comment_id}/reactions", response_model=ReactionListResponse)
async def get_comment_reactions(
    comment_id: str = Path(..., description="ID của comment"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    """
    Lấy danh sách reactions của một comment
    """
    try:
        # Check if comment exists
        comment_result = supabase.table(COMMENTS_TABLE).select("comment_id").eq("comment_id", comment_id).execute()
        if not comment_result.data:
            raise HTTPException(status_code=404, detail=f"Comment '{comment_id}' not found")
        
        # Build query
        query = supabase.table(COMMENT_REACTIONS_TABLE).select("*", count="exact")\
            .eq("comment_id", comment_id)\
            .range(offset, offset + limit - 1)
        
        result = query.execute()
        reactions = result.data or []
        total_items = result.count if hasattr(result, 'count') else len(reactions)
        
        return ReactionListResponse(
            status="success",
            message=f"Retrieved {len(reactions)} reactions",
            data=reactions,
            _links=build_links("comment", comment_id),
            metadata=Metadata(
                pagination=Pagination(
                    limit=limit,
                    offset=offset,
                    total_items=total_items
                )
            )
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


# ============= POST /comments/{comment_id}/reactions - Thêm/cập nhật reaction comment =============
@router.post("/comments/{comment_id}/reactions", response_model=ReactionSingleResponse)
async def upsert_comment_reaction(
    comment_id: str = Path(..., description="ID của comment"),
    reaction_data: ReactionUpsert = ...,
    x_user_id: Optional[str] = Header(None, alias="X-User-ID")
):
    """
    Thêm hoặc cập nhật reaction cho comment (UPSERT)
    """
    user_id = get_user_id(x_user_id)
    
    try:
        # Check if comment exists
        comment_result = supabase.table(COMMENTS_TABLE).select("comment_id").eq("comment_id", comment_id).execute()
        if not comment_result.data:
            raise HTTPException(status_code=404, detail=f"Comment '{comment_id}' not found")
        
        # Check if user already reacted
        existing = supabase.table(COMMENT_REACTIONS_TABLE).select("*")\
            .eq("comment_id", comment_id)\
            .eq("user_id", user_id)\
            .execute()
        
        if existing.data:
            # Update existing reaction
            reaction_id = existing.data[0]["com_react_id"]
            result = supabase.table(COMMENT_REACTIONS_TABLE)\
                .update({"reaction_type": reaction_data.reaction_type})\
                .eq("com_react_id", reaction_id)\
                .execute()
            
            message = "Reaction updated successfully"
        else:
            # Insert new reaction
            new_reaction = {
                "user_id": user_id,
                "comment_id": comment_id,
                "reaction_type": reaction_data.reaction_type,
            }
            result = supabase.table(COMMENT_REACTIONS_TABLE).insert(new_reaction).execute()
            message = "Reaction created successfully"
            
            # Update comment reacts_count (+1 for new reaction)
            count_result = supabase.table(COMMENT_REACTIONS_TABLE).select("com_react_id", count="exact")\
                .eq("comment_id", comment_id).execute()
            new_count = count_result.count if hasattr(count_result, 'count') else 0
            
            supabase.table(COMMENTS_TABLE).update({
                "reacts_count": new_count
            }).eq("comment_id", comment_id).execute()
        
        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to upsert reaction")
        
        reaction = result.data[0]
        
        return ReactionSingleResponse(
            status="success",
            message=message,
            data=ReactionObject(**reaction),
            _links=build_links("comment", comment_id)
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


# ============= DELETE /comments/{comment_id}/reactions - Bỏ reaction comment =============
@router.delete("/comments/{comment_id}/reactions", status_code=204)
async def delete_comment_reaction(
    comment_id: str = Path(..., description="ID của comment"),
    x_user_id: Optional[str] = Header(None, alias="X-User-ID")
):
    """
    Bỏ reaction của user cho comment
    """
    user_id = get_user_id(x_user_id)
    
    try:
        # Find reaction
        result = supabase.table(COMMENT_REACTIONS_TABLE).select("*")\
            .eq("comment_id", comment_id)\
            .eq("user_id", user_id)\
            .execute()
        
        if not result.data:
            raise HTTPException(status_code=404, detail="Reaction not found")
        
        # Delete reaction
        reaction_id = result.data[0]["com_react_id"]
        supabase.table(COMMENT_REACTIONS_TABLE).delete().eq("com_react_id", reaction_id).execute()
        
        # Update comment reacts_count (-1)
        count_result = supabase.table(COMMENT_REACTIONS_TABLE).select("com_react_id", count="exact")\
            .eq("comment_id", comment_id).execute()
        new_count = count_result.count if hasattr(count_result, 'count') else 0
        
        supabase.table(COMMENTS_TABLE).update({
            "reacts_count": new_count
        }).eq("comment_id", comment_id).execute()
        
        return None
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

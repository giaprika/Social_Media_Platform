"""
Pydantic models for API requests and responses
Following OpenAPI specification
"""
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
from datetime import datetime
from enumType import ReactionType, Visibility


# ============= COMMON SCHEMAS =============
class Link(BaseModel):
    href: str
    method: str


class Pagination(BaseModel):
    limit: int
    offset: int
    total_items: Optional[int] = None
    cursor: Optional[str] = None


class Metadata(BaseModel):
    pagination: Optional[Pagination] = None


# ============= POST SCHEMAS =============
class PostCreate(BaseModel):
    content: Optional[str] = Field(None, description="Nội dung bài viết")
    media_urls: Optional[List[str]] = Field(None, description="List URLs của media đã upload lên Storage")
    tags: Optional[List[str]] = None
    post_share_id: Optional[str] = Field(None, description="ID bài viết được chia sẻ")
    group_id: Optional[str] = Field(None, description="ID Group đăng bài")
    visibility: Optional[str] = Field(default=Visibility.PUBLIC.value, description="Chế độ hiển thị")


class PostUpdate(BaseModel):
    content: Optional[str] = None
    media_urls: Optional[List[str]] = None
    tags: Optional[List[str]] = None
    visibility: Optional[str] = None


class PostObject(BaseModel):
    post_id: str
    user_id: str
    content: Optional[str] = None
    media_urls: Optional[List[str]] = None
    tags: Optional[List[str]] = None
    post_share_id: Optional[str] = None
    group_id: Optional[str] = None
    visibility: Optional[str] = None
    reacts_count: int = 0
    comments_count: int = 0
    shares_count: int = 0
    created_at: datetime
    updated_at: datetime
    is_edited: bool = False
    status: Optional[bool] = True


class PostSingleResponse(BaseModel):
    status: str = "success"
    message: str
    data: PostObject
    _links: Optional[Dict[str, Link]] = None


class PostListResponse(BaseModel):
    status: str = "success"
    message: str
    data: List[PostObject]
    _links: Optional[Dict[str, Link]] = None
    metadata: Optional[Metadata] = None


# ============= REACTION SCHEMAS =============
class ReactionUpsert(BaseModel):
    reaction_type: str = Field(..., description="Loại reaction")


class ReactionObject(BaseModel):
    user_id: str
    post_id: Optional[str] = None
    comment_id: Optional[str] = None
    reaction_type: str
    created_at: datetime
    
    # post_react_id or com_react_id will be added dynamically
    class Config:
        extra = 'allow'


class ReactionSingleResponse(BaseModel):
    status: str = "success"
    message: str
    data: ReactionObject
    _links: Optional[Dict[str, Link]] = None


class ReactionListResponse(BaseModel):
    status: str = "success"
    message: str
    data: List[ReactionObject]
    _links: Optional[Dict[str, Link]] = None
    metadata: Optional[Metadata] = None


# ============= COMMENT SCHEMAS =============
class CommentCreate(BaseModel):
    content: Optional[str] = Field(None, description="Nội dung comment")
    media_urls: Optional[List[str]] = None
    tags: Optional[List[str]] = None
    parent_id: Optional[str] = Field(None, description="ID Comment cha nếu là Reply")


class CommentUpdate(BaseModel):
    content: Optional[str] = None
    media_urls: Optional[List[str]] = None
    tags: Optional[List[str]] = None


class CommentObject(BaseModel):
    comment_id: str
    user_id: str
    post_id: str
    content: Optional[str] = None
    media_urls: Optional[List[str]] = None
    tags: Optional[List[str]] = None
    parent_id: Optional[str] = None
    reacts_count: int = 0
    created_at: datetime
    updated_at: datetime
    is_edited: bool = False


class CommentSingleResponse(BaseModel):
    status: str = "success"
    message: str
    data: CommentObject
    _links: Optional[Dict[str, Link]] = None


class CommentListResponse(BaseModel):
    status: str = "success"
    message: str
    data: List[CommentObject]
    _links: Optional[Dict[str, Link]] = None
    metadata: Optional[Metadata] = None


# ============= ERROR SCHEMAS =============
class ErrorDetail(BaseModel):
    field: Optional[str] = None
    message: str


class ErrorResponse(BaseModel):
    status: str = "error"
    code: str
    message: str
    details: Optional[List[ErrorDetail]] = None

import { useState, useRef, useEffect } from "react";
import { formatDistanceToNow } from "date-fns";
import { vi } from "date-fns/locale";
import {
  HeartIcon,
  ChatBubbleOvalLeftIcon,
  EllipsisHorizontalIcon,
  PencilIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import {
  HeartIcon as HeartIconSolid,
} from "@heroicons/react/24/solid";
import Cookies from "universal-cookie";
import Avatar from "../ui/Avatar";
import Button from "../ui/Button";
import Input from "../ui/Input";
import Skeleton from "../ui/Skeleton";

const cookies = new Cookies();

const CommentItem = ({ comment, onLike, onReply, onEdit, onDelete, depth = 0, maxDepth = 3 }) => {
  const currentUserId = cookies.get("x-user-id");
  const [showReplies, setShowReplies] = useState(true);
  const [isReplying, setIsReplying] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [editText, setEditText] = useState(comment.content);
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef(null);

  const isOwnComment = currentUserId === comment.author?.id;

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setShowMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const formatTime = (timestamp) => {
    if (!timestamp) return "Vừa xong";
    try {
      return formatDistanceToNow(new Date(timestamp), {
        addSuffix: true,
        locale: vi,
      });
    } catch {
      return "Vừa xong";
    }
  };

  const handleReply = () => {
    if (replyText.trim()) {
      onReply?.(comment.id, replyText.trim());
      setReplyText("");
      setIsReplying(false);
    }
  };

  const handleEdit = () => {
    if (editText.trim() && editText !== comment.content) {
      onEdit?.(comment.id, editText.trim());
      setIsEditing(false);
    } else {
      setIsEditing(false);
      setEditText(comment.content);
    }
  };

  const handleDelete = () => {
    if (window.confirm("Bạn có chắc chắn muốn xóa bình luận này?")) {
      onDelete?.(comment.id);
    }
    setShowMenu(false);
  };

  const canReply = depth < maxDepth;

  return (
      <div className={depth > 0 ? "ml-8 mt-4 border-l-2 border-border pl-4" : ""}>
      <div className="flex gap-3">
        <Avatar
          src={comment.author?.avatar_url || comment.author?.avatar}
          name={comment.author?.username || comment.author?.name || comment.author}
          size="sm"
        />
        <div className="flex-1">
          <div className="rounded-lg bg-muted/50 p-3 relative">
            <div className="mb-1 flex items-center gap-2">
              <span className="text-sm font-semibold text-foreground">
                {comment.author?.username || comment.author?.name || comment.author}
              </span>
              <span className="text-xs text-muted-foreground">
                {formatTime(comment.createdAt || comment.timestamp)}
              </span>
              {comment.is_edited && (
                <span className="text-xs text-muted-foreground">(đã chỉnh sửa)</span>
              )}
              
              {/* 3-dot menu for own comments */}
              {isOwnComment && (
                <div className="ml-auto relative" ref={menuRef}>
                  <button
                    type="button"
                    onClick={() => setShowMenu(!showMenu)}
                    className="p-1 rounded-full hover:bg-muted transition-colors"
                  >
                    <EllipsisHorizontalIcon className="h-4 w-4 text-muted-foreground" />
                  </button>
                  
                  {showMenu && (
                    <div className="absolute right-0 top-full mt-1 w-32 bg-card border border-border rounded-lg shadow-lg z-50 py-1">
                      <button
                        type="button"
                        onClick={() => {
                          setIsEditing(true);
                          setShowMenu(false);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-muted transition-colors"
                      >
                        <PencilIcon className="h-3 w-3" />
                        Chỉnh sửa
                      </button>
                      <button
                        type="button"
                        onClick={handleDelete}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-destructive hover:bg-muted transition-colors"
                      >
                        <TrashIcon className="h-3 w-3" />
                        Xóa
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
            
            {/* Edit mode */}
            {isEditing ? (
              <div className="space-y-2">
                <textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  rows={2}
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-colors resize-none"
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleEdit} disabled={!editText.trim()}>
                    Lưu
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setIsEditing(false);
                      setEditText(comment.content);
                    }}
                  >
                    Hủy
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-foreground whitespace-pre-wrap">
                {comment.content}
              </p>
            )}
          </div>

          <div className="mt-2 flex items-center gap-4">
            <button
              type="button"
              onClick={() => onLike?.(comment.id, comment.liked)}
              className={`flex items-center gap-1 text-xs transition-colors ${
                comment.liked
                  ? "text-red-500"
                  : "text-muted-foreground hover:text-red-500"
              }`}
            >
              {comment.liked ? (
                <HeartIconSolid className="h-4 w-4 text-red-500" />
              ) : (
                <HeartIcon className="h-4 w-4" />
              )}
              <span>{comment.likes || 0}</span>
            </button>

            {canReply && (
              <button
                type="button"
                onClick={() => setIsReplying(!isReplying)}
                className="text-xs text-muted-foreground hover:text-primary transition-colors"
              >
                Phản hồi
              </button>
            )}

            {comment.replies && comment.replies.length > 0 && (
              <button
                type="button"
                onClick={() => setShowReplies(!showReplies)}
                className="text-xs text-muted-foreground hover:text-primary transition-colors"
              >
                {showReplies
                  ? `Ẩn ${comment.replies.length} phản hồi`
                  : `Hiện ${comment.replies.length} phản hồi`}
              </button>
            )}
          </div>

          {isReplying && (
            <div className="mt-3 space-y-2">
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Viết phản hồi..."
                rows={2}
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-colors resize-none"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleReply}
                  disabled={!replyText.trim()}
                >
                  Phản hồi
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setIsReplying(false);
                    setReplyText("");
                  }}
                >
                  Hủy
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {showReplies &&
        comment.replies &&
        comment.replies.length > 0 &&
        comment.replies.map((reply) => (
          <CommentItem
            key={reply.id}
            comment={reply}
            onLike={onLike}
            onReply={onReply}
            onEdit={onEdit}
            onDelete={onDelete}
            depth={depth + 1}
            maxDepth={maxDepth}
          />
        ))}
    </div>
  );
};

const CommentSection = ({
  postId,
  comments = [],
  loading = false,
  onAddComment,
  onLikeComment,
  onReplyComment,
  onEditComment,
  onDeleteComment,
}) => {
  const [commentText, setCommentText] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    if (commentText.trim()) {
      onAddComment?.(postId, commentText.trim());
      setCommentText("");
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex gap-3">
            <Skeleton variant="circular" className="h-8 w-8" />
            <div className="flex-1">
              <Skeleton className="mb-2 h-4 w-32" />
              <Skeleton className="h-16 w-full" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <Input
          value={commentText}
          onChange={(e) => setCommentText(e.target.value)}
          placeholder="Viết bình luận..."
          className="flex-1"
        />
        <Button type="submit" disabled={!commentText.trim()}>
          Gửi
        </Button>
      </form>

      <div className="space-y-4">
        {comments.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Chưa có bình luận nào. Hãy là người đầu tiên bình luận!
          </p>
        ) : (
          comments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              onLike={onLikeComment}
              onReply={onReplyComment}
              onEdit={onEditComment}
              onDelete={onDeleteComment}
            />
          ))
        )}
      </div>
    </div>
  );
};

export default CommentSection;


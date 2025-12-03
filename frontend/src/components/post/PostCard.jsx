import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { vi } from "date-fns/locale";
import {
  HeartIcon,
  ChatBubbleOvalLeftIcon,
  ShareIcon,
  BookmarkIcon,
  PlusIcon,
  CheckIcon,
  EllipsisHorizontalIcon,
  EyeSlashIcon,
  FlagIcon,
  PencilIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import {
  HeartIcon as HeartIconSolid,
  BookmarkIcon as BookmarkIconSolid,
} from "@heroicons/react/24/solid";
import clsx from "clsx";
import Card from "../ui/Card";
import Avatar from "../ui/Avatar";
import Skeleton from "../ui/Skeleton";
import LinkPreview from "../ui/LinkPreview";

const PostCard = ({
  post,
  currentUserId,
  onUpvote,
  onDownvote,
  onComment,
  onShare,
  onSave,
  onAuthorClick,
  onFollow,
  onCommunityClick,
  onEdit,
  onDelete,
  onHide,
  onReport,
  loading = false,
}) => {
  const navigate = useNavigate();
  const [imageError, setImageError] = useState(false);
  const [isFollowing, setIsFollowing] = useState(post?.isFollowing || false);
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef(null);

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

  if (loading) {
    return (
      <Card>
        <div className="mb-3 flex items-center gap-3">
          <Skeleton variant="circular" className="h-10 w-10" />
          <div className="flex-1">
            <Skeleton className="mb-2 h-4 w-32" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
        <Skeleton className="mb-2 h-6 w-3/4" />
        <Skeleton className="mb-4 h-4 w-full" />
        <Skeleton className="mb-4 h-48 w-full" />
        <div className="flex items-center gap-6 border-t border-border pt-3">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-16" />
        </div>
      </Card>
    );
  }

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

  const handleFollow = () => {
    setIsFollowing((prev) => !prev);
    onFollow?.(post.author?.id || post.authorId, !isFollowing);
  };

  const likes = post.likes || post.upvotes || 0;
  const hasLiked = post.hasLiked || post.hasUpvoted || false;
  const community = post.community || post.group_id;
  const authorName = post.author?.name || post.author?.full_name || post.author;
  const authorUsername = post.author?.username || authorName;
  const authorAvatar = post.author?.avatar_url || post.author?.avatar;
  const isOwnPost = currentUserId === (post.author?.id || post.authorId);

  // Navigate to post detail page - use postId directly in URL
  const handlePostClick = (e) => {
    // Don't navigate if clicking on interactive elements
    if (e.target.closest("button") || e.target.closest("a") || e.target.closest("video")) {
      return;
    }
    navigate(`/app/p/${post.id}`);
  };

  // Handle comment click - navigate to post detail
  const handleCommentClick = () => {
    navigate(`/app/p/${post.id}`);
  };

  // Menu actions
  const handleEdit = () => {
    setShowMenu(false);
    onEdit?.(post);
  };

  const handleDelete = () => {
    setShowMenu(false);
    if (window.confirm("Bạn có chắc chắn muốn xóa bài viết này?")) {
      onDelete?.(post.id);
    }
  };

  const handleHide = () => {
    setShowMenu(false);
    onHide?.(post.id);
  };

  const handleSaveFromMenu = () => {
    setShowMenu(false);
    onSave?.(post.id);
  };

  const handleReport = () => {
    setShowMenu(false);
    onReport?.(post.id);
  };

  return (
    <Card hover>
      <div className="w-full cursor-pointer" onClick={handlePostClick}>
        {/* Header */}
        <div className="mb-3 flex items-center gap-2 flex-wrap">
          <Avatar
            src={authorAvatar}
            name={authorUsername}
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onAuthorClick?.(post.author?.id || post.authorId);
            }}
          />
          {/* Luôn hiển thị u/username trước */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onAuthorClick?.(post.author?.id || post.authorId);
            }}
            className="text-xs font-semibold text-foreground hover:text-primary transition-colors"
          >
            u/{authorUsername}
          </button>
          {/* Nếu có community thì hiển thị c/community */}
          {community && (
            <>
              <span className="text-xs text-muted-foreground">•</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCommunityClick?.(community);
                }}
                className="text-xs font-semibold text-foreground hover:text-primary transition-colors"
              >
                c/{community}
              </button>
            </>
          )}
          <span className="text-xs text-muted-foreground">•</span>
          <p className="text-xs text-muted-foreground">
            {formatTime(post.createdAt || post.timestamp)}
          </p>

          {/* 3-dot menu */}
          <div className="ml-auto relative" ref={menuRef}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu(!showMenu);
              }}
              className="p-1.5 rounded-full hover:bg-muted transition-colors"
            >
              <EllipsisHorizontalIcon className="h-5 w-5 text-muted-foreground" />
            </button>

            {/* Dropdown Menu */}
            {showMenu && (
              <div className="absolute right-0 top-full mt-1 w-48 bg-card border border-border rounded-lg shadow-lg z-50 py-1">
                {isOwnPost && (
                  <>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEdit();
                      }}
                      className="w-full flex items-center gap-2 px-4 py-2 text-sm text-foreground hover:bg-muted transition-colors"
                    >
                      <PencilIcon className="h-4 w-4" />
                      Chỉnh sửa
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete();
                      }}
                      className="w-full flex items-center gap-2 px-4 py-2 text-sm text-destructive hover:bg-muted transition-colors"
                    >
                      <TrashIcon className="h-4 w-4" />
                      Xóa bài viết
                    </button>
                    <div className="border-t border-border my-1" />
                  </>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleHide();
                  }}
                  className="w-full flex items-center gap-2 px-4 py-2 text-sm text-foreground hover:bg-muted transition-colors"
                >
                  <EyeSlashIcon className="h-4 w-4" />
                  Ẩn bài viết
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSaveFromMenu();
                  }}
                  className="w-full flex items-center gap-2 px-4 py-2 text-sm text-foreground hover:bg-muted transition-colors"
                >
                  <BookmarkIcon className="h-4 w-4" />
                  {post.saved ? "Bỏ lưu" : "Lưu bài viết"}
                </button>
                {!isOwnPost && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleReport();
                    }}
                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-destructive hover:bg-muted transition-colors"
                  >
                    <FlagIcon className="h-4 w-4" />
                    Báo cáo
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Title - Main clickable area */}
        {post.title && (
          <h2 className="mb-2 text-lg font-bold text-foreground hover:text-primary transition-colors">
            {post.title}
          </h2>
        )}

        {/* Thumbnail preview for media posts - show small preview if has images */}
        {post.images && post.images.length > 0 && !imageError && (
          <div className="mb-3 relative">
            {(() => {
              const url = post.images[0];
              const isVideo = /\.(mp4|webm|mov|avi|mkv|m4v|ogg)$/i.test(url);
              if (isVideo) {
                return (
                  <div className="relative bg-black rounded-lg overflow-hidden h-48">
                    <video
                      src={url}
                      preload="metadata"
                      className="w-full h-full object-cover"
                      onError={() => setImageError(true)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30 pointer-events-none">
                      <div className="w-12 h-12 rounded-full bg-white/80 flex items-center justify-center">
                        <svg className="w-6 h-6 text-gray-800 ml-1" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </div>
                    </div>
                    {post.images.length > 1 && (
                      <span className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
                        +{post.images.length - 1}
                      </span>
                    )}
                  </div>
                );
              }
              return (
                <div className="relative">
                  <img
                    src={url}
                    alt={post.title || "Post image"}
                    className="w-full rounded-lg object-cover max-h-64"
                    onError={() => setImageError(true)}
                  />
                  {post.images.length > 1 && (
                    <span className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
                      +{post.images.length - 1}
                    </span>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* Link Preview */}
        {post.url && <LinkPreview url={post.url} compact />}

        {/* Actions Bar - Horizontal Layout */}
        <div className="flex items-center gap-1 pt-2 border-t border-border" onClick={(e) => e.stopPropagation()}>
          {/* Like Button */}
          <button
            type="button"
            onClick={() => onUpvote?.(post.id)}
            className={clsx(
              "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
              hasLiked
                ? "bg-destructive/10 text-destructive"
                : "text-muted-foreground hover:bg-muted hover:text-destructive"
            )}
            aria-label="Like"
          >
            {hasLiked ? (
              <HeartIconSolid className="h-5 w-5" />
            ) : (
              <HeartIcon className="h-5 w-5" />
            )}
            <span className={clsx(
              "font-bold",
              hasLiked && "text-destructive"
            )}>
              {likes > 0 ? likes : ""}
            </span>
          </button>

          {/* Comment Button - Navigate to detail */}
          <button
            type="button"
            onClick={handleCommentClick}
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ChatBubbleOvalLeftIcon className="h-5 w-5" />
            <span className="hidden sm:inline">{post.comments || 0}</span>
          </button>

          {/* Share Button */}
          <button
            type="button"
            onClick={() => onShare?.(post.id)}
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ShareIcon className="h-5 w-5" />
            <span className="hidden sm:inline">Share</span>
          </button>

          {/* Save Button */}
          <button
            type="button"
            onClick={() => onSave?.(post.id)}
            className={clsx(
              "ml-auto flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
              post.saved
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            {post.saved ? (
              <BookmarkIconSolid className="h-5 w-5" />
            ) : (
              <BookmarkIcon className="h-5 w-5" />
            )}
            <span className="hidden sm:inline">{post.saved ? "Saved" : "Save"}</span>
          </button>
        </div>
      </div>
    </Card>
  );
};

export default PostCard;


import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { vi } from "date-fns/locale";
import {
  HeartIcon,
  ChatBubbleOvalLeftIcon,
  ShareIcon,
  BookmarkIcon,
  PlusIcon,
  CheckIcon,
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
  loading = false,
}) => {
  const [imageError, setImageError] = useState(false);
  const [isFollowing, setIsFollowing] = useState(post?.isFollowing || false);

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
  const authorName = post.author?.name || post.author;
  const authorUsername = post.author?.username || authorName;

  return (
    <Card hover>
      <div className="w-full">
        {/* Header */}
        <div className="mb-3 flex items-center gap-2 flex-wrap">
          <Avatar
            src={post.author?.avatar}
            name={authorName}
            size="sm"
            onClick={() => onAuthorClick?.(post.author?.id || post.authorId)}
          />
          {community ? (
            // Post thuộc community
            <button
              type="button"
              onClick={() => onCommunityClick?.(community)}
              className="text-xs font-semibold text-foreground hover:text-primary transition-colors"
            >
              c/{community}
            </button>
          ) : (
            // Post của user (không thuộc community)
            <button
              type="button"
              onClick={() => onAuthorClick?.(post.author?.id || post.authorId)}
              className="text-xs font-semibold text-foreground hover:text-primary transition-colors"
            >
              u/{authorUsername}
            </button>
          )}
          <span className="text-xs text-muted-foreground">•</span>
          <p
            className="text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
            onClick={() => onAuthorClick?.(post.author?.id || post.authorId)}
          >
            {authorName}
          </p>
          <span className="text-xs text-muted-foreground">•</span>
          <p className="text-xs text-muted-foreground">
            {formatTime(post.createdAt || post.timestamp)}
          </p>
          {onFollow && currentUserId !== (post.author?.id || post.authorId) && (
            <button
              type="button"
              onClick={handleFollow}
              className={clsx(
                "ml-auto flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold transition-colors",
                isFollowing
                  ? "bg-muted text-foreground hover:bg-muted/80"
                  : "bg-primary text-primary-foreground hover:opacity-90"
              )}
            >
              {isFollowing ? (
                <>
                  <CheckIcon className="h-3 w-3" />
                  Following
                </>
              ) : (
                <>
                  <PlusIcon className="h-3 w-3" />
                  Follow
                </>
              )}
            </button>
          )}
        </div>

        {/* Title */}
        {post.title && (
          <h2 className="mb-2 text-lg font-bold text-foreground hover:text-primary transition-colors cursor-pointer">
            {post.title}
          </h2>
        )}

        {/* Content - chỉ hiện nếu khác title */}
        {post.content && post.content !== post.title && (
          <p className="mb-3 whitespace-pre-wrap text-sm text-muted-foreground">
            {post.content}
          </p>
        )}

        {/* Link Preview */}
        {post.url && <LinkPreview url={post.url} compact />}

        {/* Media (Images & Videos) */}
        {post.images && post.images.length > 0 && !imageError && (
          <div className="mb-3">
            {post.images.length === 1 ? (
              (() => {
                const url = post.images[0];
                const isVideo = /\.(mp4|webm|mov|avi|mkv)$/i.test(url);
                if (isVideo) {
                  return (
                    <video
                      src={url}
                      controls
                      className="w-full rounded-lg max-h-96"
                      onError={() => setImageError(true)}
                    />
                  );
                }
                return (
                  <img
                    src={url}
                    alt={post.title || "Post image"}
                    className="w-full rounded-lg object-cover max-h-96"
                    onError={() => setImageError(true)}
                  />
                );
              })()
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {post.images.slice(0, 4).map((url, idx) => {
                  const isVideo = /\.(mp4|webm|mov|avi|mkv)$/i.test(url);
                  if (isVideo) {
                    return (
                      <video
                        key={idx}
                        src={url}
                        controls
                        className="h-48 w-full rounded-lg object-cover"
                        onError={() => setImageError(true)}
                      />
                    );
                  }
                  return (
                    <img
                      key={idx}
                      src={url}
                      alt={`${post.title || "Post"} ${idx + 1}`}
                      className="h-48 w-full rounded-lg object-cover"
                      onError={() => setImageError(true)}
                    />
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Actions Bar - Horizontal Layout */}
        <div className="flex items-center gap-1 pt-2 border-t border-border">
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

          {/* Comment Button */}
          <button
            type="button"
            onClick={() => onComment?.(post.id)}
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


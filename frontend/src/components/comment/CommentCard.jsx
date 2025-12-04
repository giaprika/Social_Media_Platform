import { formatDistanceToNow } from "date-fns";
import { vi } from "date-fns/locale";
import { ChatBubbleOvalLeftIcon, HeartIcon } from "@heroicons/react/24/outline";
import { HeartIcon as HeartIconSolid } from "@heroicons/react/24/solid";
import Avatar from "../ui/Avatar";
import Card from "../ui/Card";

const CommentCard = ({ comment, onPostClick, onAuthorClick }) => {
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

  const authorName = comment.author?.name || comment.author?.username || "User";
  const authorUsername = comment.author?.username || authorName;
  const authorAvatar = comment.author?.avatar_url || comment.author?.avatar;

  return (
    <Card hover className="cursor-pointer" onClick={() => onPostClick?.(comment.post_id)}>
      <div className="flex gap-3">
        {/* Avatar */}
        <Avatar
          src={authorAvatar}
          name={authorUsername}
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            onAuthorClick?.(comment.author?.id || comment.user_id);
          }}
        />

        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-2 mb-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onAuthorClick?.(comment.author?.id || comment.user_id);
              }}
              className="text-sm font-semibold text-foreground hover:text-primary transition-colors"
            >
              {authorName}
            </button>
            <span className="text-xs text-muted-foreground">
              @{authorUsername}
            </span>
            <span className="text-xs text-muted-foreground">•</span>
            <span className="text-xs text-muted-foreground">
              {formatTime(comment.created_at)}
            </span>
          </div>

          {/* Post reference */}
          {comment.post && (
            <div className="mb-2 text-xs text-muted-foreground">
              Đã bình luận về bài viết: <span className="text-primary hover:underline">{comment.post.title || "Bài viết"}</span>
            </div>
          )}

          {/* Content */}
          <p className="text-sm text-foreground leading-relaxed mb-3">
            {comment.content}
          </p>

          {/* Media */}
          {comment.media_urls && comment.media_urls.length > 0 && (
            <div className="mb-3">
              <img
                src={comment.media_urls[0]}
                alt="Comment media"
                className="rounded-lg max-h-48 object-cover"
              />
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-4">
            <button className="flex items-center gap-1 text-muted-foreground hover:text-destructive transition-colors">
              {comment.hasLiked ? (
                <HeartIconSolid className="h-4 w-4 text-destructive" />
              ) : (
                <HeartIcon className="h-4 w-4" />
              )}
              <span className="text-xs">{comment.likes_count || 0}</span>
            </button>
            <button className="flex items-center gap-1 text-muted-foreground hover:text-primary transition-colors">
              <ChatBubbleOvalLeftIcon className="h-4 w-4" />
              <span className="text-xs">{comment.replies_count || 0}</span>
            </button>
          </div>
        </div>
      </div>
    </Card>
  );
};

export default CommentCard;

import { useNavigate } from "react-router-dom";
import clsx from "clsx";
import { formatDistanceToNow } from "date-fns";
import { vi } from "date-fns/locale";

const RecentPostsSidebar = ({ posts = [], onClear }) => {
  const navigate = useNavigate();

  const formatTime = (timestamp) => {
    if (!timestamp) return "Vừa xong";
    try {
      return formatDistanceToNow(new Date(timestamp), {
        addSuffix: false,
        locale: vi,
      });
    } catch {
      return "Vừa xong";
    }
  };

  const getFirstImage = (post) => {
    if (post.images && post.images.length > 0) {
      return post.images[0];
    }
    return null;
  };

  const truncateText = (text, maxLength = 80) => {
    if (!text) return "";
    return text.length > maxLength ? text.substring(0, maxLength) + "..." : text;
  };

  if (!posts || posts.length === 0) {
    return null;
  }

  return (
    <aside className="hidden xl:block fixed right-0 top-16 lg:top-20 h-[calc(100vh-4rem)] lg:h-[calc(100vh-5rem)] w-80 border-l border-border bg-card overflow-y-auto">
      <div className="sticky top-0 z-10 bg-card border-b border-border px-4 py-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase text-muted-foreground">
            Recent Posts
          </h2>
          {onClear && (
            <button
              type="button"
              onClick={onClear}
              className="text-xs font-medium text-primary hover:text-primary/80 transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="p-4 space-y-3">
        {posts.slice(0, 10).map((post) => {
          const image = getFirstImage(post);
          const author = post.author?.name || post.author || "Unknown";
          const community = post.community || "general";

          return (
            <article
              key={post.id}
              className="group cursor-pointer rounded-lg hover:bg-muted/50 transition-colors p-2"
              onClick={() => navigate(`/post/${post.id}`)}
            >
              <div className="flex gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-primary">
                      s/{community}
                    </span>
                    <span className="text-xs text-muted-foreground">•</span>
                    <span className="text-xs text-muted-foreground">
                      {formatTime(post.createdAt)}
                    </span>
                  </div>
                  <h3 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-2 mb-1">
                    {post.title || truncateText(post.content, 60)}
                  </h3>
                  {post.content && post.title && (
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {truncateText(post.content, 80)}
                    </p>
                  )}
                  {post.url && (
                    <p className="text-xs text-primary/70 truncate mt-1">
                      {new URL(post.url).hostname}
                    </p>
                  )}
                </div>
                {image && (
                  <div className="flex-shrink-0">
                    <img
                      src={image}
                      alt={post.title || "Post thumbnail"}
                      className="w-16 h-16 rounded-lg object-cover"
                      onError={(e) => {
                        e.target.style.display = "none";
                      }}
                    />
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </aside>
  );
};

export default RecentPostsSidebar;


import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { vi } from "date-fns/locale";
import TrendingCommunities from "../widgets/TrendingCommunities";
import SuggestedUsers from "../widgets/SuggestedUsers";
import UpcomingEvents from "../widgets/UpcomingEvents";
import FooterWidget from "../widgets/FooterWidget";

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

  return (
    <aside className="hidden xl:block fixed right-0 top-16 lg:top-20 h-[calc(100vh-4rem)] lg:h-[calc(100vh-5rem)] w-80 border-l border-border bg-background overflow-y-auto scrollbar-thin">
      <div className="p-3 space-y-3">
        {/* Recent Posts - Prioritized like Reddit */}
        {posts && posts.length > 0 && (
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="px-3 py-2.5 border-b border-border">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
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

            <div className="divide-y divide-border">
              {posts.slice(0, 6).map((post) => {
                const image = getFirstImage(post);
                const community = post.community || "general";

                return (
                  <article
                    key={post.id}
                    className="group cursor-pointer hover:bg-muted/50 transition-colors px-3 py-2.5"
                    onClick={() => navigate(`/post/${post.id}`)}
                  >
                    <div className="flex gap-2.5">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-xs font-semibold text-foreground">
                            s/{community}
                          </span>
                          <span className="text-xs text-muted-foreground">•</span>
                          <span className="text-xs text-muted-foreground">
                            {formatTime(post.createdAt)}
                          </span>
                        </div>
                        <h3 className="text-xs font-normal text-foreground group-hover:text-primary transition-colors line-clamp-2 leading-tight">
                          {post.title || truncateText(post.content, 70)}
                        </h3>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                          <span>{post.upvotes || 0} upvotes</span>
                          <span>•</span>
                          <span>{post.comments || 0} comments</span>
                        </div>
                      </div>
                      {image && (
                        <div className="flex-shrink-0">
                          <img
                            src={image}
                            alt={post.title || "Post thumbnail"}
                            className="w-16 h-16 rounded object-cover"
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
          </div>
        )}

        {/* Trending Communities */}
        <TrendingCommunities />

        {/* Suggested Users */}
        <SuggestedUsers />

        {/* Upcoming Events */}
        <UpcomingEvents />

        {/* Footer */}
        <FooterWidget />
      </div>
    </aside>
  );
};

export default RecentPostsSidebar;


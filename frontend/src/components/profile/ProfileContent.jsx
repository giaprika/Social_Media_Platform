import { ChevronDownIcon, EyeIcon, PlusIcon } from "@heroicons/react/24/outline";
import PostCard from "../post/PostCard";
import Skeleton from "../ui/Skeleton";

const ProfileContent = ({ 
  activeTab = "overview",
  posts = [],
  loading = false,
  onUpvote,
  onDownvote,
  onComment,
  onShare,
  onSave,
  onAuthorClick,
  onFollow,
  onCommunityClick,
}) => {
  const renderEmptyState = () => {
    const emptyMessages = {
      overview: "You don't have any posts yet",
      posts: "No posts yet",
      comments: "No comments yet",
      saved: "No saved posts",
      history: "No browsing history",
      hidden: "No hidden posts",
      upvoted: "No upvoted posts",
      downvoted: "No downvoted posts",
    };

    const emptyDescriptions = {
      overview: "Once you post to a community, it'll show up here. If you'd rather hide your posts, update your settings.",
      posts: "Start sharing with the community!",
      comments: "Join the conversation!",
      saved: "Save posts to read later",
      history: "Your viewing history will appear here",
      hidden: "Hidden posts will appear here",
      upvoted: "Posts you've upvoted will appear here",
      downvoted: "Posts you've downvoted will appear here",
    };

    return (
      <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
        <div className="mb-6">
          <div className="h-20 w-20 mx-auto mb-4 rounded-full bg-muted/30 flex items-center justify-center">
            <span className="text-4xl">😊</span>
          </div>
        </div>
        <h3 className="text-lg font-bold text-foreground mb-2">
          {emptyMessages[activeTab]}
        </h3>
        <p className="text-sm text-muted-foreground max-w-md mb-6 leading-relaxed">
          {emptyDescriptions[activeTab]}
        </p>
        {activeTab === "overview" && (
          <button className="px-4 py-2 rounded-full bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors">
            Update Settings
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="w-full">
      {/* Content Filter Bar */}
      <div className="flex items-center justify-between gap-3 mb-6">
        <button className="flex items-center gap-2 px-3 py-2 rounded-full bg-muted/50 text-sm font-medium text-foreground hover:bg-muted transition-colors border border-border/30">
          <EyeIcon className="h-4 w-4" />
          <span>Showing all content</span>
          <ChevronDownIcon className="h-4 w-4" />
        </button>

        <button className="flex items-center gap-2 px-4 py-2 rounded-full bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">
          <PlusIcon className="h-4 w-4" />
          <span>Create Post</span>
          <ChevronDownIcon className="h-4 w-4" />
        </button>
      </div>

      {/* Content Area */}
      <div className="space-y-4">
        {loading ? (
          <>
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-lg border border-border bg-card p-4">
                <Skeleton className="h-6 w-3/4 mb-2" />
                <Skeleton className="h-4 w-full mb-2" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            ))}
          </>
        ) : posts.length === 0 ? (
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            {renderEmptyState()}
          </div>
        ) : (
          posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              onUpvote={onUpvote}
              onDownvote={onDownvote}
              onComment={onComment}
              onShare={onShare}
              onSave={onSave}
              onAuthorClick={onAuthorClick}
              onFollow={onFollow}
              onCommunityClick={onCommunityClick}
            />
          ))
        )}
      </div>
    </div>
  );
};

export default ProfileContent;


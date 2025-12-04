import { ChevronDownIcon, EyeIcon, PlusIcon, ClockIcon, BookmarkIcon } from "@heroicons/react/24/outline";
import PostCard from "../post/PostCard";
import CommentCard from "../comment/CommentCard";
import Skeleton from "../ui/Skeleton";

const ProfileContent = ({ 
  activeTab = "overview",
  posts = [],
  comments = [],
  likedPosts = [],
  loading = false,
  isOwnProfile = false,
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
  onCreatePost,
}) => {
  const renderEmptyState = () => {
    const emptyMessages = {
      overview: isOwnProfile ? "Bạn chưa có bài viết nào" : "Chưa có bài viết",
      posts: "Chưa có bài viết",
      comments: "Chưa có bình luận",
      saved: "Chưa có bài viết đã lưu",
      likes: "Chưa có bài viết đã thích",
    };

    const emptyDescriptions = {
      overview: isOwnProfile 
        ? "Khi bạn đăng bài viết, nó sẽ hiển thị ở đây."
        : "Người dùng này chưa đăng bài viết nào.",
      posts: isOwnProfile ? "Bắt đầu chia sẻ với cộng đồng!" : "Người dùng này chưa đăng bài viết nào.",
      comments: isOwnProfile ? "Tham gia thảo luận ngay!" : "Người dùng này chưa bình luận.",
      saved: "Các bài viết bạn lưu sẽ hiển thị ở đây",
      likes: "Các bài viết bạn đã thích sẽ hiển thị ở đây",
    };

    const emptyIcons = {
      overview: "📝",
      posts: "📝",
      comments: "💬",
      saved: "🔖",
      likes: "❤️",
    };

    return (
      <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
        <div className="mb-6">
          <div className="h-20 w-20 mx-auto mb-4 rounded-full bg-muted/30 flex items-center justify-center">
            <span className="text-4xl">{emptyIcons[activeTab] || "😊"}</span>
          </div>
        </div>
        <h3 className="text-lg font-bold text-foreground mb-2">
          {emptyMessages[activeTab]}
        </h3>
        <p className="text-sm text-muted-foreground max-w-md mb-6 leading-relaxed">
          {emptyDescriptions[activeTab]}
        </p>
        {(activeTab === "overview" || activeTab === "posts") && isOwnProfile && (
          <button 
            onClick={onCreatePost}
            className="px-4 py-2 rounded-full bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            Tạo bài viết đầu tiên
          </button>
        )}
      </div>
    );
  };

  const renderComingSoon = () => (
    <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
      <div className="mb-6">
        <div className="h-20 w-20 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
          <ClockIcon className="h-10 w-10 text-primary" />
        </div>
      </div>
      <h3 className="text-lg font-bold text-foreground mb-2">
        Sắp ra mắt
      </h3>
      <p className="text-sm text-muted-foreground max-w-md mb-6 leading-relaxed">
        Tính năng này đang được phát triển và sẽ sớm có mặt. Hãy quay lại sau nhé!
      </p>
    </div>
  );

  const renderComments = () => {
    if (loading) {
      return (
        <>
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-lg border border-border bg-card p-4">
              <Skeleton className="h-4 w-1/4 mb-2" />
              <Skeleton className="h-4 w-full mb-2" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ))}
        </>
      );
    }

    if (comments.length === 0) {
      return (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          {renderEmptyState()}
        </div>
      );
    }

    return comments.map((comment) => (
      <CommentCard key={comment.id} comment={comment} />
    ));
  };

  const renderPosts = (postsToRender) => {
    if (loading) {
      return (
        <>
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-lg border border-border bg-card p-4">
              <Skeleton className="h-6 w-3/4 mb-2" />
              <Skeleton className="h-4 w-full mb-2" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ))}
        </>
      );
    }

    if (postsToRender.length === 0) {
      return (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          {renderEmptyState()}
        </div>
      );
    }

    return postsToRender.map((post) => (
      <PostCard
        key={post.id}
        post={post}
        currentUserId={currentUserId}
        onUpvote={onUpvote}
        onDownvote={onDownvote}
        onComment={onComment}
        onShare={onShare}
        onSave={onSave}
        onAuthorClick={onAuthorClick}
        onFollow={onFollow}
        onCommunityClick={onCommunityClick}
        onEdit={onEdit}
        onDelete={onDelete}
        onHide={onHide}
        onReport={onReport}
      />
    ));
  };

  const renderContent = () => {
    switch (activeTab) {
      case "comments":
        return renderComments();
      case "saved":
        return (
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            {renderComingSoon()}
          </div>
        );
      case "likes":
        return renderPosts(likedPosts);
      case "overview":
      case "posts":
      default:
        return renderPosts(posts);
    }
  };

  return (
    <div className="w-full">
      {/* Content Filter Bar - Chỉ hiển thị khi xem profile của mình và ở tab posts/overview */}
      {isOwnProfile && (activeTab === "overview" || activeTab === "posts") && (
        <div className="flex items-center justify-between gap-3 mb-6">
          <button className="flex items-center gap-2 px-3 py-2 rounded-full bg-muted/50 text-sm font-medium text-foreground hover:bg-muted transition-colors border border-border/30">
            <EyeIcon className="h-4 w-4" />
            <span>Hiển thị tất cả</span>
            <ChevronDownIcon className="h-4 w-4" />
          </button>

          <button 
            onClick={onCreatePost}
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <PlusIcon className="h-4 w-4" />
            <span>Tạo bài viết</span>
          </button>
        </div>
      )}

      {/* Content Area */}
      <div className="space-y-4">
        {renderContent()}
      </div>
    </div>
  );
};

export default ProfileContent;


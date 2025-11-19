import { useState, useEffect } from "react";
import { useNavigate, useLocation, useOutletContext } from "react-router-dom";
import PostCard from "src/components/post/PostCard";
import CreatePostModal from "src/components/post/CreatePostModal";
import CommentSection from "src/components/post/CommentSection";
import FeedTabs from "src/components/feed/FeedTabs";
import Modal from "src/components/ui/Modal";
import { useToast } from "src/components/ui";
import { useNotifications } from "../hooks/useNotifications";

function getCookie(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(";").shift();
  return null;
}

// Mock data - sẽ thay thế bằng API calls sau
const mockPosts = [
  {
    id: "1",
    author: { id: "1", name: "John Doe", avatar: null },
    community: "nature",
    title: "Amazing sunset today!",
    content:
      "Just captured this beautiful sunset at the beach. Nature is incredible!",
    url: "https://www.example.com/sunset-photography",
    upvotes: 1234,
    downvotes: 45,
    comments: 89,
    hasUpvoted: false,
    hasDownvoted: false,
    saved: false,
    isFollowing: false,
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    images: [],
  },
  {
    id: "2",
    author: { id: "2", name: "Jane Smith", avatar: null },
    community: "webdev",
    title: "New project launch",
    content:
      "Excited to announce the launch of our new web application. Check it out!",
    upvotes: 2456,
    downvotes: 123,
    comments: 234,
    hasUpvoted: true,
    hasDownvoted: false,
    saved: true,
    isFollowing: true,
    createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    images: [],
  },
  {
    id: "3",
    author: { id: "3", name: "Tech News", avatar: null },
    community: "technology",
    title: "Latest AI breakthroughs",
    content:
      "Researchers announce major advances in artificial intelligence and machine learning.",
    url: "https://www.technews.com/ai-breakthroughs-2025",
    upvotes: 5678,
    downvotes: 234,
    comments: 567,
    hasUpvoted: false,
    hasDownvoted: false,
    saved: false,
    isFollowing: false,
    createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    images: [],
  },
];

export default function Feed() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedPostId, setSelectedPostId] = useState(null);
  const [isCommentModalOpen, setIsCommentModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("forYou");
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const { addRecentPost } = useOutletContext() || { addRecentPost: () => {} };

  const token = getCookie("accessToken");
  const { notifications } = useNotifications(token);

  useEffect(() => {
    // Simulate API call
    const loadPosts = async () => {
      setLoading(true);
      // Simulate network delay
      await new Promise((resolve) => setTimeout(resolve, 1000));
      setPosts(mockPosts);
      setLoading(false);
    };
    loadPosts();
  }, []);

  // Open create modal if state indicates
  useEffect(() => {
    if (location.state?.openCreateModal) {
      setIsCreateModalOpen(true);
      // Clear state
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, navigate, location.pathname]);

  useEffect(() => {
    if (notifications.length > 0) {
      const latest = notifications[0];
      toast.info(`Bạn có thông báo mới: ${latest.title || "Thông báo"}`);
    }
  }, [notifications, toast]);

  const handleCreatePost = async (postData) => {
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 500));
    
    const newPost = {
      id: Date.now().toString(),
      author: { id: "current-user", name: "You", avatar: null },
      community: "general",
      title: postData.title,
      content: postData.content,
      upvotes: 0,
      downvotes: 0,
      comments: 0,
      hasUpvoted: false,
      hasDownvoted: false,
      saved: false,
      isFollowing: false,
      createdAt: new Date().toISOString(),
      images: postData.images.map((img) => URL.createObjectURL(img)),
    };

    setPosts((prev) => [newPost, ...prev]);
    addRecentPost(newPost);
    toast.success("Đã tạo bài viết thành công!");
  };

  const handleUpvote = (postId) => {
    setPosts((prevPosts) =>
      prevPosts.map((post) => {
        if (post.id === postId) {
          const newPost = { ...post };
          if (post.hasUpvoted) {
            // Remove upvote
            newPost.hasUpvoted = false;
            newPost.upvotes = post.upvotes - 1;
          } else {
            // Add upvote
            newPost.hasUpvoted = true;
            newPost.upvotes = post.upvotes + 1;
            // Remove downvote if exists
            if (post.hasDownvoted) {
              newPost.hasDownvoted = false;
              newPost.downvotes = post.downvotes - 1;
            }
          }
          addRecentPost(newPost);
          return newPost;
        }
        return post;
      })
    );
  };

  const handleDownvote = (postId) => {
    setPosts((prevPosts) =>
      prevPosts.map((post) => {
        if (post.id === postId) {
          const newPost = { ...post };
          if (post.hasDownvoted) {
            // Remove downvote
            newPost.hasDownvoted = false;
            newPost.downvotes = post.downvotes - 1;
          } else {
            // Add downvote
            newPost.hasDownvoted = true;
            newPost.downvotes = post.downvotes + 1;
            // Remove upvote if exists
            if (post.hasUpvoted) {
              newPost.hasUpvoted = false;
              newPost.upvotes = post.upvotes - 1;
            }
          }
          return newPost;
        }
        return post;
      })
    );
  };

  const handleFollow = (authorId, shouldFollow) => {
    setPosts((prevPosts) =>
      prevPosts.map((post) =>
        post.author?.id === authorId
          ? { ...post, isFollowing: shouldFollow }
          : post
      )
    );
    toast.success(shouldFollow ? "Đã follow!" : "Đã unfollow!");
  };

  const handleSave = (postId) => {
    setPosts((prevPosts) =>
      prevPosts.map((post) =>
        post.id === postId ? { ...post, saved: !post.saved } : post
      )
    );
  };

  const handleComment = (postId) => {
    setSelectedPostId(postId);
    setIsCommentModalOpen(true);
  };

  const handleAddComment = (postId, content) => {
    // Simulate adding comment
    setPosts((prevPosts) =>
      prevPosts.map((post) =>
        post.id === postId
          ? { ...post, comments: (post.comments || 0) + 1 }
          : post
      )
    );
    toast.success("Đã thêm bình luận!");
  };

  const handleAuthorClick = (authorId) => {
    navigate(`/profile/${authorId}`);
  };

  const handleCommunityClick = (community) => {
    toast.info(`Navigating to s/${community}`);
    // navigate(`/community/${community}`);
  };

  const selectedPost = posts.find((p) => p.id === selectedPostId);
  const mockComments = selectedPost
    ? [
        {
          id: "1",
          author: { id: "2", name: "Jane Smith", avatar: null },
          content: "Great post!",
          likes: 5,
          liked: false,
          createdAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
          replies: [],
        },
      ]
    : [];

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    // TODO: Load different posts based on tab
  };

  // Filter posts based on active tab
  const filteredPosts = activeTab === "following" 
    ? posts.filter(post => post.isFollowing) 
    : posts;

  return (
    <div className="mx-auto max-w-2xl">
      {/* Tabs Navigation */}
      <div className="-mx-3 sm:-mx-4 lg:-mx-6 mb-4">
        <FeedTabs activeTab={activeTab} onTabChange={handleTabChange} />
      </div>

      <CreatePostModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSubmit={handleCreatePost}
      />

      <Modal
        isOpen={isCommentModalOpen}
        onClose={() => {
          setIsCommentModalOpen(false);
          setSelectedPostId(null);
        }}
        title="Bình luận"
        size="lg"
      >
        {selectedPost && (
          <CommentSection
            postId={selectedPostId}
            comments={mockComments}
            onAddComment={handleAddComment}
            onLikeComment={(commentId) => {
              toast.info("Đã thích bình luận");
            }}
            onReplyComment={(commentId, content) => {
              toast.info("Đã phản hồi");
            }}
          />
        )}
      </Modal>

      <div className="space-y-4">
        {loading ? (
          <>
            {[1, 2, 3].map((i) => (
              <PostCard key={i} loading />
            ))}
          </>
        ) : filteredPosts.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-12 text-center">
            <p className="text-muted-foreground mb-2">
              {activeTab === "following" 
                ? "Chưa có bài viết từ người bạn follow."
                : "Chưa có bài viết nào. Hãy tạo bài viết đầu tiên!"}
            </p>
            {activeTab === "following" && (
              <button
                onClick={() => setActiveTab("forYou")}
                className="text-sm text-primary hover:underline"
              >
                Xem For You feed →
              </button>
            )}
          </div>
        ) : (
          filteredPosts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              onUpvote={handleUpvote}
              onDownvote={handleDownvote}
              onComment={handleComment}
              onShare={(id) => {
                navigator.clipboard.writeText(window.location.href);
                toast.success("Đã sao chép link!");
              }}
              onSave={handleSave}
              onAuthorClick={handleAuthorClick}
              onFollow={handleFollow}
              onCommunityClick={handleCommunityClick}
            />
          ))
        )}
      </div>
    </div>
  );
}

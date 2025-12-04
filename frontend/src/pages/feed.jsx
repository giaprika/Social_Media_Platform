import React, { useState, useEffect, useCallback } from "react";
import { useNavigate, useLocation, useOutletContext } from "react-router-dom";
import Cookies from "universal-cookie";
import PostCard from "src/components/post/PostCard";
import CreatePostModal from "src/components/post/CreatePostModal";
import CommentSection from "src/components/post/CommentSection";
import FeedTabs from "src/components/feed/FeedTabs";
import Modal from "src/components/ui/Modal";
import { useToast } from "src/components/ui";
import { useNotifications } from "../hooks/useNotifications";
import * as postApi from "src/api/post";
import { getUserById } from "src/api/user";

const cookies = new Cookies();

function getCookie(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(";").shift();
  return null;
}

// Transform API post to frontend format
const transformPost = (apiPost, userInfo = null) => ({
  id: apiPost.post_id,
  author: userInfo || {
    id: apiPost.user_id,
    name: "User",
    username: null,
    avatar: null,
    avatar_url: null,
  },
  community: apiPost.group_id || null,  // null nếu không thuộc community
  title: apiPost.content, // content = title
  content: apiPost.content,
  images: apiPost.media_urls || [],
  upvotes: apiPost.reacts_count || 0,
  downvotes: 0,
  comments: apiPost.comments_count || 0,
  hasUpvoted: false, // Will be enriched later
  hasDownvoted: false,
  saved: false,
  isFollowing: false,
  createdAt: apiPost.created_at,
  tags: apiPost.tags || [],
  visibility: apiPost.visibility,
});

// Transform API comment to frontend format
const transformComment = (apiComment, userInfo = null) => ({
  id: apiComment.comment_id,
  author: userInfo || {
    id: apiComment.user_id,
    name: "User",
    avatar: null,
  },
  content: apiComment.content,
  likes: apiComment.reacts_count || 0,
  liked: false,
  createdAt: apiComment.created_at,
  replies: [],
  media_urls: apiComment.media_urls,
  parentId: apiComment.parent_id,
});

export default function Feed() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedPostId, setSelectedPostId] = useState(null);
  const [isCommentModalOpen, setIsCommentModalOpen] = useState(false);
  const [comments, setComments] = useState([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("forYou");
  const [usersCache, setUsersCache] = useState({});
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const { addRecentPost } = useOutletContext() || { addRecentPost: () => {} };

  const token = getCookie("accessToken");
  const currentUserId = cookies.get("x-user-id");
  const { notifications } = useNotifications(token);

  // Fetch user info and cache it - use ref to avoid dependency issues
  const usersCacheRef = React.useRef(usersCache);
  usersCacheRef.current = usersCache;

  const fetchUserInfo = useCallback(async (userId) => {
    if (usersCacheRef.current[userId]) return usersCacheRef.current[userId];
    
    try {
      const response = await getUserById(userId);
      const user = response.data;
      const userInfo = {
        id: user.id,
        name: user.full_name || user.username || "User",
        username: user.username,
        avatar: user.avatar_url,
        avatar_url: user.avatar_url,
      };
      setUsersCache((prev) => ({ ...prev, [userId]: userInfo }));
      return userInfo;
    } catch (error) {
      console.error("Failed to fetch user:", userId, error);
      return { id: userId, name: "User", username: null, avatar: null, avatar_url: null };
    }
  }, []);

  // Load posts only once on mount
  const hasLoadedRef = React.useRef(false);
  const isLoadingRef = React.useRef(false);
  
  useEffect(() => {
    console.log("[Feed] useEffect triggered, hasLoaded:", hasLoadedRef.current, "isLoading:", isLoadingRef.current);
    if (!hasLoadedRef.current && !isLoadingRef.current) {
      hasLoadedRef.current = true;
      isLoadingRef.current = true;
      
      const fetchPosts = async () => {
        setLoading(true);
        try {
          const response = await postApi.getPosts({ limit: 20, offset: 0 });
          const rawPosts = response.data?.data || [];
          console.log("[Feed] Raw posts from API:", rawPosts.length);
          
          // Enrich posts with user info
          const enrichedPosts = await Promise.all(
            rawPosts.map(async (post) => {
              const userInfo = await fetchUserInfo(post.user_id);
              const transformedPost = transformPost(post, userInfo);
              
              // Check if current user has reacted
              if (currentUserId) {
                try {
                  const reactionsRes = await postApi.getPostReactions(post.post_id);
                  const reactions = reactionsRes.data?.data || [];
                  const userReaction = reactions.find((r) => r.user_id === currentUserId);
                  transformedPost.hasUpvoted = !!userReaction;
                } catch (error) {
                  console.error("Failed to fetch reactions:", error);
                }
              }
              
              return transformedPost;
            })
          );
          
          console.log("[Feed] Setting posts:", enrichedPosts.length);
          setPosts(enrichedPosts);
        } catch (error) {
          console.error("Failed to load posts:", error);
          toast.error("Không thể tải bài viết");
        } finally {
          setLoading(false);
          isLoadingRef.current = false;
        }
      };
      
      fetchPosts();
    }
  }, []); // Empty dependency - only run once

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

  // Load comments for a post
  const loadComments = useCallback(async (postId) => {
    setCommentsLoading(true);
    try {
      const response = await postApi.getComments(postId, { limit: 50 });
      const rawComments = response.data?.data || [];
      
      // Enrich comments with user info
      const enrichedComments = await Promise.all(
        rawComments.map(async (comment) => {
          const userInfo = await fetchUserInfo(comment.user_id);
          return transformComment(comment, userInfo);
        })
      );
      
      // Build nested structure (parent/child)
      const commentMap = new Map();
      const rootComments = [];
      
      enrichedComments.forEach((c) => {
        commentMap.set(c.id, { ...c, replies: [] });
      });
      
      enrichedComments.forEach((c) => {
        if (c.parentId && commentMap.has(c.parentId)) {
          commentMap.get(c.parentId).replies.push(commentMap.get(c.id));
        } else {
          rootComments.push(commentMap.get(c.id));
        }
      });
      
      setComments(rootComments);
    } catch (error) {
      console.error("Failed to load comments:", error);
      toast.error("Không thể tải bình luận");
    } finally {
      setCommentsLoading(false);
    }
  }, [fetchUserInfo, toast]);

  const handleCreatePost = async (postData) => {
    try {
      const formData = new FormData();
      
      // Gửi content trực tiếp (không còn title riêng)
      if (postData.content) {
        formData.append("content", postData.content);
      }
      
      // Gửi visibility
      if (postData.visibility) {
        formData.append("visibility", postData.visibility);
      }
      
      // Gửi tags
      if (postData.tags && postData.tags.length > 0) {
        postData.tags.forEach((tag) => formData.append("tags", tag));
      }
      
      // Gửi files (ảnh/video)
      if (postData.files && postData.files.length > 0) {
        postData.files.forEach((file) => formData.append("files", file));
      }

      const response = await postApi.createPost(formData);
      const newPostData = response.data?.data;
      
      if (newPostData) {
        const userInfo = await fetchUserInfo(newPostData.user_id);
        const newPost = transformPost(newPostData, userInfo);
        setPosts((prev) => [newPost, ...prev]);
        addRecentPost(newPost);
        toast.success("Đã tạo bài viết thành công!");
      }
    } catch (error) {
      console.error("Failed to create post:", error);
      toast.error("Không thể tạo bài viết");
      throw error;
    }
  };

  const handleUpvote = async (postId) => {
    const post = posts.find((p) => p.id === postId);
    if (!post) return;

    // Optimistic update
    setPosts((prevPosts) =>
      prevPosts.map((p) => {
        if (p.id === postId) {
          return {
            ...p,
            hasUpvoted: !p.hasUpvoted,
            upvotes: p.hasUpvoted ? p.upvotes - 1 : p.upvotes + 1,
          };
        }
        return p;
      })
    );

    try {
      if (post.hasUpvoted) {
        await postApi.removePostReaction(postId);
      } else {
        await postApi.reactToPost(postId, "like");
      }
    } catch (error) {
      console.error("Failed to react:", error);
      // Revert on error
      setPosts((prevPosts) =>
        prevPosts.map((p) => {
          if (p.id === postId) {
            return {
              ...p,
              hasUpvoted: post.hasUpvoted,
              upvotes: post.upvotes,
            };
          }
          return p;
        })
      );
      toast.error("Không thể thực hiện");
    }
  };

  const handleDownvote = (postId) => {
    // Downvote không được hỗ trợ bởi post-service, bỏ qua
    toast.info("Tính năng này chưa được hỗ trợ");
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
    // Save tạm thời ở local, chưa có API
    setPosts((prevPosts) =>
      prevPosts.map((post) =>
        post.id === postId ? { ...post, saved: !post.saved } : post
      )
    );
  };

  const handleComment = (postId) => {
    setSelectedPostId(postId);
    setIsCommentModalOpen(true);
    loadComments(postId);
  };

  const handleAddComment = async (postId, content) => {
    try {
      const formData = new FormData();
      formData.append("content", content);

      await postApi.createComment(postId, formData);

      // Reload comments
      await loadComments(postId);

      // Update post comment count
      setPosts((prevPosts) =>
        prevPosts.map((post) =>
          post.id === postId
            ? { ...post, comments: (post.comments || 0) + 1 }
            : post
        )
      );
      toast.success("Đã thêm bình luận!");
    } catch (error) {
      console.error("Failed to add comment:", error);
      toast.error("Không thể thêm bình luận");
    }
  };

  const handleLikeComment = async (commentId) => {
    try {
      await postApi.reactToComment(commentId, "like");
      // Update local state
      setComments((prevComments) =>
        prevComments.map((c) =>
          c.id === commentId
            ? { ...c, liked: !c.liked, likes: c.liked ? c.likes - 1 : c.likes + 1 }
            : c
        )
      );
    } catch (error) {
      console.error("Failed to like comment:", error);
      toast.error("Không thể thích bình luận");
    }
  };

  const handleReplyComment = async (commentId, content) => {
    try {
      const formData = new FormData();
      formData.append("content", content);
      formData.append("parent_id", commentId);

      await postApi.createComment(selectedPostId, formData);
      await loadComments(selectedPostId);
      toast.success("Đã phản hồi!");
    } catch (error) {
      console.error("Failed to reply:", error);
      toast.error("Không thể phản hồi");
    }
  };

  const handleAuthorClick = (authorId) => {
    navigate(`/app/profile/${authorId}`);
  };

  const handleCommunityClick = (community) => {
    toast.info(`Navigating to c/${community}`);
    // navigate(`/community/${community}`);
  };

  const handleEditPost = (post) => {
    // TODO: Open edit modal with post data
    toast.info("Tính năng chỉnh sửa đang phát triển");
  };

  const handleDeletePost = async (postId) => {
    try {
      await postApi.deletePost(postId);
      setPosts((prevPosts) => prevPosts.filter((p) => p.id !== postId));
      toast.success("Đã xóa bài viết!");
    } catch (error) {
      console.error("Failed to delete post:", error);
      toast.error("Không thể xóa bài viết");
    }
  };

  const handleHidePost = (postId) => {
    // Hide post locally (chưa có API)
    setPosts((prevPosts) => prevPosts.filter((p) => p.id !== postId));
    toast.success("Đã ẩn bài viết");
  };

  const handleReportPost = (postId) => {
    // TODO: Open report modal
    toast.info("Đã gửi báo cáo");
  };

  const selectedPost = posts.find((p) => p.id === selectedPostId);

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
          setComments([]);
        }}
        title="Bình luận"
        size="lg"
      >
        {selectedPost && (
          <CommentSection
            postId={selectedPostId}
            comments={comments}
            loading={commentsLoading}
            onAddComment={handleAddComment}
            onLikeComment={handleLikeComment}
            onReplyComment={handleReplyComment}
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
              currentUserId={currentUserId}
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
              onEdit={handleEditPost}
              onDelete={handleDeletePost}
              onHide={handleHidePost}
              onReport={handleReportPost}
            />
          ))
        )}
      </div>
    </div>
  );
}

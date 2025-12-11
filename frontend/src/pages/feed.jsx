import React, { useState, useEffect, useCallback } from "react";
import { useNavigate, useLocation, useOutletContext } from "react-router-dom";
import Cookies from "universal-cookie";
import PostCard from "src/components/post/PostCard";
import CreatePostModal from "src/components/post/CreatePostModal";
import CommentSection from "src/components/post/CommentSection";
import FeedTabs from "src/components/feed/FeedTabs";
import Modal from "src/components/ui/Modal";
import ConfirmDialog from "src/components/ui/ConfirmDialog";
import { useToast } from "src/components/ui";
import { useNotifications } from "../hooks/useNotifications";
import * as postApi from "src/api/post";
import { getUserById } from "src/api/user";
import { getCommunityById } from "src/api/community";

const cookies = new Cookies();

function getCookie(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(";").shift();
  return null;
}

// Transform API post to frontend format
const transformPost = (apiPost, userInfo = null, communityInfo = null) => ({
  id: apiPost.post_id,
  author: userInfo || {
    id: apiPost.user_id,
    name: "User",
    username: null,
    avatar: null,
    avatar_url: null,
  },
  // Community: use object with id/name/slug for proper display
  community: communityInfo ? { id: communityInfo.id, name: communityInfo.name, slug: communityInfo.slug } : null,
  title: apiPost.content,
  content: apiPost.content,
  images: apiPost.media_urls || [],
  upvotes: apiPost.reacts_count || 0,
  downvotes: 0,
  comments: apiPost.comments_count || 0,
  hasUpvoted: false,
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
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingPost, setEditingPost] = useState(null);
  const [deletePostId, setDeletePostId] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedPostId, setSelectedPostId] = useState(null);
  const [isCommentModalOpen, setIsCommentModalOpen] = useState(false);
  const [comments, setComments] = useState([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("forYou");
  const [usersCache, setUsersCache] = useState({});
  const [communitiesCache, setCommunitiesCache] = useState({});
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const { addRecentPost } = useOutletContext() || { addRecentPost: () => { } };

  const token = getCookie("accessToken");
  const currentUserId = cookies.get("x-user-id");
  const { notifications } = useNotifications(token);

  // Intersection Observer ref for infinite scroll
  const observerTarget = React.useRef(null);

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

  // Fetch community info and cache it
  const communitiesCacheRef = React.useRef(communitiesCache);
  communitiesCacheRef.current = communitiesCache;

  const fetchCommunityInfo = useCallback(async (communityId) => {
    if (!communityId) return null;
    if (communitiesCacheRef.current[communityId]) return communitiesCacheRef.current[communityId];

    try {
      const community = await getCommunityById(communityId);
      if (community) {
        setCommunitiesCache((prev) => ({ ...prev, [communityId]: community }));
        return community;
      }
      return null;
    } catch (error) {
      console.warn("[Feed] Failed to fetch community:", communityId);
      return null;
    }
  }, []);

  // Load posts function - optimized version
  const loadPosts = useCallback(async (currentOffset = 0, append = false) => {
    const POSTS_PER_PAGE = 4; // Giảm từ 20 xuống 10 để load nhanh hơn
    
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }

    try {
      const response = await postApi.getPosts({ 
        limit: POSTS_PER_PAGE, 
        offset: currentOffset 
      });
      const rawPosts = response.data?.data || [];
      console.log(`[Feed] Loaded ${rawPosts.length} posts at offset ${currentOffset}`);

      // Check if there are more posts
      if (rawPosts.length < POSTS_PER_PAGE) {
        setHasMore(false);
      }

      // Transform posts WITHOUT fetching reactions immediately (lazy load)
      const enrichedPosts = await Promise.all(
        rawPosts.map(async (post) => {
          const userInfo = await fetchUserInfo(post.user_id);
          const communityInfo = post.group_id ? await fetchCommunityInfo(post.group_id) : null;
          return transformPost(post, userInfo, communityInfo);
        })
      );

      if (append) {
        setPosts(prev => [...prev, ...enrichedPosts]);
      } else {
        setPosts(enrichedPosts);
      }

      setOffset(currentOffset + rawPosts.length);
    } catch (error) {
      console.error("Failed to load posts:", error);
      toast.error("Không thể tải bài viết");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [fetchUserInfo, fetchCommunityInfo, toast]);

  // Initial load
  useEffect(() => {
    loadPosts(0, false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Infinite scroll observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore && !loading) {
          console.log("[Feed] Loading more posts, offset:", offset);
          loadPosts(offset, true);
        }
      },
      { threshold: 0.1 }
    );

    const currentTarget = observerTarget.current;
    if (currentTarget) {
      observer.observe(currentTarget);
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget);
      }
    };
  }, [hasMore, loadingMore, loading, offset, loadPosts]);

  // Open create modal if state indicates
  useEffect(() => {
    if (location.state?.openCreateModal) {
      setIsCreateModalOpen(true);
      // Clear state
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, navigate, location.pathname]);

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
      console.log('🎨 [Feed] handleCreatePost called with:', {
        title: postData.title,
        content: postData.content,
        imagesCount: postData.images?.length || 0
      })

      const formData = new FormData();

      // Gửi content trực tiếp (không còn title riêng)
      if (postData.content) {
        formData.append("content", postData.content);
      }

      // Gửi visibility
      if (postData.visibility) {
        formData.append("visibility", postData.visibility);
      }
      if (postData.tags && postData.tags.length > 0) {
        postData.tags.forEach((tag) => formData.append("tags", tag));
      }

      // Gửi files (ảnh/video)
      if (postData.files && postData.files.length > 0) {
        postData.files.forEach((file) => formData.append("files", file));
      }


      console.log('📤 [Feed] Sending FormData to API...')
      const response = await postApi.createPost(formData);
      console.log('✅ [Feed] Post created successfully:', response.data)
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

  const handleCommunityClick = (communityIdOrSlug) => {
    // communityIdOrSlug can be an ID, slug, or object
    const slug = typeof communityIdOrSlug === 'object'
      ? (communityIdOrSlug.slug || communityIdOrSlug.id)
      : communityIdOrSlug;
    if (slug) {
      navigate(`/c/${slug}`);
    }
  };

  const handleEditPost = (post) => {
    setEditingPost(post);
  };

  const handleUpdatePost = async (postData) => {
    if (!editingPost) return;

    try {
      const formData = new FormData();

      if (postData.content) {
        formData.append("content", postData.content);
      }
      if (postData.visibility) {
        formData.append("visibility", postData.visibility);
      }
      if (postData.tags && postData.tags.length > 0) {
        postData.tags.forEach((tag) => formData.append("tags", tag));
      }
      if (postData.files && postData.files.length > 0) {
        postData.files.forEach((file) => formData.append("files", file));
      }

      const response = await postApi.updatePost(editingPost.id, formData);
      const updatedPostData = response.data?.data;

      if (updatedPostData) {
        const userInfo = await fetchUserInfo(updatedPostData.user_id);
        const updatedPost = transformPost(updatedPostData, userInfo);
        setPosts((prev) => prev.map((p) => p.id === editingPost.id ? updatedPost : p));
        toast.success("Đã cập nhật bài viết!");
      }
      setEditingPost(null);
    } catch (error) {
      console.error("Failed to update post:", error);
      toast.error("Không thể cập nhật bài viết");
      throw error;
    }
  };

  const handleDeletePost = async (postId) => {
    setDeletePostId(postId);
  };

  const confirmDeletePost = async () => {
    if (!deletePostId) return;

    setIsDeleting(true);
    try {
      await postApi.deletePost(deletePostId);
      setPosts((prevPosts) => prevPosts.filter((p) => p.id !== deletePostId));
      toast.success("Đã xóa bài viết!");
      setDeletePostId(null);
    } catch (error) {
      console.error("Failed to delete post:", error);
      toast.error("Không thể xóa bài viết");
    } finally {
      setIsDeleting(false);
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

      {/* Edit Post Modal */}
      <CreatePostModal
        isOpen={!!editingPost}
        onClose={() => setEditingPost(null)}
        onSubmit={handleUpdatePost}
        initialData={editingPost ? {
          content: editingPost.content,
          visibility: editingPost.visibility || "public",
          tags: editingPost.tags || [],
          images: editingPost.images || [],
        } : null}
        isEditing
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={!!deletePostId}
        onClose={() => setDeletePostId(null)}
        onConfirm={confirmDeletePost}
        title="Xóa bài viết"
        message="Bạn có chắc chắn muốn xóa bài viết này? Hành động này không thể hoàn tác."
        confirmText="Xóa"
        cancelText="Hủy"
        variant="danger"
        loading={isDeleting}
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
          <>
            {filteredPosts.map((post) => (
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
            ))}
            
            {/* Intersection Observer Target for Infinite Scroll */}
            <div ref={observerTarget} className="py-4">
              {loadingMore && (
                <div className="space-y-4">
                  {[1, 2].map((i) => (
                    <PostCard key={`loading-${i}`} loading />
                  ))}
                </div>
              )}
              {!hasMore && filteredPosts.length > 0 && (
                <div className="text-center text-muted-foreground py-8">
                  <p>Bạn đã xem hết tất cả bài viết!</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

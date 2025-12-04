import { useState, useEffect, useCallback } from "react";
import { useParams, useOutletContext, useNavigate } from "react-router-dom";
import useAuth from "src/hooks/useAuth";
import { useToast } from "src/components/ui";
import ProfileHeader from "src/components/profile/ProfileHeader";
import ProfileTabs from "src/components/profile/ProfileTabs";
import ProfileContent from "src/components/profile/ProfileContent";
import ProfileSidebar from "src/components/profile/ProfileSidebar";
import CreatePostModal from "src/components/post/CreatePostModal";
import Modal from "src/components/ui/Modal";
import ConfirmDialog from "src/components/ui/ConfirmDialog";

import { getUserStats, getUserByUsername, getUserById, getMe } from "src/api/user";
import * as postApi from "src/api/post";

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
  community: apiPost.group_id || null,
  title: apiPost.content?.split('\n')[0]?.substring(0, 100) || "",
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

export default function Profile() {
  const { userId, username } = useParams();
  const { user: currentUser } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  
  // Get chat toggle from layout context
  const outletContext = useOutletContext();
  const onOpenChat = outletContext?.onOpenChat;

  const [activeTab, setActiveTab] = useState("overview");
  const [loading, setLoading] = useState(false);
  const [posts, setPosts] = useState([]);
  const [comments, setComments] = useState([]);
  const [likedPosts, setLikedPosts] = useState([]);
  
  // Create/Edit Post Modal
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingPost, setEditingPost] = useState(null);
  
  // Delete confirmation
  const [deletePostId, setDeletePostId] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [profileUser, setProfileUser] = useState(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [statsKey, setStatsKey] = useState(0); // Key to trigger stats refresh

  // Determine if viewing own profile
  const isOwnProfile =
    (username && username === currentUser?.username) ||
    (userId && userId === currentUser?.id) ||
    (!username && !userId);

  useEffect(() => {
    const fetchUser = async () => {
      setLoadingUser(true);
      try {
        if (isOwnProfile) {
          setProfileUser(currentUser);
        } else if (username) {
          const response = await getUserByUsername(username);
          setProfileUser(response.data);
        } else if (userId) {
          const response = await getUserById(userId);
          setProfileUser(response.data);
        }
      } catch (error) {
        console.error("Error fetching user:", error);
        toast.error("Không thể tải thông tin người dùng");
      } finally {
        setLoadingUser(false);
      }
    };

    if (currentUser) {
      fetchUser();
    }
  }, [username, userId, currentUser, isOwnProfile]);

  // Fetch posts for the profile user
  const fetchPosts = useCallback(async () => {
    if (!profileUser?.id) return;
    
    setLoading(true);
    try {
      const response = await postApi.getPosts({ 
        user_id: profileUser.id,
        limit: 20,
        offset: 0 
      });
      const rawPosts = response.data?.data || [];
      
      // Transform posts with user info
      const transformedPosts = rawPosts.map((post) => {
        const userInfo = {
          id: profileUser.id,
          name: profileUser.full_name || profileUser.username || "User",
          username: profileUser.username,
          avatar: profileUser.avatar_url,
          avatar_url: profileUser.avatar_url,
        };
        return transformPost(post, userInfo);
      });
      
      // Check reactions for current user's posts
      if (currentUser?.id) {
        for (const post of transformedPosts) {
          try {
            const reactionsRes = await postApi.getPostReactions(post.id);
            const reactions = reactionsRes.data?.data || [];
            const userReaction = reactions.find((r) => r.user_id === currentUser.id);
            post.hasUpvoted = !!userReaction;
          } catch (error) {
            console.error("Failed to fetch reactions:", error);
          }
        }
      }
      
      setPosts(transformedPosts);
    } catch (error) {
      console.error("Failed to load posts:", error);
      toast.error("Không thể tải bài viết");
    } finally {
      setLoading(false);
    }
  }, [profileUser?.id, currentUser?.id, toast]);

  // Fetch comments for the profile user
  // Lấy tất cả comments từ các posts của user
  const fetchComments = useCallback(async () => {
    if (!profileUser?.id) return;
    
    setLoading(true);
    try {
      // Fetch all posts of the user first
      const postsResponse = await postApi.getPosts({ 
        user_id: profileUser.id,
        limit: 100,
        offset: 0 
      });
      const userPosts = postsResponse.data?.data || [];
      
      // Fetch comments for each post and filter by user_id
      const allComments = [];
      for (const post of userPosts) {
        try {
          const commentsRes = await postApi.getComments(post.post_id, { limit: 100 });
          const postComments = commentsRes.data?.data || [];
          
          // Filter comments by user and add post reference
          const userComments = postComments
            .filter(c => c.user_id === profileUser.id)
            .map(c => ({
              ...c,
              id: c.comment_id,
              post: { id: post.post_id, title: post.content?.substring(0, 50) },
              author: {
                id: profileUser.id,
                name: profileUser.full_name || profileUser.username,
                username: profileUser.username,
                avatar_url: profileUser.avatar_url,
              }
            }));
          allComments.push(...userComments);
        } catch (err) {
          console.error(`Failed to fetch comments for post ${post.post_id}:`, err);
        }
      }
      
      // Sort by created_at descending
      allComments.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      setComments(allComments);
    } catch (error) {
      console.error("Failed to load comments:", error);
    } finally {
      setLoading(false);
    }
  }, [profileUser?.id]);

  // Fetch liked posts for the profile user
  // Lấy các posts mà user đã like
  const fetchLikedPosts = useCallback(async () => {
    if (!profileUser?.id) return;
    
    setLoading(true);
    try {
      // Fetch all public posts
      const postsResponse = await postApi.getPosts({ 
        limit: 100,
        offset: 0 
      });
      const allPosts = postsResponse.data?.data || [];
      
      // Check reactions for each post to find liked ones
      const likedPostsList = [];
      for (const post of allPosts) {
        try {
          const reactionsRes = await postApi.getPostReactions(post.post_id);
          const reactions = reactionsRes.data?.data || [];
          const userReaction = reactions.find(r => r.user_id === profileUser.id);
          
          if (userReaction) {
            likedPostsList.push(transformPost(post, null));
          }
        } catch (err) {
          // Skip if error
        }
      }
      
      setLikedPosts(likedPostsList);
    } catch (error) {
      console.error("Failed to load liked posts:", error);
    } finally {
      setLoading(false);
    }
  }, [profileUser?.id]);

  useEffect(() => {
    if (!profileUser?.id) return;

    switch (activeTab) {
      case "overview":
      case "posts":
        fetchPosts();
        // Fetch comments in background for stats (Contributions)
        fetchComments();
        break;
      case "comments":
        fetchComments();
        break;
      case "likes":
        fetchLikedPosts();
        break;
      default:
        setLoading(false);
    }
  }, [profileUser?.id, activeTab, fetchPosts, fetchComments, fetchLikedPosts]);

  // Handle create post
  const handleCreatePost = async (postData) => {
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

      const response = await postApi.createPost(formData);
      const newPostData = response.data?.data;
      
      if (newPostData) {
        const userInfo = {
          id: currentUser.id,
          name: currentUser.full_name || currentUser.username || "User",
          username: currentUser.username,
          avatar: currentUser.avatar_url,
          avatar_url: currentUser.avatar_url,
        };
        const newPost = transformPost(newPostData, userInfo);
        setPosts((prev) => [newPost, ...prev]);
        setStatsKey((prev) => prev + 1); // Refresh stats
        toast.success("Đã tạo bài viết thành công!");
      }
    } catch (error) {
      console.error("Failed to create post:", error);
      toast.error("Không thể tạo bài viết");
      throw error;
    }
  };

  // Handle edit post
  const handleEditPost = (post) => {
    setEditingPost(post);
  };

  // Handle update post
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

      await postApi.updatePost(editingPost.id, formData);
      
      // Refresh posts
      await fetchPosts();
      setEditingPost(null);
      toast.success("Đã cập nhật bài viết!");
    } catch (error) {
      console.error("Failed to update post:", error);
      toast.error("Không thể cập nhật bài viết");
      throw error;
    }
  };

  // Handle delete post - opens confirmation dialog
  const handleDeletePost = (postId) => {
    setDeletePostId(postId);
  };

  // Confirm delete post
  const confirmDeletePost = async () => {
    if (!deletePostId) return;
    
    setIsDeleting(true);
    try {
      await postApi.deletePost(deletePostId);
      setPosts((prevPosts) => prevPosts.filter((p) => p.id !== deletePostId));
      setStatsKey((prev) => prev + 1); // Refresh stats
      toast.success("Đã xóa bài viết!");
      setDeletePostId(null);
    } catch (error) {
      console.error("Failed to delete post:", error);
      toast.error("Không thể xóa bài viết");
    } finally {
      setIsDeleting(false);
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
    toast.info("Tính năng này chưa được hỗ trợ");
  };

  const handleComment = (postId) => {
    navigate(`/app/p/${postId}`);
  };

  const handleShare = (postId) => {
    navigator.clipboard.writeText(`${window.location.origin}/app/p/${postId}`);
    toast.success("Đã sao chép link!");
  };

  const handleSave = (postId) => {
    setPosts((prevPosts) =>
      prevPosts.map((post) =>
        post.id === postId ? { ...post, saved: !post.saved } : post
      )
    );
  };

  const handleAuthorClick = (authorId) => {
    navigate(`/app/profile/${authorId}`);
  };

  const handleHidePost = (postId) => {
    setPosts((prevPosts) => prevPosts.filter((p) => p.id !== postId));
    toast.success("Đã ẩn bài viết");
  };

  const handleReportPost = (postId) => {
    toast.info("Đã gửi báo cáo");
  };

  // Callback khi follow/unfollow để refresh stats
  const handleFollowChange = useCallback(() => {
    setStatsKey(prev => prev + 1);
  }, []);

  // Callback khi click Chat button
  const handleStartChat = useCallback((targetUser) => {
    onOpenChat?.();
  }, [onOpenChat]);

  const handleCommunityClick = (community) => {
    toast.info(`Navigating to s/${community}`);
  };

  // Open create post modal
  const handleOpenCreatePost = () => {
    setIsCreateModalOpen(true);
  };

  // If profileUser is null after loading, maybe show 404?
  if (!loadingUser && !profileUser) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-foreground mb-2">User not found</h2>
          <p className="text-muted-foreground">The user you are looking for does not exist.</p>
        </div>
      </div>
    );
  }

  const userDisplay = profileUser || currentUser;

  return (
    <div className="bg-background min-h-screen">
      {/* Create Post Modal */}
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
        variant="danger"
        loading={isDeleting}
      />

      {/* Profile Header và Tabs - Gắn liền với nhau */}
      <div className="bg-background z-20">
        {/* Profile Header */}
        <div className="border-b border-border/50">
          <div className="max-w-5xl mx-auto px-6">
            <div className="py-8">
              <ProfileHeader 
                user={userDisplay} 
                isOwnProfile={isOwnProfile} 
                onFollowChange={handleFollowChange}
                onStartChat={handleStartChat}
              />
            </div>
          </div>
        </div>

        {/* Profile Tabs - Sticky ngay dưới global header khi scroll */}
        <div className="border-b border-border/50 bg-background">
          <div className="max-w-5xl mx-auto px-6">
            <ProfileTabs activeTab={activeTab} onTabChange={setActiveTab} isOwnProfile={isOwnProfile} />
          </div>
        </div>
      </div>

      {/* Content Area with Sidebar */}
      <div className="flex gap-6 bg-background max-w-5xl mx-auto px-6">
        {/* Main Content */}
        <div className="flex-1 min-w-0 py-6">
          <ProfileContent
            activeTab={activeTab}
            posts={posts}
            comments={comments}
            likedPosts={likedPosts}
            loading={loading}
            isOwnProfile={isOwnProfile}
            currentUserId={currentUser?.id}
            onUpvote={handleUpvote}
            onDownvote={handleDownvote}
            onComment={handleComment}
            onShare={handleShare}
            onSave={handleSave}
            onAuthorClick={handleAuthorClick}
            onFollow={handleFollowChange}
            onCommunityClick={handleCommunityClick}
            onEdit={handleEditPost}
            onDelete={handleDeletePost}
            onHide={handleHidePost}
            onReport={handleReportPost}
            onCreatePost={handleOpenCreatePost}
          />
        </div>

        {/* Profile Sidebar - Thống kê user, achievements, settings */}
        <div className="hidden xl:block w-80 flex-shrink-0 py-6">
          <div className="sticky top-28">
            <ProfileSidebar 
              key={statsKey} 
              user={userDisplay} 
              isOwnProfile={isOwnProfile}
              postsCount={posts.length}
              commentsCount={comments.length}
              totalLikes={posts.reduce((sum, post) => sum + (post.upvotes || 0), 0)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

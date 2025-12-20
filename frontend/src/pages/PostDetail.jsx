import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import Cookies from "universal-cookie";
import {
  HeartIcon,
  ChatBubbleOvalLeftIcon,
  ShareIcon,
  BookmarkIcon,
  ArrowLeftIcon,
  EllipsisHorizontalIcon,
} from "@heroicons/react/24/outline";
import {
  HeartIcon as HeartIconSolid,
  BookmarkIcon as BookmarkIconSolid,
} from "@heroicons/react/24/solid";
import { formatDistanceToNow } from "date-fns";
import { vi } from "date-fns/locale";
import clsx from "clsx";
import Card from "src/components/ui/Card";
import Avatar from "src/components/ui/Avatar";
import Skeleton from "src/components/ui/Skeleton";
import CommentSection from "src/components/post/CommentSection";
import { useToast } from "src/components/ui";
import * as postApi from "src/api/post";
import { getUserById } from "src/api/user";

const cookies = new Cookies();

const transformComment = (apiComment, userInfo = null, hasLiked = false) => ({
  id: apiComment.comment_id,
  author: userInfo || {
    id: apiComment.user_id,
    name: "User",
    avatar: null,
  },
  content: apiComment.content,
  likes: apiComment.reacts_count || 0,
  liked: hasLiked,
  createdAt: apiComment.created_at,
  replies: [],
  media_urls: apiComment.media_urls,
  parentId: apiComment.parent_id,
});



export default function PostDetail() {
  const { slug, username, postId: postIdFromUrl } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const currentUserId = cookies.get("x-user-id");

  // Get postId from URL params first, then fallback to navigation state
  const postId = postIdFromUrl || location.state?.postId;

  const [post, setPost] = useState(null);
  const [author, setAuthor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [comments, setComments] = useState([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [hasUpvoted, setHasUpvoted] = useState(false);
  const [upvotes, setUpvotes] = useState(0);
  const [saved, setSaved] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [usersCache, setUsersCache] = useState({});

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

  // Memoize usersCacheRef to prevent re-renders
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
      return { id: userId, name: "User", username: null, avatar: null };
    }
  }, []);

  // Load post data - only run once when postId changes
  const hasLoadedRef = React.useRef(false);
  
  useEffect(() => {
    if (!postId) {
      console.error("[PostDetail] No postId in location.state");
      setError(true);
      setLoading(false);
      return;
    }
    if (hasLoadedRef.current) return;
    hasLoadedRef.current = true;
    
    const loadPost = async () => {
      setLoading(true);
      setError(false);
      try {
        console.log("[PostDetail] Loading post:", postId);
        const response = await postApi.getPostById(postId);
        const postData = response.data?.data;
        
        if (postData) {
          console.log("[PostDetail] Post loaded:", postData);
          setPost(postData);
          setUpvotes(postData.reacts_count || 0);
          
          // Fetch author info
          const authorInfo = await fetchUserInfo(postData.user_id);
          setAuthor(authorInfo);
          
          // Check if user has reacted
          if (currentUserId) {
            try {
              const reactionsRes = await postApi.getPostReactions(postId);
              const reactions = reactionsRes.data?.data || [];
              const userReaction = reactions.find((r) => r.user_id === currentUserId);
              setHasUpvoted(!!userReaction);
            } catch (err) {
              console.error("Failed to fetch reactions:", err);
            }
          }
        } else {
          setError(true);
        }
      } catch (err) {
        console.error("Failed to load post:", err);
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    loadPost();
  }, [postId, currentUserId, fetchUserInfo]);

  // Load comments - separate effect
  const commentsLoadedRef = React.useRef(false);
  
  useEffect(() => {
    if (!postId || commentsLoadedRef.current) return;
    commentsLoadedRef.current = true;
    
    const loadComments = async () => {
      setCommentsLoading(true);
      try {
        const response = await postApi.getComments(postId, { limit: 50 });
        const rawComments = response.data?.data || [];
        
        const enrichedComments = await Promise.all(
          rawComments.map(async (comment) => {
            const userInfo = await fetchUserInfo(comment.user_id);
            
            // Check if current user has liked this comment
            let hasLiked = false;
            if (currentUserId) {
              try {
                const reactionsRes = await postApi.getCommentReactions(comment.comment_id);
                const reactions = reactionsRes.data?.data || [];
                hasLiked = reactions.some((r) => r.user_id === currentUserId);
              } catch (err) {
                // Ignore reaction fetch errors
              }
            }
            
            return transformComment(comment, userInfo, hasLiked);
          })
        );
        
        // Build nested structure
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
      } catch (err) {
        console.error("Failed to load comments:", err);
      } finally {
        setCommentsLoading(false);
      }
    };

    loadComments();
  }, [postId, fetchUserInfo]);

  const handleUpvote = async () => {
    const prevHasUpvoted = hasUpvoted;
    const prevUpvotes = upvotes;

    // Optimistic update
    setHasUpvoted(!hasUpvoted);
    setUpvotes(hasUpvoted ? upvotes - 1 : upvotes + 1);

    try {
      if (prevHasUpvoted) {
        await postApi.removePostReaction(postId);
      } else {
        await postApi.reactToPost(postId, "like");
      }
    } catch (error) {
      // Revert on error
      setHasUpvoted(prevHasUpvoted);
      setUpvotes(prevUpvotes);
      toast.error("Không thể thực hiện");
    }
  };

  const handleSave = () => {
    setSaved(!saved);
    toast.success(saved ? "Đã bỏ lưu" : "Đã lưu bài viết");
  };

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    toast.success("Đã sao chép link!");
  };

  const handleAddComment = async (_, content) => {
    try {
      const formData = new FormData();
      formData.append("content", content);

      await postApi.createComment(postId, formData);
      
      // Reload comments
      const response = await postApi.getComments(postId, { limit: 50 });
      const rawComments = response.data?.data || [];
      
      const enrichedComments = await Promise.all(
        rawComments.map(async (comment) => {
          const userInfo = await fetchUserInfo(comment.user_id);
          return transformComment(comment, userInfo);
        })
      );
      
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
      setPost((prev) => ({ ...prev, comments_count: (prev.comments_count || 0) + 1 }));
      toast.success("Đã thêm bình luận!");
    } catch (error) {
      console.error("Failed to add comment:", error);
      toast.error("Không thể thêm bình luận");
    }
  };

  const handleLikeComment = async (commentId, isLiked) => {
    // Helper function to update likes recursively
    const updateLikesRecursive = (comments) =>
      comments.map((c) => {
        if (c.id === commentId) {
          return { ...c, liked: !c.liked, likes: c.liked ? c.likes - 1 : c.likes + 1 };
        }
        if (c.replies && c.replies.length > 0) {
          return { ...c, replies: updateLikesRecursive(c.replies) };
        }
        return c;
      });

    // Optimistic update
    setComments((prevComments) => updateLikesRecursive(prevComments));

    try {
      if (isLiked) {
        // Already liked, so remove reaction
        await postApi.removeCommentReaction(commentId);
      } else {
        // Not liked yet, add reaction
        await postApi.reactToComment(commentId, "like");
      }
    } catch (error) {
      // Revert on error
      setComments((prevComments) => updateLikesRecursive(prevComments));
      toast.error("Không thể thích bình luận");
    }
  };

  const handleReplyComment = async (commentId, content) => {
    try {
      const formData = new FormData();
      formData.append("content", content);
      formData.append("parent_id", commentId);

      await postApi.createComment(postId, formData);
      
      // Reload comments
      const response = await postApi.getComments(postId, { limit: 50 });
      const rawComments = response.data?.data || [];
      
      const enrichedComments = await Promise.all(
        rawComments.map(async (comment) => {
          const userInfo = await fetchUserInfo(comment.user_id);
          return transformComment(comment, userInfo);
        })
      );
      
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
      toast.success("Đã phản hồi!");
    } catch (error) {
      toast.error("Không thể phản hồi");
    }
  };

  // Helper function to reload comments
  const reloadComments = async () => {
    try {
      const response = await postApi.getComments(postId, { limit: 50 });
      const rawComments = response.data?.data || [];
      
      const enrichedComments = await Promise.all(
        rawComments.map(async (comment) => {
          const userInfo = await fetchUserInfo(comment.user_id);
          
          // Check if current user has liked this comment
          let hasLiked = false;
          if (currentUserId) {
            try {
              const reactionsRes = await postApi.getCommentReactions(comment.comment_id);
              const reactions = reactionsRes.data?.data || [];
              hasLiked = reactions.some((r) => r.user_id === currentUserId);
            } catch (err) {
              // Ignore reaction fetch errors
            }
          }
          
          return transformComment(comment, userInfo, hasLiked);
        })
      );
      
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
    } catch (err) {
      console.error("Failed to reload comments:", err);
    }
  };

  const handleEditComment = async (commentId, content) => {
    try {
      const formData = new FormData();
      formData.append("content", content);

      await postApi.updateComment(postId, commentId, formData);
      
      // Reload comments to get updated data
      await reloadComments();
      toast.success("Đã cập nhật bình luận!");
    } catch (error) {
      console.error("Failed to edit comment:", error);
      toast.error("Không thể cập nhật bình luận");
    }
  };

  const handleDeleteComment = async (commentId) => {
    try {
      await postApi.deleteComment(postId, commentId);
      
      // Reload comments
      await reloadComments();
      setPost((prev) => ({ ...prev, comments_count: Math.max(0, (prev?.comments_count || 0) - 1) }));
      toast.success("Đã xóa bình luận!");
    } catch (error) {
      console.error("Failed to delete comment:", error);
      toast.error("Không thể xóa bình luận");
    }
  };

  // Parse title and body from content
  const parseContent = (content) => {
    if (!content) return { title: "", body: "" };
    const parts = content.split("\n\n");
    if (parts.length > 1) {
      return { title: parts[0], body: parts.slice(1).join("\n\n") };
    }
    return { title: content, body: "" };
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl">
        <Card>
          <div className="mb-3 flex items-center gap-3">
            <Skeleton variant="circular" className="h-10 w-10" />
            <div className="flex-1">
              <Skeleton className="mb-2 h-4 w-32" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
          <Skeleton className="mb-2 h-8 w-3/4" />
          <Skeleton className="mb-4 h-4 w-full" />
          <Skeleton className="mb-4 h-4 w-full" />
          <Skeleton className="mb-4 h-48 w-full" />
        </Card>
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="mx-auto max-w-3xl text-center py-12">
        <p className="text-muted-foreground">Không tìm thấy bài viết</p>
        <button
          onClick={() => navigate("/app/feed")}
          className="mt-4 text-primary hover:underline"
        >
          Quay lại Feed
        </button>
      </div>
    );
  }

  const { title, body } = parseContent(post.content);
  const mediaUrls = post.media_urls || [];

  return (
    <div className="mx-auto max-w-3xl">
      {/* Back button */}
      <button
        onClick={() => navigate(-1)}
        className="mb-4 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        Quay lại
      </button>

      <Card>
        {/* Header */}
        <div className="mb-4 flex items-center gap-2">
          <Avatar
            src={author?.avatar_url || author?.avatar}
            name={author?.username || author?.name}
            size="md"
            onClick={() => navigate(`/app/profile/${author?.id}`)}
          />
          <div className="flex-1">
            <button
              onClick={() => navigate(`/app/profile/${author?.id}`)}
              className="text-sm font-semibold text-foreground hover:text-primary transition-colors"
            >
              u/{author?.username || author?.name}
            </button>
            <p className="text-xs text-muted-foreground">
              {formatTime(post.created_at)}
              {post.is_edited && " (đã chỉnh sửa)"}
            </p>
          </div>
        </div>

        {/* Title */}
        <h1 className="mb-4 text-2xl font-bold text-foreground">{title}</h1>

        {/* Body */}
        {body && (
          <div className="mb-4 prose prose-sm dark:prose-invert max-w-none">
            <p className="whitespace-pre-wrap text-foreground">{body}</p>
          </div>
        )}

        {/* Media */}
        {mediaUrls.length > 0 && !imageError && (
          <div className="mb-4">
            {mediaUrls.length === 1 ? (
              (() => {
                const url = mediaUrls[0];
                const isVideo = /\.(mp4|webm|mov|avi|mkv|m4v|ogg)$/i.test(url);
                if (isVideo) {
                  return (
                    <video
                      src={url}
                      controls
                      preload="metadata"
                      className="w-full rounded-lg max-h-[600px] bg-black"
                      onError={() => setImageError(true)}
                    />
                  );
                }
                return (
                  <img
                    src={url}
                    alt={title}
                    className="w-full rounded-lg object-contain max-h-[600px]"
                    onError={() => setImageError(true)}
                  />
                );
              })()
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {mediaUrls.map((url, idx) => {
                  const isVideo = /\.(mp4|webm|mov|avi|mkv|m4v|ogg)$/i.test(url);
                  if (isVideo) {
                    return (
                      <video
                        key={idx}
                        src={url}
                        controls
                        preload="metadata"
                        className="h-64 w-full rounded-lg object-cover bg-black"
                      />
                    );
                  }
                  return (
                    <img
                      key={idx}
                      src={url}
                      alt={`${title} ${idx + 1}`}
                      className="h-64 w-full rounded-lg object-cover"
                    />
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Tags */}
        {post.tags && post.tags.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-2">
            {post.tags.map((tag, idx) => (
              <span
                key={idx}
                className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-1 pt-4 border-t border-border">
          <button
            onClick={handleUpvote}
            className={clsx(
              "flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-colors",
              hasUpvoted
                ? "bg-destructive/10 text-destructive"
                : "text-muted-foreground hover:bg-muted hover:text-destructive"
            )}
          >
            {hasUpvoted ? (
              <HeartIconSolid className="h-5 w-5" />
            ) : (
              <HeartIcon className="h-5 w-5" />
            )}
            <span className="font-bold">{upvotes > 0 ? upvotes : ""}</span>
          </button>

          <button
            className="flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium text-muted-foreground bg-muted"
          >
            <ChatBubbleOvalLeftIcon className="h-5 w-5" />
            <span>{post.comments_count || 0} bình luận</span>
          </button>

          <button
            onClick={handleShare}
            className="flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
          >
            <ShareIcon className="h-5 w-5" />
            <span>Chia sẻ</span>
          </button>

          <button
            onClick={handleSave}
            className={clsx(
              "ml-auto flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-colors",
              saved
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted"
            )}
          >
            {saved ? (
              <BookmarkIconSolid className="h-5 w-5" />
            ) : (
              <BookmarkIcon className="h-5 w-5" />
            )}
            <span>{saved ? "Đã lưu" : "Lưu"}</span>
          </button>
        </div>
      </Card>

      {/* Comments Section */}
      <div className="mt-4">
        <Card>
          <h2 className="mb-4 text-lg font-bold text-foreground">Bình luận</h2>
          <CommentSection
            postId={postId}
            comments={comments}
            loading={commentsLoading}
            onAddComment={handleAddComment}
            onLikeComment={handleLikeComment}
            onReplyComment={handleReplyComment}
            onEditComment={handleEditComment}
            onDeleteComment={handleDeleteComment}
          />
        </Card>
      </div>
    </div>
  );
}

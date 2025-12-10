import { useState, useEffect, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import { PencilSquareIcon, PhotoIcon, XMarkIcon } from '@heroicons/react/24/outline'
import PostCard from 'src/components/post/PostCard'
import CommentSection from 'src/components/post/CommentSection'
import Modal from 'src/components/ui/Modal'
import ConfirmDialog from 'src/components/ui/ConfirmDialog'
import { useToast } from 'src/components/ui'
import * as postApi from 'src/api/post'
import * as userApi from 'src/api/user'
import Cookies from 'universal-cookie'

const cookies = new Cookies()

const transformPost = (apiPost, userInfo = null, communityInfo = null) => ({
    id: apiPost.post_id,
    author: userInfo || { id: apiPost.user_id, name: 'User', username: null, avatar: null, avatar_url: null },
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
})

const transformComment = (apiComment, userInfo = null) => ({
    id: apiComment.comment_id,
    author: userInfo || { id: apiComment.user_id, name: 'User', avatar: null },
    content: apiComment.content,
    likes: apiComment.reacts_count || 0,
    liked: false,
    createdAt: apiComment.created_at,
    replies: [],
    media_urls: apiComment.media_urls,
    parentId: apiComment.parent_id,
})

const CreateCommunityPostBox = ({ community, onPostCreated }) => {
    const [isExpanded, setIsExpanded] = useState(false)
    const [content, setContent] = useState('')
    const [files, setFiles] = useState([])
    const [previews, setPreviews] = useState([])
    const [isSubmitting, setIsSubmitting] = useState(false)
    const toast = useToast()

    const handleFileChange = (e) => {
        const selectedFiles = Array.from(e.target.files)
        setFiles((prev) => [...prev, ...selectedFiles])
        selectedFiles.forEach((file) => {
            const reader = new FileReader()
            reader.onload = (e) => setPreviews((prev) => [...prev, e.target.result])
            reader.readAsDataURL(file)
        })
    }

    const removeFile = (index) => {
        setFiles((prev) => prev.filter((_, i) => i !== index))
        setPreviews((prev) => prev.filter((_, i) => i !== index))
    }

    const handleSubmit = async () => {
        if (!content.trim() && files.length === 0) {
            toast.error('Please enter content or add an image')
            return
        }
        setIsSubmitting(true)
        try {
            const formData = new FormData()
            formData.append('content', content)
            formData.append('visibility', 'public')
            // Pass community ID as group_id
            if (community?.id) {
                formData.append('group_id', community.id)
            }
            files.forEach((file) => formData.append('files', file))

            console.log('[CommunityFeed] Creating post with group_id:', community?.id)

            const response = await postApi.createPost(formData)
            console.log('[CommunityFeed] Create post response:', response)

            const newPost = response.data?.data || response.data
            if (newPost) {
                onPostCreated?.(newPost)
                toast.success('Post created successfully!')
                setContent('')
                setFiles([])
                setPreviews([])
                setIsExpanded(false)
            } else {
                toast.error('Failed to create post - no data returned')
            }
        } catch (err) {
            console.error('[CommunityFeed] Failed to create post:', err)
            toast.error(err.response?.data?.message || 'Failed to create post')
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
            {!isExpanded ? (
                <button onClick={() => setIsExpanded(true)} className="w-full flex items-center gap-3 p-4 hover:bg-muted/50 transition-colors">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <PencilSquareIcon className="h-5 w-5 text-primary" />
                    </div>
                    <span className="flex-1 text-left text-muted-foreground">Write a post in {community?.name}...</span>
                </button>
            ) : (
                <div className="p-4">
                    <textarea
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        placeholder={`Share with ${community?.name}...`}
                        rows={4}
                        className="w-full px-3 py-2 rounded-xl border border-border bg-muted/50 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                        autoFocus
                    />
                    {previews.length > 0 && (
                        <div className="flex gap-2 mt-3 overflow-x-auto">
                            {previews.map((preview, index) => (
                                <div key={index} className="relative flex-shrink-0">
                                    <img src={preview} alt="" className="h-20 w-20 rounded-lg object-cover" />
                                    <button onClick={() => removeFile(index)} className="absolute -top-1 -right-1 p-1 rounded-full bg-destructive text-white">
                                        <XMarkIcon className="h-3 w-3" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
                        <div className="flex gap-2">
                            <label className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-muted cursor-pointer">
                                <PhotoIcon className="h-5 w-5" />
                                Photo/Video
                                <input type="file" accept="image/*,video/*" multiple onChange={handleFileChange} className="hidden" />
                            </label>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={() => { setIsExpanded(false); setContent(''); setFiles([]); setPreviews([]) }} className="px-4 py-2 rounded-xl text-sm text-muted-foreground hover:bg-muted">Cancel</button>
                            <button onClick={handleSubmit} disabled={isSubmitting || (!content.trim() && files.length === 0)} className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50">
                                {isSubmitting ? 'Posting...' : 'Post'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

export default function CommunityFeed() {
    const { community, membership } = useOutletContext()
    const isMember = membership?.status === 'approved'
    const currentUserId = cookies.get('x-user-id')
    const toast = useToast()

    const [posts, setPosts] = useState([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState(null)
    const [usersCache, setUsersCache] = useState({})
    const [selectedPostId, setSelectedPostId] = useState(null)
    const [isCommentModalOpen, setIsCommentModalOpen] = useState(false)
    const [comments, setComments] = useState([])
    const [commentsLoading, setCommentsLoading] = useState(false)
    const [deletePostId, setDeletePostId] = useState(null)
    const [isDeleting, setIsDeleting] = useState(false)

    const fetchUserInfo = useCallback(async (userId) => {
        if (!userId) return { id: 'unknown', name: 'Unknown User', username: null, avatar: null }
        if (usersCache[userId]) return usersCache[userId]
        try {
            const response = await userApi.getUserById(userId)
            const user = response.data
            const userInfo = { id: user.id, name: user.full_name || user.username || 'User', username: user.username, avatar: user.avatar_url, avatar_url: user.avatar_url }
            setUsersCache((prev) => ({ ...prev, [userId]: userInfo }))
            return userInfo
        } catch (err) {
            console.warn('[CommunityFeed] Failed to fetch user info:', userId, err)
            return { id: userId, name: 'User', username: null, avatar: null }
        }
    }, [usersCache])

    // Load posts for this community
    useEffect(() => {
        const loadPosts = async () => {
            if (!community?.id) {
                console.log('[CommunityFeed] No community ID, skipping load')
                setIsLoading(false)
                return
            }

            setIsLoading(true)
            setError(null)

            try {
                console.log('[CommunityFeed] Loading posts for community:', community.id, community.name)

                // Fetch all posts (TODO: Add group_id filter to backend API)
                const response = await postApi.getPosts({ limit: 100, offset: 0 })
                console.log('[CommunityFeed] Raw posts response:', response)

                const rawPosts = response.data?.data || response.data || []
                console.log('[CommunityFeed] Raw posts count:', rawPosts.length)

                // Filter posts for this community - compare strings to handle UUID format differences
                const communityId = String(community.id).toLowerCase()
                const communityPosts = rawPosts.filter((p) => {
                    const postGroupId = p.group_id ? String(p.group_id).toLowerCase() : null
                    return postGroupId === communityId
                })

                console.log('[CommunityFeed] Community posts (group_id=' + communityId + '):', communityPosts.length)

                // Enrich posts with user info
                const enrichedPosts = await Promise.all(communityPosts.map(async (post) => {
                    const userInfo = await fetchUserInfo(post.user_id)
                    const transformed = transformPost(post, userInfo, community)

                    // Check if user has reacted
                    if (currentUserId) {
                        try {
                            const reactionsRes = await postApi.getPostReactions(post.post_id)
                            const reactions = reactionsRes.data?.data || reactionsRes.data || []
                            transformed.hasUpvoted = Array.isArray(reactions) && reactions.some((r) => r.user_id === currentUserId)
                        } catch (err) {
                            // Ignore reaction errors
                        }
                    }

                    return transformed
                }))

                console.log('[CommunityFeed] Enriched posts:', enrichedPosts.length)
                setPosts(enrichedPosts)
            } catch (err) {
                console.error('[CommunityFeed] Failed to load posts:', err)
                setError('Failed to load posts. Please try again.')
            } finally {
                setIsLoading(false)
            }
        }

        loadPosts()
    }, [community?.id, community?.name, currentUserId, fetchUserInfo])

    // Handle new post created
    const handlePostCreated = async (newPostData) => {
        console.log('[CommunityFeed] New post created:', newPostData)
        try {
            const userInfo = await fetchUserInfo(newPostData.user_id)
            const newPost = transformPost(newPostData, userInfo, community)
            setPosts((prev) => [newPost, ...prev])
        } catch (err) {
            console.error('[CommunityFeed] Failed to transform new post:', err)
            // Still add the post with basic info
            const newPost = transformPost(newPostData, null, community)
            setPosts((prev) => [newPost, ...prev])
        }
    }

    // Load comments for a post
    const loadComments = async (postId) => {
        setCommentsLoading(true)
        try {
            const response = await postApi.getComments(postId, { limit: 50 })
            const rawComments = response.data?.data || response.data || []

            const enrichedComments = await Promise.all(rawComments.map(async (comment) => {
                const userInfo = await fetchUserInfo(comment.user_id)
                return transformComment(comment, userInfo)
            }))

            // Build nested structure
            const commentMap = new Map()
            const rootComments = []
            enrichedComments.forEach((c) => commentMap.set(c.id, { ...c, replies: [] }))
            enrichedComments.forEach((c) => {
                if (c.parentId && commentMap.has(c.parentId)) {
                    commentMap.get(c.parentId).replies.push(commentMap.get(c.id))
                } else {
                    rootComments.push(commentMap.get(c.id))
                }
            })
            setComments(rootComments)
        } catch (err) {
            console.error('[CommunityFeed] Failed to load comments:', err)
        } finally {
            setCommentsLoading(false)
        }
    }

    // Post action handlers
    const handleUpvote = async (postId) => {
        const post = posts.find((p) => p.id === postId)
        if (!post) return

        // Optimistic update
        setPosts((prev) => prev.map((p) => p.id === postId ? { ...p, hasUpvoted: !p.hasUpvoted, upvotes: p.hasUpvoted ? p.upvotes - 1 : p.upvotes + 1 } : p))

        try {
            if (post.hasUpvoted) {
                await postApi.removePostReaction(postId)
            } else {
                await postApi.reactToPost(postId, 'like')
            }
        } catch (err) {
            // Revert on error
            setPosts((prev) => prev.map((p) => p.id === postId ? { ...p, hasUpvoted: post.hasUpvoted, upvotes: post.upvotes } : p))
            console.error('[CommunityFeed] Failed to update reaction:', err)
        }
    }

    const handleComment = (postId) => {
        setSelectedPostId(postId)
        setIsCommentModalOpen(true)
        loadComments(postId)
    }

    const handleAddComment = async (postId, content) => {
        try {
            const formData = new FormData()
            formData.append('content', content)
            await postApi.createComment(postId, formData)
            await loadComments(postId)
            setPosts((prev) => prev.map((p) => p.id === postId ? { ...p, comments: (p.comments || 0) + 1 } : p))
            toast.success('Comment added!')
        } catch (err) {
            console.error('[CommunityFeed] Failed to add comment:', err)
            toast.error('Failed to add comment')
        }
    }

    const handleLikeComment = async (commentId) => {
        try {
            await postApi.reactToComment(commentId, 'like')
            setComments((prev) => prev.map((c) => c.id === commentId ? { ...c, liked: !c.liked, likes: c.liked ? c.likes - 1 : c.likes + 1 } : c))
        } catch (err) {
            toast.error('Failed to like comment')
        }
    }

    const handleReplyComment = async (commentId, content) => {
        try {
            const formData = new FormData()
            formData.append('content', content)
            formData.append('parent_id', commentId)
            await postApi.createComment(selectedPostId, formData)
            await loadComments(selectedPostId)
            toast.success('Reply added!')
        } catch (err) {
            toast.error('Failed to reply')
        }
    }

    const handleDeletePost = (postId) => setDeletePostId(postId)

    const confirmDeletePost = async () => {
        if (!deletePostId) return
        setIsDeleting(true)
        try {
            await postApi.deletePost(deletePostId)
            setPosts((prev) => prev.filter((p) => p.id !== deletePostId))
            toast.success('Post deleted!')
            setDeletePostId(null)
        } catch (err) {
            console.error('[CommunityFeed] Failed to delete post:', err)
            toast.error('Failed to delete post')
        } finally {
            setIsDeleting(false)
        }
    }

    const selectedPost = posts.find((p) => p.id === selectedPostId)

    return (
        <div className="space-y-4">
            {/* Create Post Box - only for members */}
            {isMember && <CreateCommunityPostBox community={community} onPostCreated={handlePostCreated} />}

            {/* Not a member notice */}
            {!isMember && (
                <div className="rounded-2xl border border-border bg-card p-4 text-center">
                    <p className="text-muted-foreground">Join the community to post and interact</p>
                </div>
            )}

            {/* Loading state */}
            {isLoading && (
                <div className="flex justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                </div>
            )}

            {/* Error state */}
            {error && !isLoading && (
                <div className="rounded-2xl border border-destructive/50 bg-destructive/10 p-4 text-center">
                    <p className="text-destructive">{error}</p>
                </div>
            )}

            {/* Empty state */}
            {!isLoading && !error && posts.length === 0 && (
                <div className="rounded-2xl border border-border bg-card p-8 text-center">
                    <PencilSquareIcon className="h-12 w-12 mx-auto text-muted-foreground/50" />
                    <p className="mt-4 text-muted-foreground">No posts in this community yet</p>
                    {isMember && <p className="text-sm text-muted-foreground mt-2">Be the first to share!</p>}
                </div>
            )}

            {/* Posts list */}
            {!isLoading && !error && posts.length > 0 && (
                posts.map((post) => (
                    <PostCard
                        key={post.id}
                        post={post}
                        currentUserId={currentUserId}
                        onUpvote={handleUpvote}
                        onDownvote={() => { }}
                        onComment={handleComment}
                        onShare={() => { navigator.clipboard.writeText(window.location.href); toast.success('Link copied!') }}
                        onSave={() => { }}
                        onAuthorClick={() => { }}
                        onFollow={() => { }}
                        onCommunityClick={() => { }}
                        onDelete={handleDeletePost}
                        onHide={() => { }}
                        onReport={() => { }}
                    />
                ))
            )}

            {/* Comments Modal */}
            <Modal isOpen={isCommentModalOpen} onClose={() => { setIsCommentModalOpen(false); setSelectedPostId(null); setComments([]) }} title="Comments" size="lg">
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

            {/* Delete Confirmation */}
            <ConfirmDialog
                isOpen={!!deletePostId}
                onClose={() => setDeletePostId(null)}
                onConfirm={confirmDeletePost}
                title="Delete Post"
                message="Are you sure you want to delete this post?"
                confirmText="Delete"
                cancelText="Cancel"
                variant="danger"
                loading={isDeleting}
            />
        </div>
    )
}

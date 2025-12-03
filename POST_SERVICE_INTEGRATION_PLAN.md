# 📦 POST SERVICE INTEGRATION PLAN

> Kế hoạch tích hợp Post Service vào Frontend

---

## 📋 TỔNG QUAN

### 1.1 Current Status

| Component           | Status        | Notes                        |
| ------------------- | ------------- | ---------------------------- |
| **Post Service**    | ✅ Running    | Port 8003, FastAPI, Supabase |
| **Gateway Config**  | ✅ Configured | `POST_SERVICE_URL` đã set    |
| **Frontend API**    | ❌ Missing    | Cần tạo `src/api/post.js`    |
| **Feed Page**       | ⚠️ Mock Data  | Đang dùng `mockPosts`        |
| **PostCard**        | ✅ Complete   | UI hoàn chỉnh                |
| **CreatePostModal** | ✅ Complete   | Có upload images             |
| **CommentSection**  | ✅ Complete   | UI hoàn chỉnh                |

### 1.2 Post Service API Endpoints

| Method   | Endpoint                            | Description         | Auth        |
| -------- | ----------------------------------- | ------------------- | ----------- |
| `GET`    | `/api/v1/posts`                     | Lấy danh sách posts | No          |
| `POST`   | `/api/v1/posts`                     | Tạo post mới        | `X-User-ID` |
| `GET`    | `/api/v1/posts/{id}`                | Lấy chi tiết post   | No          |
| `PATCH`  | `/api/v1/posts/{id}`                | Cập nhật post       | `X-User-ID` |
| `DELETE` | `/api/v1/posts/{id}`                | Xóa post            | `X-User-ID` |
| `POST`   | `/api/v1/posts/upload`              | Upload files        | `X-User-ID` |
| `GET`    | `/api/v1/posts/{id}/comments`       | Lấy comments        | No          |
| `POST`   | `/api/v1/posts/{id}/comments`       | Tạo comment         | `X-User-ID` |
| `PATCH`  | `/api/v1/posts/{id}/comments/{cid}` | Sửa comment         | `X-User-ID` |
| `DELETE` | `/api/v1/posts/{id}/comments/{cid}` | Xóa comment         | `X-User-ID` |
| `GET`    | `/api/v1/posts/{id}/reactions`      | Lấy reactions       | No          |
| `POST`   | `/api/v1/posts/{id}/reactions`      | Like/React post     | `X-User-ID` |
| `DELETE` | `/api/v1/posts/{id}/reactions`      | Bỏ reaction         | `X-User-ID` |
| `POST`   | `/api/v1/comments/{id}/reactions`   | Like comment        | `X-User-ID` |
| `DELETE` | `/api/v1/comments/{id}/reactions`   | Bỏ like comment     | `X-User-ID` |

### 1.3 Gateway Routing

```
Frontend → Gateway (8000) → Post Service (8003)
         /api/service/posts/* → /api/v1/*
```

**Ví dụ:**

- `GET /api/service/posts/posts` → `GET /api/v1/posts`
- `POST /api/service/posts/posts` → `POST /api/v1/posts`
- `GET /api/service/posts/posts/{id}/comments` → `GET /api/v1/posts/{id}/comments`

---

## 🎯 IMPLEMENTATION TASKS

---

### Phase 1: API Layer

#### Task 1.1: Tạo Post API Module

**File**: `frontend/src/api/post.js`

```javascript
import axios from './axios'

// Posts
export const getPosts = (params = {}) => {
	const { limit = 10, offset = 0, userId, tag, q } = params
	const queryParams = new URLSearchParams()
	if (limit) queryParams.append('limit', limit)
	if (offset) queryParams.append('offset', offset)
	if (userId) queryParams.append('user_id', userId)
	if (tag) queryParams.append('tag', tag)
	if (q) queryParams.append('q', q)

	return axios.get(`/api/service/posts/posts?${queryParams}`)
}

export const getPostById = (postId) => {
	return axios.get(`/api/service/posts/posts/${postId}`)
}

export const createPost = (formData) => {
	// formData should include: content, files[], tags[], visibility
	return axios.post('/api/service/posts/posts', formData, {
		headers: { 'Content-Type': 'multipart/form-data' },
	})
}

export const updatePost = (postId, formData) => {
	return axios.patch(`/api/service/posts/posts/${postId}`, formData, {
		headers: { 'Content-Type': 'multipart/form-data' },
	})
}

export const deletePost = (postId) => {
	return axios.delete(`/api/service/posts/posts/${postId}`)
}

// Comments
export const getComments = (postId, params = {}) => {
	const { limit = 20, offset = 0 } = params
	return axios.get(
		`/api/service/posts/posts/${postId}/comments?limit=${limit}&offset=${offset}`
	)
}

export const createComment = (postId, formData) => {
	// formData: content, parent_id (optional), files[] (optional)
	return axios.post(`/api/service/posts/posts/${postId}/comments`, formData, {
		headers: { 'Content-Type': 'multipart/form-data' },
	})
}

export const updateComment = (postId, commentId, formData) => {
	return axios.patch(
		`/api/service/posts/posts/${postId}/comments/${commentId}`,
		formData,
		{
			headers: { 'Content-Type': 'multipart/form-data' },
		}
	)
}

export const deleteComment = (postId, commentId) => {
	return axios.delete(
		`/api/service/posts/posts/${postId}/comments/${commentId}`
	)
}

// Reactions
export const getPostReactions = (postId) => {
	return axios.get(`/api/service/posts/posts/${postId}/reactions`)
}

export const reactToPost = (postId, reactionType = 'like') => {
	return axios.post(`/api/service/posts/posts/${postId}/reactions`, {
		reaction_type: reactionType,
	})
}

export const removePostReaction = (postId) => {
	return axios.delete(`/api/service/posts/posts/${postId}/reactions`)
}

export const getCommentReactions = (commentId) => {
	return axios.get(`/api/service/posts/comments/${commentId}/reactions`)
}

export const reactToComment = (commentId, reactionType = 'like') => {
	return axios.post(`/api/service/posts/comments/${commentId}/reactions`, {
		reaction_type: reactionType,
	})
}

export const removeCommentReaction = (commentId) => {
	return axios.delete(`/api/service/posts/comments/${commentId}/reactions`)
}
```

---

### Phase 2: Feed Page Integration

#### Task 2.1: Update Feed.jsx - Load Real Posts

**File**: `frontend/src/pages/feed.jsx`

**Changes:**

1. Import post API
2. Replace `mockPosts` với API call
3. Update `handleCreatePost` để gọi API
4. Update `handleUpvote/Downvote` để gọi reaction API
5. Update `handleAddComment` để gọi comment API

**Key code changes:**

```javascript
// Import
import * as postApi from 'src/api/post'

// Load posts
const loadPosts = async () => {
	setLoading(true)
	try {
		const response = await postApi.getPosts({ limit: 20, offset: 0 })
		const transformedPosts = response.data.data.map(transformPost)
		setPosts(transformedPosts)
	} catch (error) {
		toast.error('Không thể tải bài viết')
	} finally {
		setLoading(false)
	}
}

// Transform API response to frontend format
const transformPost = (apiPost) => ({
	id: apiPost.post_id,
	author: {
		id: apiPost.user_id,
		name: 'User', // TODO: Fetch user info
		avatar: null,
	},
	community: apiPost.group_id || 'general',
	title: null, // API không có title
	content: apiPost.content,
	images: apiPost.media_urls || [],
	upvotes: apiPost.reacts_count,
	downvotes: 0,
	comments: apiPost.comments_count,
	hasUpvoted: false, // TODO: Check user reaction
	hasDownvoted: false,
	saved: false,
	isFollowing: false,
	createdAt: apiPost.created_at,
})

// Create post
const handleCreatePost = async (postData) => {
	const formData = new FormData()
	if (postData.content) formData.append('content', postData.content)
	if (postData.images) {
		postData.images.forEach((file) => formData.append('files', file))
	}

	try {
		const response = await postApi.createPost(formData)
		const newPost = transformPost(response.data.data)
		setPosts((prev) => [newPost, ...prev])
		toast.success('Đã tạo bài viết!')
	} catch (error) {
		toast.error('Không thể tạo bài viết')
	}
}

// React to post
const handleUpvote = async (postId) => {
	try {
		const post = posts.find((p) => p.id === postId)
		if (post.hasUpvoted) {
			await postApi.removePostReaction(postId)
		} else {
			await postApi.reactToPost(postId, 'like')
		}
		// Update local state
		setPosts((prev) =>
			prev.map((p) => {
				if (p.id === postId) {
					return {
						...p,
						hasUpvoted: !p.hasUpvoted,
						upvotes: p.hasUpvoted ? p.upvotes - 1 : p.upvotes + 1,
					}
				}
				return p
			})
		)
	} catch (error) {
		toast.error('Không thể thực hiện')
	}
}
```

---

### Phase 3: Comment Integration

#### Task 3.1: Update CommentSection

**File**: `frontend/src/components/post/CommentSection.jsx`

**Changes:**

1. Accept `onLoadComments` prop để fetch từ API
2. Thêm real-time comment creation
3. Handle nested replies (parent_id)

```javascript
// Transform API comment to frontend format
const transformComment = (apiComment) => ({
	id: apiComment.comment_id,
	author: {
		id: apiComment.user_id,
		name: 'User', // TODO: Fetch user
		avatar: null,
	},
	content: apiComment.content,
	likes: apiComment.reacts_count,
	liked: false, // TODO: Check user reaction
	createdAt: apiComment.created_at,
	replies: [], // Nested comments loaded separately
	media_urls: apiComment.media_urls,
})
```

---

### Phase 4: CreatePostModal Updates

#### Task 4.1: Update CreatePostModal for API

**File**: `frontend/src/components/post/CreatePostModal.jsx`

**Changes:**

1. Submit using FormData
2. Handle API response

```javascript
const handleSubmit = async (e) => {
	e.preventDefault()

	const formData = new FormData()
	if (content.trim()) formData.append('content', content.trim())
	images.forEach((img) => formData.append('files', img.file))

	setLoading(true)
	try {
		await onSubmit(formData) // Parent handles API call
		handleClose()
	} catch (error) {
		toast.error('Không thể tạo bài viết')
	} finally {
		setLoading(false)
	}
}
```

---

### Phase 5: User Info Enhancement

#### Task 5.1: Fetch User Info for Posts

**Problem:** Post service chỉ trả về `user_id`, không có username/avatar.

**Solution Options:**

1. **Option A: Batch fetch** - Collect unique user_ids, call user-service once
2. **Option B: Enrich at Gateway** - Gateway gọi user-service để enrich data
3. **Option C: Store in Supabase** - Denormalize user info vào posts table

**Recommended: Option A (Frontend batch fetch)**

```javascript
// After fetching posts
const userIds = [...new Set(posts.map((p) => p.user_id))]
const usersResponse = await userApi.getUsersByIds(userIds)
const usersMap = new Map(usersResponse.data.map((u) => [u.id, u]))

const enrichedPosts = posts.map((post) => ({
	...post,
	author: usersMap.get(post.user_id) || { id: post.user_id, name: 'Unknown' },
}))
```

---

## 📊 DATA MAPPING

### Post Object Mapping

| API Field        | Frontend Field | Notes                  |
| ---------------- | -------------- | ---------------------- |
| `post_id`        | `id`           | UUID                   |
| `user_id`        | `author.id`    | Cần fetch user info    |
| `content`        | `content`      | Text                   |
| `media_urls`     | `images`       | Array of URLs          |
| `tags`           | `tags`         | Array of strings       |
| `group_id`       | `community`    | Community/Group ID     |
| `visibility`     | -              | public/private/friends |
| `reacts_count`   | `upvotes`      | Total likes            |
| `comments_count` | `comments`     | Total comments         |
| `created_at`     | `createdAt`    | ISO timestamp          |
| `is_edited`      | -              | Boolean                |

### Comment Object Mapping

| API Field      | Frontend Field | Notes               |
| -------------- | -------------- | ------------------- |
| `comment_id`   | `id`           | UUID                |
| `user_id`      | `author.id`    | Cần fetch user info |
| `post_id`      | -              | Parent post         |
| `content`      | `content`      | Text                |
| `media_urls`   | `media`        | Array of URLs       |
| `parent_id`    | -              | For nested replies  |
| `reacts_count` | `likes`        | Total likes         |
| `created_at`   | `createdAt`    | ISO timestamp       |

---

## ⚠️ KNOWN ISSUES & SOLUTIONS

### Issue 1: Missing Title Field

**Problem:** Post service không có `title` field, frontend hiển thị title.
**Solution:** Loại bỏ title từ CreatePostModal hoặc thêm field vào backend.

### Issue 2: No User Info

**Problem:** Posts chỉ có `user_id`, không có username/avatar.
**Solution:** Batch fetch user info từ user-service.

### Issue 3: Reaction Check

**Problem:** API không trả về user đã react hay chưa.
**Solution:**

- Option A: Thêm endpoint `/posts/{id}/my-reaction`
- Option B: Fetch reactions list và check client-side

### Issue 4: Save/Bookmark Feature

**Problem:** Post service không có save/bookmark feature.
**Solution:**

- Implement trong user-service (saved_posts table)
- Hoặc tạm disable feature

### Issue 5: Follow Feature

**Problem:** Frontend có follow author, nhưng post service không track.
**Solution:** Gọi user-service để follow/unfollow.

---

## 📝 IMPLEMENTATION CHECKLIST

### Phase 1: API Layer

- [ ] Tạo `frontend/src/api/post.js`
- [ ] Test các API calls với Postman/curl

### Phase 2: Feed Integration

- [ ] Update `feed.jsx` - import post API
- [ ] Implement `loadPosts()` với API call
- [ ] Implement `transformPost()` helper
- [ ] Update `handleCreatePost()` với FormData
- [ ] Update `handleUpvote()` với reaction API
- [ ] Remove `mockPosts`

### Phase 3: Comments

- [ ] Update `CommentSection.jsx` - accept API data
- [ ] Implement load comments from API
- [ ] Implement create comment with API
- [ ] Handle nested replies (parent_id)

### Phase 4: CreatePostModal

- [ ] Update submit handler với FormData
- [ ] Pass FormData to parent

### Phase 5: User Info

- [ ] Implement batch user fetch
- [ ] Enrich posts with user info
- [ ] Enrich comments with user info

### Phase 6: Testing

- [ ] Test create post
- [ ] Test load posts
- [ ] Test reactions
- [ ] Test comments
- [ ] Test image upload

---

## 🚀 QUICK START

```bash
# 1. Ensure post-service is running
docker ps | grep post-service

# 2. Test API via gateway
curl http://localhost:8000/api/service/posts/posts

# 3. Start frontend
cd frontend && npm start
```

---

## 📅 ESTIMATED TIME

| Phase                     | Time           |
| ------------------------- | -------------- |
| Phase 1: API Layer        | 30 mins        |
| Phase 2: Feed Integration | 1-2 hours      |
| Phase 3: Comments         | 1 hour         |
| Phase 4: CreatePostModal  | 30 mins        |
| Phase 5: User Info        | 1 hour         |
| Phase 6: Testing          | 1 hour         |
| **Total**                 | **~5-6 hours** |

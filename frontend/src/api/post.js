import instance from './axios'

const POST_SERVICE_BASE_URL = '/api/service/posts'

// ============= POSTS =============

/**
 * Lấy danh sách posts
 * @param {Object} params - { limit, offset, user_id, tag, q, sort_by, order }
 */
export const getPosts = (params = {}) => {
	const queryParams = new URLSearchParams()

	if (params.limit) queryParams.append('limit', params.limit)
	if (params.offset) queryParams.append('offset', params.offset)
	if (params.user_id) queryParams.append('user_id', params.user_id)
	if (params.tag) queryParams.append('tag', params.tag)
	if (params.q) queryParams.append('q', params.q)
	if (params.sort_by) queryParams.append('sort_by', params.sort_by)
	if (params.order) queryParams.append('order', params.order)

	const queryString = queryParams.toString()
	return instance.get(
		`${POST_SERVICE_BASE_URL}/posts${queryString ? `?${queryString}` : ''}`
	)
}

/**
 * Lấy chi tiết một post
 * @param {string} postId - UUID của post
 */
export const getPostById = (postId) => {
	return instance.get(`${POST_SERVICE_BASE_URL}/posts/${postId}`)
}

/**
 * Tạo post mới
 * @param {FormData} formData - content, files[], tags[], visibility, group_id
 */
export const createPost = (formData) => {
	return instance.post(`${POST_SERVICE_BASE_URL}/posts`, formData, {
		headers: { 'Content-Type': 'multipart/form-data' },
	})
}

/**
 * Cập nhật post
 * @param {string} postId - UUID của post
 * @param {FormData} formData - content, files[], tags[], visibility
 */
export const updatePost = (postId, formData) => {
	return instance.patch(`${POST_SERVICE_BASE_URL}/posts/${postId}`, formData, {
		headers: { 'Content-Type': 'multipart/form-data' },
	})
}

/**
 * Xóa post
 * @param {string} postId - UUID của post
 */
export const deletePost = (postId) => {
	return instance.delete(`${POST_SERVICE_BASE_URL}/posts/${postId}`)
}

/**
 * Upload files riêng lẻ
 * @param {File[]} files - Array of files
 */
export const uploadFiles = (files) => {
	const formData = new FormData()
	files.forEach((file) => formData.append('files', file))

	return instance.post(`${POST_SERVICE_BASE_URL}/posts/upload`, formData, {
		headers: { 'Content-Type': 'multipart/form-data' },
	})
}

// ============= COMMENTS =============

/**
 * Lấy comments của một post
 * @param {string} postId - UUID của post
 * @param {Object} params - { limit, offset }
 */
export const getComments = (postId, params = {}) => {
	const { limit = 20, offset = 0 } = params
	return instance.get(
		`${POST_SERVICE_BASE_URL}/posts/${postId}/comments?limit=${limit}&offset=${offset}`
	)
}

/**
 * Tạo comment mới
 * @param {string} postId - UUID của post
 * @param {FormData} formData - content, parent_id (optional), files[] (optional)
 */
export const createComment = (postId, formData) => {
	return instance.post(
		`${POST_SERVICE_BASE_URL}/posts/${postId}/comments`,
		formData,
		{
			headers: { 'Content-Type': 'multipart/form-data' },
		}
	)
}

/**
 * Cập nhật comment
 * @param {string} postId - UUID của post
 * @param {string} commentId - UUID của comment
 * @param {FormData} formData - content, files[]
 */
export const updateComment = (postId, commentId, formData) => {
	return instance.patch(
		`${POST_SERVICE_BASE_URL}/posts/${postId}/comments/${commentId}`,
		formData,
		{
			headers: { 'Content-Type': 'multipart/form-data' },
		}
	)
}

/**
 * Xóa comment
 * @param {string} postId - UUID của post
 * @param {string} commentId - UUID của comment
 */
export const deleteComment = (postId, commentId) => {
	return instance.delete(
		`${POST_SERVICE_BASE_URL}/posts/${postId}/comments/${commentId}`
	)
}

// ============= POST REACTIONS =============

/**
 * Lấy reactions của post
 * @param {string} postId - UUID của post
 */
export const getPostReactions = (postId) => {
	return instance.get(`${POST_SERVICE_BASE_URL}/posts/${postId}/reactions`)
}

/**
 * React vào post (like, love, haha, wow, sad, angry)
 * @param {string} postId - UUID của post
 * @param {string} reactionType - loại reaction (default: 'like')
 */
export const reactToPost = (postId, reactionType = 'like') => {
	return instance.post(`${POST_SERVICE_BASE_URL}/posts/${postId}/reactions`, {
		reaction_type: reactionType,
	})
}

/**
 * Bỏ reaction khỏi post
 * @param {string} postId - UUID của post
 */
export const removePostReaction = (postId) => {
	return instance.delete(`${POST_SERVICE_BASE_URL}/posts/${postId}/reactions`)
}

// ============= COMMENT REACTIONS =============

/**
 * Lấy reactions của comment
 * @param {string} commentId - UUID của comment
 */
export const getCommentReactions = (commentId) => {
	return instance.get(
		`${POST_SERVICE_BASE_URL}/comments/${commentId}/reactions`
	)
}

/**
 * React vào comment
 * @param {string} commentId - UUID của comment
 * @param {string} reactionType - loại reaction (default: 'like')
 */
export const reactToComment = (commentId, reactionType = 'like') => {
	return instance.post(
		`${POST_SERVICE_BASE_URL}/comments/${commentId}/reactions`,
		{
			reaction_type: reactionType,
		}
	)
}

/**
 * Bỏ reaction khỏi comment
 * @param {string} commentId - UUID của comment
 */
export const removeCommentReaction = (commentId) => {
	return instance.delete(
		`${POST_SERVICE_BASE_URL}/comments/${commentId}/reactions`
	)
}

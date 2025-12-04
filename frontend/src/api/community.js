import axios from './axios'

const BASE_URL = '/api/service/community'

// ============= COMMUNITY ENDPOINTS =============

/**
 * Tạo community mới
 * @param {Object} data - { name, slug, description, visibility, settings }
 */
export const createCommunity = async (data) => {
	const response = await axios.post(`${BASE_URL}/communities`, data)
	return response.data
}

/**
 * Lấy thông tin community theo ID
 * @param {string} id - Community ID
 */
export const getCommunityById = async (id) => {
	const response = await axios.get(`${BASE_URL}/communities/${id}`)
	return response.data
}

/**
 * Lấy thông tin community theo slug
 * @param {string} slug - Community slug
 */
export const getCommunityBySlug = async (slug) => {
	const response = await axios.get(`${BASE_URL}/communities/slug/${slug}`)
	return response.data
}

/**
 * Cập nhật community
 * @param {string} id - Community ID
 * @param {Object} data - { name, description, visibility, settings, ... }
 */
export const updateCommunity = async (id, data) => {
	const response = await axios.patch(`${BASE_URL}/communities/${id}`, data)
	return response.data
}

/**
 * Xóa community
 * @param {string} id - Community ID
 */
export const deleteCommunity = async (id) => {
	const response = await axios.delete(`${BASE_URL}/communities/${id}`)
	return response.data
}

// ============= PINNED POSTS ENDPOINTS =============

/**
 * Lấy danh sách bài viết được ghim
 * @param {string} communityId - Community ID
 */
export const getPinnedPosts = async (communityId) => {
	const response = await axios.get(
		`${BASE_URL}/communities/${communityId}/pinned-posts`
	)
	return response.data
}

/**
 * Ghim bài viết
 * @param {string} communityId - Community ID
 * @param {string} postId - Post ID
 */
export const pinPost = async (communityId, postId) => {
	const response = await axios.post(
		`${BASE_URL}/communities/${communityId}/pinned-posts`,
		{ post_id: postId }
	)
	return response.data
}

/**
 * Bỏ ghim bài viết
 * @param {string} communityId - Community ID
 * @param {string} postId - Post ID
 */
export const unpinPost = async (communityId, postId) => {
	const response = await axios.delete(
		`${BASE_URL}/communities/${communityId}/pinned-posts/${postId}`
	)
	return response.data
}

// ============= MEMBERSHIP ENDPOINTS =============

/**
 * Lấy danh sách thành viên của community
 * @param {string} communityId - Community ID
 */
export const getCommunityMembers = async (communityId) => {
	const response = await axios.get(
		`${BASE_URL}/communities/${communityId}/members`
	)
	return response.data
}

/**
 * Tham gia community
 * @param {string} communityId - Community ID
 * @param {string} status - 'pending' (cần duyệt) hoặc 'approved' (public)
 */
export const joinCommunity = async (communityId, status = 'pending') => {
	const response = await axios.post(
		`${BASE_URL}/communities/${communityId}/members`,
		{ status }
	)
	return response.data
}

/**
 * Rời khỏi community
 * @param {string} communityId - Community ID
 */
export const leaveCommunity = async (communityId) => {
	const response = await axios.delete(
		`${BASE_URL}/communities/${communityId}/members/me`
	)
	return response.data
}

/**
 * Kick/từ chối thành viên
 * @param {string} communityId - Community ID
 * @param {string} userId - User ID cần xóa
 */
export const removeMember = async (communityId, userId) => {
	const response = await axios.delete(
		`${BASE_URL}/communities/${communityId}/members/${userId}`
	)
	return response.data
}

/**
 * Lấy trạng thái membership của user hiện tại trong community
 * @param {string} communityId - Community ID
 */
export const getMyMembership = async (communityId) => {
	const response = await axios.get(
		`${BASE_URL}/communities/${communityId}/membership`
	)
	return response.data
}

/**
 * Lấy membership theo ID
 * @param {string} membershipId - Membership ID
 */
export const getMembershipById = async (membershipId) => {
	const response = await axios.get(`${BASE_URL}/memberships/${membershipId}`)
	return response.data
}

/**
 * Cập nhật membership (approve, ban, unban, change role)
 * @param {string} membershipId - Membership ID
 * @param {Object} data - { status?: 'approved'|'banned', role?: 'member'|'moderator'|'admin', flair?: string }
 */
export const updateMembership = async (membershipId, data) => {
	const response = await axios.patch(
		`${BASE_URL}/memberships/${membershipId}`,
		data
	)
	return response.data
}

/**
 * Xóa membership
 * @param {string} membershipId - Membership ID
 */
export const deleteMembership = async (membershipId) => {
	const response = await axios.delete(`${BASE_URL}/memberships/${membershipId}`)
	return response.data
}

/**
 * Lấy danh sách community của user hiện tại
 */
export const getMyCommunities = async () => {
	const response = await axios.get(`${BASE_URL}/users/me/communities`)
	return response.data
}

// ============= INVITATION ENDPOINTS =============

/**
 * Lấy danh sách lời mời của community
 * @param {string} communityId - Community ID
 */
export const getCommunityInvitations = async (communityId) => {
	const response = await axios.get(
		`${BASE_URL}/communities/${communityId}/invitations`
	)
	return response.data
}

/**
 * Tạo lời mời
 * @param {string} communityId - Community ID
 * @param {Object} data - { invitee_id?: string, invitee_email?: string }
 */
export const createInvitation = async (communityId, data) => {
	const response = await axios.post(
		`${BASE_URL}/communities/${communityId}/invitations`,
		data
	)
	return response.data
}

/**
 * Lấy thông tin lời mời theo token
 * @param {string} token - Invitation token
 */
export const getInvitation = async (token) => {
	const response = await axios.get(`${BASE_URL}/invitations/${token}`)
	return response.data
}

/**
 * Chấp nhận lời mời
 * @param {string} token - Invitation token
 */
export const acceptInvitation = async (token) => {
	const response = await axios.post(`${BASE_URL}/invitations/${token}/accept`)
	return response.data
}

/**
 * Thu hồi lời mời
 * @param {string} token - Invitation token
 */
export const revokeInvitation = async (token) => {
	const response = await axios.delete(`${BASE_URL}/invitations/${token}`)
	return response.data
}

// ============= HELPER FUNCTIONS =============

/**
 * Approve membership request
 */
export const approveMembership = (membershipId) =>
	updateMembership(membershipId, { status: 'approved' })

/**
 * Ban member
 */
export const banMember = (membershipId) =>
	updateMembership(membershipId, { status: 'banned' })

/**
 * Unban member
 */
export const unbanMember = (membershipId) =>
	updateMembership(membershipId, { status: 'approved' })

/**
 * Change member role
 */
export const changeMemberRole = (membershipId, role) =>
	updateMembership(membershipId, { role })

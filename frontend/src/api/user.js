import instance from 'src/api/axios'

// Đi qua gateway proxy đến user-service
// Gateway pathRewrite: /api/service/users/* → /users/*
// User-service mount routes at: /users/*
// Nên: /api/service/users/me → /users/me → user-service /users/me ✅
const USER_SERVICE_BASE_URL = '/api/service/users'

export const getMe = () => instance.get(`${USER_SERVICE_BASE_URL}/me`)

export const getUserStats = (userId) =>
	instance.get(`${USER_SERVICE_BASE_URL}/${userId}/stats`)

export const getUserByUsername = (username) =>
	instance.get(`${USER_SERVICE_BASE_URL}/u/${username}`)

export const getUserById = (userId) =>
	instance.get(`${USER_SERVICE_BASE_URL}/${userId}`)

export const updateUser = (userId, updateData) =>
	instance.patch(`${USER_SERVICE_BASE_URL}/${userId}`, updateData)

export const updatePassword = (userId, currentPassword, newPassword) =>
	instance.patch(`${USER_SERVICE_BASE_URL}/${userId}/password`, {
		currentPassword,
		newPassword,
	})

export const getUserSettings = (userId) =>
	instance.get(`${USER_SERVICE_BASE_URL}/${userId}/settings`)

export const updateUserSettings = (userId, settings) =>
	instance.patch(`${USER_SERVICE_BASE_URL}/${userId}/settings`, settings)

// Follow/Unfollow APIs
export const checkFollowStatus = (targetId) =>
	instance.get(`${USER_SERVICE_BASE_URL}/follow/${targetId}/status`)

export const followUser = (targetId) =>
	instance.post(`${USER_SERVICE_BASE_URL}/follow/${targetId}`)

export const unfollowUser = (targetId) =>
	instance.delete(`${USER_SERVICE_BASE_URL}/follow/${targetId}`)

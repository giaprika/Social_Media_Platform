import { v4 as uuidv4 } from 'uuid'
import {
	hashPassword,
	comparePassword,
	recordToken,
} from '../utils/authUtils.js'
import { UserRepository } from '../repositories/user.repository.js'

export class UserService {
	static async createUser(userData) {
		const {
			email,
			password,
			full_name,
			avatar_url = null,
			birth_date,
			gender,
			username,
			metadata = {},
		} = userData

		const existingUser = await UserRepository.findUserByEmail(email)
		if (existingUser) {
			throw new Error('Đã có người sử dụng email này.')
		}

		// Generate username from email if not provided or empty
		let generatedUsername = username?.trim()
		if (!generatedUsername || generatedUsername.length === 0) {
			const emailPrefix = email.split('@')[0]
			// Remove special characters and make it lowercase
			generatedUsername = emailPrefix.toLowerCase().replace(/[^a-z0-9]/g, '')
			// Ensure minimum length
			if (generatedUsername.length < 3) {
				generatedUsername = generatedUsername + '123'
			}
			// Ensure username is unique by appending random number if needed
			let counter = 1
			let finalUsername = generatedUsername
			while (await UserRepository.findUserByUsername(finalUsername)) {
				finalUsername = `${generatedUsername}${counter}`
				counter++
				// Prevent infinite loop
				if (counter > 1000) {
					finalUsername = `${generatedUsername}${Date.now()}`
					break
				}
			}
			generatedUsername = finalUsername
		} else {
			// Normalize username: lowercase and trim
			generatedUsername = generatedUsername.toLowerCase().trim()
			// Check if provided username is already taken
			const existingUsername = await UserRepository.findUserByUsername(
				generatedUsername
			)
			if (existingUsername) {
				throw new Error('Tên người dùng này đã được sử dụng.')
			}
		}

		const hashedPassword = await hashPassword(password)
		const userId = uuidv4()

		const newUser = {
			id: userId,
			username: generatedUsername,
			email,
			hashed_password: hashedPassword,
			full_name,
			avatar_url,
			birth_date,
			gender,
			created_at: new Date(),
			metadata,
		}

		console.log('🆕 Creating new user:', newUser)

		const createdUser = await UserRepository.insertUser(newUser)
		return createdUser
	}

	static async deleteUser(userId) {
		const existingUser = await UserRepository.findUserById(userId)
		if (!existingUser) {
			throw new Error('Người dùng không tồn tại.')
		}
		return await UserRepository.deleteUserById(existingUser.id)
	}

	static async findUserByEmail(email) {
		return await UserRepository.findUserByEmail(email)
	}

	static async findUserById(id) {
		return await UserRepository.findUserById(id)
	}

	static async findUserByUsername(username) {
		return await UserRepository.findUserByUsername(username)
	}

	static async loginUser(email, password) {
		const user = await UserRepository.findUserByEmailWithPassword(email)
		if (!user) {
			throw new Error('Email hoặc mật khẩu không đúng.')
		}

		// Check if user is banned
		if (user.status === 'banned') {
			throw new Error('Tài khoản của bạn đã bị khóa.')
		}

		if (user.status === 'suspended') {
			throw new Error('Tài khoản của bạn đã bị tạm khóa.')
		}

		const isMatch = await comparePassword(password, user.hashed_password)
		if (!isMatch) {
			throw new Error('Email hoặc mật khẩu không đúng.')
		}

		const { hashed_password, ...userInfo } = user
		return userInfo
	}

	static async saveRefreshToken(userId, refreshToken, expiresAt) {
		await recordToken(userId, refreshToken, expiresAt)
	}

	static async searchUsersByName(fullName) {
		if (!fullName || fullName.trim() === '') {
			throw new Error('Search name cannot be empty.')
		}
		return await UserRepository.searchUsersByName(fullName.trim())
	}

	static async updateUserStatus(userId, status) {
		const validStatuses = ['active', 'banned', 'suspended']
		if (!validStatuses.includes(status)) {
			throw new Error(
				`Trạng thái không hợp lệ. Chỉ chấp nhận: ${validStatuses.join(', ')}`
			)
		}

		const existingUser = await UserRepository.findUserById(userId)
		if (!existingUser) {
			throw new Error('Người dùng không tồn tại.')
		}

		const updatedUser = await UserRepository.updateUserStatus(userId, status)
		return updatedUser
	}

	static async getUserStats(userId) {
		const user = await UserRepository.findUserById(userId)
		if (!user) {
			throw new Error('Người dùng không tồn tại.')
		}

		// Get followers and following count
		const followersCount = await UserRepository.getFollowersCount(userId)
		const followingCount = await UserRepository.getFollowingCount(userId)

		// TODO: Get likes, posts, comments from post-service and comment-service
		// For now, return 0 if services are not available
		let totalLikes = 0
		let postsCount = 0
		let commentsCount = 0

		try {
			// Try to get stats from post-service if available
			// This will be implemented when post-service is ready
			// const postServiceUrl = process.env.POST_SERVICE_URL;
			// if (postServiceUrl) {
			//   const response = await axios.get(`${postServiceUrl}/users/${userId}/stats`);
			//   totalLikes = response.data.totalLikes || 0;
			//   postsCount = response.data.postsCount || 0;
			//   commentsCount = response.data.commentsCount || 0;
			// }
		} catch (error) {
			// If post-service is not available, use default values
			console.log('Post service not available, using default stats')
		}

		return {
			followers: followersCount,
			following: followingCount,
			likes: totalLikes,
			posts: postsCount,
			comments: commentsCount,
			created_at: user.created_at,
		}
	}

	static async checkFollowStatus(userId, targetId) {
		if (userId === targetId) {
			return { isFollowing: false, isSelf: true }
		}
		const relationship = await UserRepository.checkFollowStatus(
			userId,
			targetId
		)
		return {
			isFollowing: relationship?.status === 'accepted',
			isSelf: false,
		}
	}

	static async followUser(userId, targetId) {
		if (userId === targetId) {
			throw new Error('Không thể follow chính mình.')
		}

		const targetUser = await UserRepository.findUserById(targetId)
		if (!targetUser) {
			throw new Error('Người dùng không tồn tại.')
		}

		return await UserRepository.followUser(userId, targetId)
	}

	static async unfollowUser(userId, targetId) {
		if (userId === targetId) {
			throw new Error('Không thể unfollow chính mình.')
		}

		return await UserRepository.unfollowUser(userId, targetId)
	}

	static async updateUser(userId, updateData) {
		const existingUser = await UserRepository.findUserById(userId)
		if (!existingUser) {
			throw new Error('Người dùng không tồn tại.')
		}

		// Check if email is being updated and if it's already taken
		if (updateData.email && updateData.email !== existingUser.email) {
			const emailExists = await UserRepository.findUserByEmail(updateData.email)
			if (emailExists) {
				throw new Error('Email này đã được sử dụng bởi tài khoản khác.')
			}
		}

		// Check if username is being updated and if it's already taken
		if (updateData.username && updateData.username !== existingUser.username) {
			const usernameExists = await UserRepository.findUserByUsername(
				updateData.username
			)
			if (usernameExists) {
				throw new Error('Tên người dùng này đã được sử dụng.')
			}
			// Validate username format
			if (!/^[a-zA-Z0-9_]+$/.test(updateData.username)) {
				throw new Error(
					'Tên người dùng chỉ được chứa chữ cái, số và dấu gạch dưới.'
				)
			}
			if (updateData.username.length < 3 || updateData.username.length > 20) {
				throw new Error('Tên người dùng phải có từ 3 đến 20 ký tự.')
			}
		}

		const updatedUser = await UserRepository.updateUser(userId, updateData)
		return updatedUser
	}

	static async updatePassword(userId, currentPassword, newPassword) {
		const existingUser = await UserRepository.findUserById(userId)
		if (!existingUser) {
			throw new Error('Người dùng không tồn tại.')
		}

		// Get current password hash
		const currentPasswordHash = await UserRepository.getUserPassword(userId)
		if (!currentPasswordHash) {
			throw new Error('Không tìm thấy mật khẩu hiện tại.')
		}

		// Verify current password
		const isMatch = await comparePassword(currentPassword, currentPasswordHash)
		if (!isMatch) {
			throw new Error('Mật khẩu hiện tại không đúng.')
		}

		// Hash new password
		const hashedNewPassword = await hashPassword(newPassword)

		// Update password
		const updatedUser = await UserRepository.updatePassword(
			userId,
			hashedNewPassword
		)
		return updatedUser
	}

	static async getUserSettings(userId) {
		const existingUser = await UserRepository.findUserById(userId)
		if (!existingUser) {
			throw new Error('Người dùng không tồn tại.')
		}
		return await UserRepository.getUserSettings(userId)
	}

	static async updateUserSettings(userId, settings) {
		const existingUser = await UserRepository.findUserById(userId)
		if (!existingUser) {
			throw new Error('Người dùng không tồn tại.')
		}
		return await UserRepository.updateUserSettings(userId, settings)
	}
}

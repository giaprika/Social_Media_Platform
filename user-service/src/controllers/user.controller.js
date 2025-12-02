import { UserService } from '../services/user.service.js'

export class UserController {
	static async createUser(req, res) {
		try {
			const userData = req.body
			console.log('Creating user with data:', { ...userData, password: '***' })
			const newUser = await UserService.createUser(userData)
			console.log('User created successfully:', {
				id: newUser.id,
				username: newUser.username,
			})
			res.status(201).json(newUser)
		} catch (error) {
			console.error('Error creating user:', error)
			res.status(400).json({ error: error.message })
		}
	}

	static async deleteUser(req, res) {
		try {
			const userId = req.params.id
			const deletedUser = await UserService.deleteUser(userId)
			res
				.status(200)
				.json({ message: `Xóa người dùng thành công, ${deletedUser}` })
		} catch (error) {
			res.status(400).json({ error: error.message })
		}
	}

	static async validateUser(req, res) {
		try {
			const userData = req.body
			const user = await UserService.findUserByEmail(userData.email)
			if (user) {
				res.status(400).json({ error: 'Đã có người dùng sử dụng email này.' })
			}
		} catch (error) {
			res.status(400).json({ error: error.message })
		}
	}

	static async getUserById(req, res) {
		try {
			const userId = req.headers['x-user-id']
			const user = await UserService.findUserById(userId)
			if (!user) {
				return res.status(404).json({ error: 'Không tìm thấy người dùng' })
			}
			res.status(200).json(user)
		} catch (error) {
			res.status(500).json({ error: error.message })
		}
	}

	static async loginUser(req, res) {
		try {
			const { email, password } = req.body
			const user = await UserService.loginUser(email, password)
			res.status(200).json(user)
		} catch (error) {
			res.status(401).json({ error: error.message })
		}
	}

	static async saveRefreshToken(req, res) {
		try {
			const { userId, refreshToken, expiresAt } = req.body
			await UserService.saveRefreshToken(userId, refreshToken, expiresAt)
			res.status(200).json({ message: 'Refresh token saved successfully' })
		} catch (error) {
			res.status(400).json({ error: error.message })
		}
	}

	static async searchUsers(req, res) {
		try {
			const { q } = req.query
			if (!q)
				return res.status(400).json({ error: "Search query 'q' is required" })
			const users = await UserService.searchUsersByName(q)
			res.status(200).json(users)
		} catch (error) {
			res.status(400).json({ error: error.message })
		}
	}

	static async getUserByIdPublic(req, res) {
		try {
			const userId = req.params.id
			const user = await UserService.findUserById(userId)
			if (!user) {
				return res.status(404).json({ error: 'Không tìm thấy người dùng' })
			}
			res.status(200).json(user)
		} catch (error) {
			res.status(500).json({ error: error.message })
		}
	}

	static async getUserByUsername(req, res) {
		try {
			const { username } = req.params
			const user = await UserService.findUserByUsername(username)
			if (!user) {
				return res.status(404).json({ error: 'Không tìm thấy người dùng' })
			}
			res.status(200).json(user)
		} catch (error) {
			res.status(500).json({ error: error.message })
		}
	}

	static async updateUserStatus(req, res) {
		try {
			const userId = req.params.id
			const { status } = req.body

			if (!status) {
				return res
					.status(400)
					.json({ error: 'Trạng thái (status) là bắt buộc' })
			}

			const updatedUser = await UserService.updateUserStatus(userId, status)
			res.status(200).json({
				message: 'Cập nhật trạng thái thành công',
				user: updatedUser,
			})
		} catch (error) {
			res.status(400).json({ error: error.message })
		}
	}

	static async getUserStats(req, res) {
		try {
			const userId = req.params.id
			const stats = await UserService.getUserStats(userId)
			res.status(200).json(stats)
		} catch (error) {
			res.status(500).json({ error: error.message })
		}
	}

	static async updateUser(req, res) {
		try {
			const userId = req.params.id
			const updateData = req.body

			console.log('Update user request:', { userId, updateData })

			const updatedUser = await UserService.updateUser(userId, updateData)

			console.log('Updated user:', updatedUser)

			res.status(200).json({
				message: 'Cập nhật thông tin thành công',
				user: updatedUser,
			})
		} catch (error) {
			console.error('Error updating user:', error)
			res.status(400).json({ error: error.message })
		}
	}

	static async updatePassword(req, res) {
		try {
			const userId = req.params.id
			const { currentPassword, newPassword } = req.body

			if (!currentPassword || !newPassword) {
				return res
					.status(400)
					.json({ error: 'Mật khẩu hiện tại và mật khẩu mới là bắt buộc' })
			}

			const updatedUser = await UserService.updatePassword(
				userId,
				currentPassword,
				newPassword
			)
			res.status(200).json({
				message: 'Đổi mật khẩu thành công',
				user: updatedUser,
			})
		} catch (error) {
			res.status(400).json({ error: error.message })
		}
	}

	static async getUserSettings(req, res) {
		try {
			const userId = req.params.id
			const settings = await UserService.getUserSettings(userId)
			res.status(200).json(settings)
		} catch (error) {
			res.status(400).json({ error: error.message })
		}
	}

	static async updateUserSettings(req, res) {
		try {
			const userId = req.params.id
			const settings = req.body

			const updatedSettings = await UserService.updateUserSettings(
				userId,
				settings
			)
			res.status(200).json({
				message: 'Cập nhật settings thành công',
				settings: updatedSettings,
			})
		} catch (error) {
			res.status(400).json({ error: error.message })
		}
	}

	static async checkFollowStatus(req, res) {
		try {
			const userId = req.headers['x-user-id']
			const targetId = req.params.targetId

			if (!userId) {
				return res.status(401).json({ error: 'Unauthorized' })
			}

			const status = await UserService.checkFollowStatus(userId, targetId)
			res.status(200).json(status)
		} catch (error) {
			res.status(500).json({ error: error.message })
		}
	}

	static async followUser(req, res) {
		try {
			const userId = req.headers['x-user-id']
			const targetId = req.params.targetId

			if (!userId) {
				return res.status(401).json({ error: 'Unauthorized' })
			}

			const result = await UserService.followUser(userId, targetId)
			res.status(200).json({
				message: 'Follow thành công',
				relationship: result,
			})
		} catch (error) {
			res.status(400).json({ error: error.message })
		}
	}

	static async unfollowUser(req, res) {
		try {
			const userId = req.headers['x-user-id']
			const targetId = req.params.targetId

			if (!userId) {
				return res.status(401).json({ error: 'Unauthorized' })
			}

			const result = await UserService.unfollowUser(userId, targetId)
			res.status(200).json({
				message: 'Unfollow thành công',
				relationship: result,
			})
		} catch (error) {
			res.status(400).json({ error: error.message })
		}
	}
}

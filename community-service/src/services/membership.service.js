import { v4 as uuidv4 } from 'uuid'
import { randomBytes } from 'crypto'
import axios from 'axios'
import { MembershipRepository } from '../repositories/membership.repository.js'
import { CommunityRepository } from '../repositories/community.repository.js'
import { Membership, Invitation } from '../models/models.js'

// Notification service URL
const NOTIFICATION_SERVICE_URL =
	process.env.NOTIFICATION_SERVICE_URL || 'http://notification-service:8002'

export class MembershipService {
	/**
	 * Get membership by ID
	 */
	static async getMembershipById(membershipId) {
		const membership = await MembershipRepository.findById(membershipId)
		if (!membership) {
			return null
		}
		return new Membership(membership)
	}

	/**
	 * Delete membership by ID
	 */
	static async deleteMembershipById(membershipId) {
		const deleted = await MembershipRepository.deleteById(membershipId)
		if (!deleted) {
			throw new Error('Membership không tồn tại.')
		}
		return deleted
	}

	/**
	 * Join a community
	 */
	static async joinCommunity(communityId, userId, status = 'pending') {
		const membership = await MembershipRepository.create({
			id: uuidv4(),
			community_id: communityId,
			user_id: userId,
			role: 'member',
			status,
		})

		// Publish notification event nếu status là approved
		if (status === 'approved') {
			try {
				const community = await CommunityRepository.findById(communityId)
				if (community) {
					// Publish qua RabbitMQ
					const { RabbitMQProducer } = await import(
						'../../user-service/src/services/rabbitmq.producer.js'
					)
					await RabbitMQProducer.connect()
					await RabbitMQProducer.publish('community.joined', {
						user_id: userId,
						community_id: communityId,
						community_name: community.name,
						title_template: 'Bạn đã tham gia cộng đồng mới!',
						body_template: `Bạn vừa tham gia cộng đồng: ${community.name}`,
						link_url: `/c/${community.slug}`,
					})
				}
			} catch (err) {
				// Log error nhưng không fail action
				console.error(
					'Failed to publish community.joined notification:',
					err.message
				)
			}
		}

		return new Membership(membership)
	}

	/**
	 * Leave a community
	 */
	static async leaveCommunity(communityId, userId) {
		const deleted = await MembershipRepository.delete(communityId, userId)
		if (!deleted) {
			throw new Error('Membership không tồn tại.')
		}
		return deleted
	}

	/**
	 * Approve membership request
	 */
	static async approveMembership(membershipId) {
		const updated = await MembershipRepository.update(membershipId, {
			status: 'approved',
		})
		if (!updated) {
			throw new Error('Membership not found.')
		}

		// Send welcome notification to the approved user
		try {
			const community = await CommunityRepository.findById(updated.community_id)
			if (community) {
				await axios.post(`${NOTIFICATION_SERVICE_URL}/notifications`, {
					user_ids: [updated.user_id],
					title_template: 'Membership Approved!',
					body_template: `Your request to join c/${community.slug} has been approved. Welcome!`,
					link_url: `/c/${community.slug}`,
				})
			}
		} catch (err) {
			console.error('Failed to send approval notification:', err.message)
		}

		return new Membership(updated)
	}

	/**
	 * Reject membership request
	 */
	static async rejectMembership(communityId, userId) {
		const deleted = await MembershipRepository.delete(communityId, userId)
		if (!deleted) {
			throw new Error('Membership không tồn tại.')
		}
		return deleted
	}

	/**
	 * Ban a member
	 */
	static async banMember(membershipId) {
		const updated = await MembershipRepository.update(membershipId, {
			status: 'banned',
		})
		if (!updated) {
			throw new Error('Membership không tồn tại.')
		}
		return new Membership(updated)
	}

	/**
	 * Unban a member
	 */
	static async unbanMember(membershipId) {
		const updated = await MembershipRepository.update(membershipId, {
			status: 'approved',
		})
		if (!updated) {
			throw new Error('Membership không tồn tại.')
		}
		return new Membership(updated)
	}

	/**
	 * Update member role
	 */
	static async updateMemberRole(membershipId, newRole) {
		const updated = await MembershipRepository.update(membershipId, {
			role: newRole,
		})
		if (!updated) {
			throw new Error('Membership không tồn tại.')
		}
		return new Membership(updated)
	}

	/**
	 * Get members of a community
	 */
	static async getCommunityMembers(communityId) {
		const members = await MembershipRepository.findByCommunity(communityId)
		return members.map((m) => new Membership(m))
	}

	/**
	 * Get communities of a user
	 */
	static async getUserCommunities(userId) {
		return await MembershipRepository.findByUser(userId)
	}

	/**
	 * Get membership info
	 */
	static async getMembership(communityId, userId) {
		const membership = await MembershipRepository.findByCommunityAndUser(
			communityId,
			userId
		)
		if (!membership) {
			return null
		}
		return new Membership(membership)
	}

	/**
	 * Update membership
	 */
	static async updateMembership(membershipId, updateData) {
		const updated = await MembershipRepository.update(membershipId, updateData)
		if (!updated) {
			throw new Error('Membership không tồn tại.')
		}
		return new Membership(updated)
	}

	// ============= INVITATION METHODS =============

	/**
	 * Create an invitation
	 */
	static async createInvitation(communityId, inviterId, invitationData) {
		const { invitee_id, invitee_email } = invitationData

		if (!invitee_id && !invitee_email) {
			throw new Error('Cần cung cấp invitee_id hoặc invitee_email.')
		}

		// Generate token
		const token = randomBytes(32).toString('hex')

		// Set expiration (7 days from now)
		const expiresAt = new Date()
		expiresAt.setDate(expiresAt.getDate() + 7)

		const invitation = await MembershipRepository.createInvitation({
			id: uuidv4(),
			community_id: communityId,
			inviter_id: inviterId,
			invitee_id: invitee_id || null,
			invitee_email: invitee_email || null,
			token,
			expires_at: expiresAt,
		})

		return new Invitation(invitation)
	}

	/**
	 * Accept an invitation
	 */
	static async acceptInvitation(token, userId) {
		const invitation = await MembershipRepository.findInvitationByToken(token)
		if (!invitation) {
			throw new Error('Invitation không tồn tại.')
		}

		const invitationModel = new Invitation(invitation)

		// Check if invitation is expired
		if (invitationModel.isExpired()) {
			await MembershipRepository.updateInvitationStatus(token, 'expired')
			throw new Error('Invitation đã hết hạn.')
		}

		// Check if already a member
		const existing = await MembershipRepository.findByCommunityAndUser(
			invitationModel.community_id,
			userId
		)
		if (existing && existing.status === 'approved') {
			await MembershipRepository.updateInvitationStatus(token, 'accepted')
			throw new Error('Bạn đã là thành viên của community này.')
		}

		// Create or update membership
		if (existing) {
			const updated = await MembershipRepository.update(existing.id, {
				status: 'approved',
			})
			await MembershipRepository.updateInvitationStatus(token, 'accepted')
			return new Membership(updated)
		}

		const membership = await MembershipRepository.create({
			id: uuidv4(),
			community_id: invitationModel.community_id,
			user_id: userId,
			role: 'member',
			status: 'approved',
			invited_by: invitationModel.inviter_id,
			invited_at: new Date(),
		})

		await MembershipRepository.updateInvitationStatus(token, 'accepted')
		return new Membership(membership)
	}

	/**
	 * Revoke an invitation
	 */
	static async revokeInvitation(token) {
		const invitation = await MembershipRepository.findInvitationByToken(token)
		if (!invitation) {
			throw new Error('Invitation không tồn tại.')
		}

		const deleted = await MembershipRepository.deleteInvitationByToken(token)
		if (!deleted) {
			throw new Error('Thu hồi invitation thất bại.')
		}

		return deleted
	}

	/**
	 * Get invitations for a community
	 */
	static async getCommunityInvitations(communityId) {
		const invitations = await MembershipRepository.findInvitationsByCommunity(
			communityId
		)
		return invitations.map((inv) => new Invitation(inv))
	}

	/**
	 * Get invitation by token
	 */
	static async getInvitationByToken(token) {
		const invitation = await MembershipRepository.findInvitationByToken(token)
		if (!invitation) {
			throw new Error('Invitation không tồn tại.')
		}
		return new Invitation(invitation)
	}
}

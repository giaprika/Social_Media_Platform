import express from 'express'
import { MembershipController } from '../controllers/membership.controller.js'

const router = express.Router()

// Community Members (thành viên cộng đồng)
router.get('/communities/:id/members', MembershipController.getCommunityMembers)
router.post('/communities/:id/members', MembershipController.joinCommunity)
router.delete(
	'/communities/:id/members/me',
	MembershipController.leaveCommunity
)
router.delete(
	'/communities/:id/members/:targetUserId',
	MembershipController.rejectMembership
)

// Current user's membership in a community
router.get('/communities/:id/membership', MembershipController.getMembership)

// Memberships (quản lý membership)
router.get('/memberships/:membershipId', MembershipController.getMembershipById)
router.patch(
	'/memberships/:membershipId',
	MembershipController.updateMembership
)
router.delete(
	'/memberships/:membershipId',
	MembershipController.deleteMembership
)

// User's communities
router.get('/users/me/communities', MembershipController.getUserCommunities)

// Community Invitations (lời mời)
router.get(
	'/communities/:id/invitations',
	MembershipController.getCommunityInvitations
)
router.post(
	'/communities/:id/invitations',
	MembershipController.createInvitation
)

// Invitations
router.get('/invitations/:token', MembershipController.getInvitationByToken)
router.post('/invitations/:token/accept', MembershipController.acceptInvitation)
router.delete('/invitations/:token', MembershipController.revokeInvitation)

export default router

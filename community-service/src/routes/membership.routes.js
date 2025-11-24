import express from "express";
import { MembershipController } from "../controllers/membership.controller.js";

const router = express.Router();

// Memberships
router.post("/communities/:id/join", MembershipController.joinCommunity);
router.delete("/communities/:id/leave", MembershipController.leaveCommunity);
router.get("/communities/:id/members", MembershipController.getCommunityMembers);
router.get("/communities/:id/membership", MembershipController.getMembership);
router.patch("/memberships/:membershipId/approve", MembershipController.approveMembership);
router.delete("/communities/:id/members/:targetUserId/reject", MembershipController.rejectMembership);
router.patch("/memberships/:membershipId/ban", MembershipController.banMember);
router.patch("/memberships/:membershipId/unban", MembershipController.unbanMember);
router.patch("/memberships/:membershipId/role", MembershipController.updateMemberRole);
router.patch("/memberships/:membershipId", MembershipController.updateMembership);
router.get("/users/communities", MembershipController.getUserCommunities);

// Invitations
router.post("/communities/:id/invitations", MembershipController.createInvitation);
router.post("/invitations/accept", MembershipController.acceptInvitation);
router.delete("/invitations/revoke", MembershipController.revokeInvitation);
router.get("/communities/:id/invitations", MembershipController.getCommunityInvitations);
router.get("/invitations/:token", MembershipController.getInvitationByToken);

export default router;


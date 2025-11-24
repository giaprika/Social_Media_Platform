import { MembershipService } from "../services/membership.service.js";

export class MembershipController {
  /**
   * Join a community
   */
  static async joinCommunity(req, res) {
    try {
      const userId = req.headers["x-user-id"];
      const { id } = req.params;
      const { status } = req.body;
      const membership = await MembershipService.joinCommunity(id, userId, status);
      res.status(201).json(membership);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  /**
   * Leave a community
   */
  static async leaveCommunity(req, res) {
    try {
      const userId = req.headers["x-user-id"];
      const { id } = req.params;
      const deleted = await MembershipService.leaveCommunity(id, userId);
      res.status(200).json(deleted);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  /**
   * Approve membership request
   */
  static async approveMembership(req, res) {
    try {
      const { membershipId } = req.params;
      const membership = await MembershipService.approveMembership(membershipId);
      res.status(200).json(membership);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  /**
   * Reject membership request
   */
  static async rejectMembership(req, res) {
    try {
      const { id, targetUserId } = req.params;
      const deleted = await MembershipService.rejectMembership(id, targetUserId);
      res.status(200).json(deleted);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  /**
   * Ban a member
   */
  static async banMember(req, res) {
    try {
      const { membershipId } = req.params;
      const banned = await MembershipService.banMember(membershipId);
      res.status(200).json(banned);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  /**
   * Unban a member
   */
  static async unbanMember(req, res) {
    try {
      const { membershipId } = req.params;
      const unbanned = await MembershipService.unbanMember(membershipId);
      res.status(200).json(unbanned);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  /**
   * Update member role
   */
  static async updateMemberRole(req, res) {
    try {
      const { membershipId } = req.params;
      const { role } = req.body;
      const updated = await MembershipService.updateMemberRole(membershipId, role);
      res.status(200).json(updated);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  /**
   * Get members of a community
   */
  static async getCommunityMembers(req, res) {
    try {
      const { id } = req.params;
      const members = await MembershipService.getCommunityMembers(id);
      res.status(200).json(members);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  /**
   * Get communities of a user
   */
  static async getUserCommunities(req, res) {
    try {
      const userId = req.headers["x-user-id"] || req.query.userId;
      if (!userId) {
        return res.status(400).json({ error: "Thiếu userId" });
      }
      const communities = await MembershipService.getUserCommunities(userId);
      res.status(200).json(communities);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  /**
   * Get membership info
   */
  static async getMembership(req, res) {
    try {
      const { id } = req.params;
      const userId = req.headers["x-user-id"] || req.query.userId;
      if (!userId) {
        return res.status(400).json({ error: "Thiếu userId" });
      }
      const membership = await MembershipService.getMembership(id, userId);
      if (!membership) {
        return res.status(404).json({ error: "Membership không tồn tại." });
      }
      res.status(200).json(membership);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  /**
   * Update membership
   */
  static async updateMembership(req, res) {
    try {
      const { membershipId } = req.params;
      const updateData = req.body;
      const updated = await MembershipService.updateMembership(membershipId, updateData);
      res.status(200).json(updated);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  // ============= INVITATION METHODS =============

  /**
   * Create an invitation
   */
  static async createInvitation(req, res) {
    try {
      const userId = req.headers["x-user-id"];
      const { id } = req.params;
      const invitationData = req.body;
      const invitation = await MembershipService.createInvitation(id, userId, invitationData);
      res.status(201).json(invitation);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  /**
   * Accept an invitation
   */
  static async acceptInvitation(req, res) {
    try {
      const userId = req.headers["x-user-id"];
      const { token } = req.body;
      if (!token) {
        return res.status(400).json({ error: "Thiếu token" });
      }
      const membership = await MembershipService.acceptInvitation(token, userId);
      res.status(200).json(membership);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  /**
   * Revoke an invitation
   */
  static async revokeInvitation(req, res) {
    try {
      const { token } = req.body;
      if (!token) {
        return res.status(400).json({ error: "Thiếu token" });
      }
      const deleted = await MembershipService.revokeInvitation(token);
      res.status(200).json(deleted);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  /**
   * Get invitations for a community
   */
  static async getCommunityInvitations(req, res) {
    try {
      const { id } = req.params;
      const invitations = await MembershipService.getCommunityInvitations(id);
      res.status(200).json(invitations);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  /**
   * Get invitation by token
   */
  static async getInvitationByToken(req, res) {
    try {
      const { token } = req.params;
      const invitation = await MembershipService.getInvitationByToken(token);
      res.status(200).json(invitation);
    } catch (error) {
      res.status(404).json({ error: error.message });
    }
  }
}

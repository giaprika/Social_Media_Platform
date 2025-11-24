import * as db from "../config/database.js";

export class MembershipRepository {
  /**
   * Find membership by community and user
   */
  static async findByCommunityAndUser(communityId, userId) {
    const result = await db.query(
      `SELECT * FROM community_members 
       WHERE community_id = $1 AND user_id = $2`,
      [communityId, userId]
    );
    return result.rows[0] || null;
  }

  /**
   * Find all members of a community
   */
  static async findByCommunity(communityId) {
    const result = await db.query(
      `SELECT * FROM community_members 
       WHERE community_id = $1 
       ORDER BY joined_at DESC`,
      [communityId]
    );
    return result.rows;
  }

  /**
   * Find all communities a user belongs to
   */
  static async findByUser(userId) {
    const result = await db.query(
      `SELECT cm.*, c.name, c.slug, c.avatar_url, c.visibility
       FROM community_members cm
       JOIN communities c ON cm.community_id = c.id
       WHERE cm.user_id = $1 AND c.deleted_at IS NULL
       ORDER BY cm.joined_at DESC`,
      [userId]
    );
    return result.rows;
  }

  /**
   * Create membership
   */
  static async create(membershipData) {
    const {
      id,
      community_id,
      user_id,
      role = "member",
      status = "pending",
      flair,
      invited_by,
      invited_at,
    } = membershipData;

    const result = await db.query(
      `INSERT INTO community_members 
        (id, community_id, user_id, role, status, flair, invited_by, invited_at)
       VALUES 
        ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        id,
        community_id,
        user_id,
        role,
        status,
        flair || null,
        invited_by || null,
        invited_at || null,
      ]
    );
    return result.rows[0];
  }

  /**
   * Update membership
   */
  static async update(id, updateData) {
    const { role, status, flair } = updateData;

    const result = await db.query(
      `UPDATE community_members 
       SET role = COALESCE($1, role),
           status = COALESCE($2, status),
           flair = COALESCE($3, flair)
       WHERE id = $4
       RETURNING *`,
      [role || null, status || null, flair || null, id]
    );
    return result.rows[0] || null;
  }

  /**
   * Delete membership (leave or remove)
   */
  static async delete(communityId, userId) {
    const result = await db.query(
      `DELETE FROM community_members 
       WHERE community_id = $1 AND user_id = $2
       RETURNING *`,
      [communityId, userId]
    );
    return result.rows[0] || null;
  }


  // ============= INVITATION METHODS =============
  /**
   * Find invitation by token
   */
  static async findInvitationByToken(token) {
    const result = await db.query(
      `SELECT * FROM community_invitations WHERE token = $1`,
      [token]
    );
    return result.rows[0] || null;
  }

  /**
   * Find invitations by community
   */
  static async findInvitationsByCommunity(communityId) {
    const result = await db.query(
      `SELECT * FROM community_invitations 
       WHERE community_id = $1 
       ORDER BY created_at DESC`,
      [communityId]
    );
    return result.rows;
  }

  /**
   * Create invitation
   */
  static async createInvitation(invitationData) {
    const {
      id,
      community_id,
      inviter_id,
      invitee_id,
      invitee_email,
      token,
      expires_at,
    } = invitationData;

    const result = await db.query(
      `INSERT INTO community_invitations 
        (id, community_id, inviter_id, invitee_id, invitee_email, token, expires_at)
       VALUES 
        ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        id,
        community_id,
        inviter_id,
        invitee_id || null,
        invitee_email || null,
        token,
        expires_at,
      ]
    );
    return result.rows[0];
  }

  /**
   * Update invitation status
   */
  static async updateInvitationStatus(token, status) {
    const result = await db.query(
      `UPDATE community_invitations 
       SET status = $1
       WHERE token = $2
       RETURNING *`,
      [status, token]
    );
    return result.rows[0] || null;
  }

  /**
   * Delete invitation by token
   */
  static async deleteInvitationByToken(token) {
    const result = await db.query(
      `DELETE FROM community_invitations 
       WHERE token = $1
       RETURNING *`,
      [token]
    );
    return result.rows[0] || null;
  }
}


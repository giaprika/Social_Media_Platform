/**
 * Community Service Models
 * All models in a single file
 */

/**
 * Community Model
 * Represents a community/group in the system
 */
export class Community {
  constructor(data) {
    this.id = data.id;
    this.name = data.name;
    this.slug = data.slug;
    this.description = data.description;
    this.avatar_url = data.avatar_url;
    this.banner_url = data.banner_url;
    this.owner_id = data.owner_id;
    
    // Settings
    this.visibility = data.visibility || 'public'; // public, private
    this.join_type = data.join_type || 'open'; // open, approval, invite_only
    this.post_permissions = data.post_permissions || 'all'; // all, approved_only, moderators_only
    
    // Metadata
    this.tags = data.tags || [];
    this.category = data.category;
    this.rules = data.rules || [];
    this.settings = data.settings || {};
    
    // Stats
    this.member_count = data.member_count || 0;
    this.post_count = data.post_count || 0;
    this.active_member_count = data.active_member_count || 0;
    
    // Timestamps
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
    this.deleted_at = data.deleted_at;
  }

  /**
   * Check if community is public
   */
  isPublic() {
    return this.visibility === 'public';
  }

  /**
   * Check if community is private
   */
  isPrivate() {
    return this.visibility === 'private';
  }

  /**
   * Check if join requires approval
   */
  requiresApproval() {
    return this.join_type === 'approval';
  }

  /**
   * Check if join is invite only
   */
  isInviteOnly() {
    return this.join_type === 'invite_only';
  }

  /**
   * Check if anyone can post
   */
  allowsAllPosts() {
    return this.post_permissions === 'all';
  }

  /**
   * Check if posts need approval
   */
  requiresPostApproval() {
    return this.post_permissions === 'approved_only';
  }

  /**
   * Check if only moderators can post
   */
  moderatorsOnlyPosts() {
    return this.post_permissions === 'moderators_only';
  }

  /**
   * Convert to JSON
   */
  toJSON() {
    return {
      id: this.id,
      name: this.name,
      slug: this.slug,
      description: this.description,
      avatar_url: this.avatar_url,
      banner_url: this.banner_url,
      owner_id: this.owner_id,
      visibility: this.visibility,
      join_type: this.join_type,
      post_permissions: this.post_permissions,
      tags: this.tags,
      category: this.category,
      rules: this.rules,
      settings: this.settings,
      member_count: this.member_count,
      post_count: this.post_count,
      active_member_count: this.active_member_count,
      created_at: this.created_at,
      updated_at: this.updated_at,
    };
  }
}

/**
 * Membership Model
 * Represents a user's membership in a community
 */
export class Membership {
  constructor(data) {
    this.id = data.id;
    this.community_id = data.community_id;
    this.user_id = data.user_id;
    this.role = data.role || 'member'; // owner, admin, moderator, member
    this.status = data.status || 'pending'; // pending, approved, rejected, banned
    this.flair = data.flair;
    this.joined_at = data.joined_at;
    this.invited_by = data.invited_by;
    this.invited_at = data.invited_at;
  }

  /**
   * Check if user is owner
   */
  isOwner() {
    return this.role === 'owner';
  }

  /**
   * Check if user is admin
   */
  isAdmin() {
    return this.role === 'admin' || this.role === 'owner';
  }

  /**
   * Check if user is moderator
   */
  isModerator() {
    return this.role === 'moderator' || this.isAdmin();
  }

  /**
   * Check if user is regular member
   */
  isMember() {
    return this.role === 'member';
  }

  /**
   * Check if membership is approved
   */
  isApproved() {
    return this.status === 'approved';
  }

  /**
   * Check if membership is pending
   */
  isPending() {
    return this.status === 'pending';
  }

  /**
   * Check if user is banned
   */
  isBanned() {
    return this.status === 'banned';
  }

  /**
   * Check if user can moderate
   */
  canModerate() {
    return this.isModerator() && this.isApproved();
  }

  /**
   * Check if user can post
   */
  canPost() {
    return this.isApproved() && !this.isBanned();
  }

  /**
   * Check if user can invite others
   */
  canInvite() {
    return this.canModerate() || (this.isApproved() && !this.isBanned());
  }

  /**
   * Convert to JSON
   */
  toJSON() {
    return {
      id: this.id,
      community_id: this.community_id,
      user_id: this.user_id,
      role: this.role,
      status: this.status,
      flair: this.flair,
      joined_at: this.joined_at,
      invited_by: this.invited_by,
      invited_at: this.invited_at,
    };
  }
}

/**
 * Invitation Model
 * Represents an invitation to join a community
 */
export class Invitation {
  constructor(data) {
    this.id = data.id;
    this.community_id = data.community_id;
    this.inviter_id = data.inviter_id;
    this.invitee_id = data.invitee_id;
    this.invitee_email = data.invitee_email;
    this.token = data.token;
    this.status = data.status || 'pending'; // pending, accepted, expired, revoked
    this.expires_at = data.expires_at; 
    this.created_at = data.created_at;
  }

  /**
   * Check if invitation is pending
   */
  isPending() {
    return this.status === 'pending';
  }

  /**
   * Check if invitation is accepted
   */
  isAccepted() {
    return this.status === 'accepted';
  }

  /**
   * Check if invitation is expired
   */
  isExpired() {
    if (this.status === 'expired') return true;
    if (this.expires_at) {
      return new Date(this.expires_at) < new Date();
    }
    return false;
  }

  /**
   * Check if invitation is valid (pending and not expired)
   */
  isValid() {
    return this.isPending() && !this.isExpired();
  }

  /**
   * Check if invitation is by email
   */
  isEmailInvitation() {
    return this.invitee_email && !this.invitee_id;
  }

  /**
   * Check if invitation is by user ID
   */
  isUserInvitation() {
    return this.invitee_id && !this.invitee_email;
  }

  /**
   * Convert to JSON
   */
  toJSON() {
    return {
      id: this.id,
      community_id: this.community_id,
      inviter_id: this.inviter_id,
      invitee_id: this.invitee_id,
      invitee_email: this.invitee_email,
      token: this.token,
      status: this.status,
      expires_at: this.expires_at,
      created_at: this.created_at,
    };
  }
}

/**
 * PinnedPost Model
 * Represents a pinned post in a community
 * Only admins/moderators can pin posts
 */
export class PinnedPost {
  constructor(data) {
    this.id = data.id;
    this.community_id = data.community_id;
    this.post_id = data.post_id; // Reference to post-service
    this.pinned_by = data.pinned_by; // User ID who pinned it (must be admin/moderator)
    this.pinned_at = data.pinned_at;
    this.order_index = data.order_index || 0;
  }

  /**
   * Convert to JSON
   */
  toJSON() {
    return {
      id: this.id,
      community_id: this.community_id,
      post_id: this.post_id,
      pinned_by: this.pinned_by,
      pinned_at: this.pinned_at,
      order_index: this.order_index,
    };
  }
}


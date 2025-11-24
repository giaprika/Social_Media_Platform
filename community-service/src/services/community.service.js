import { v4 as uuidv4 } from "uuid";
import { CommunityRepository } from "../repositories/community.repository.js";
import { MembershipRepository } from "../repositories/membership.repository.js";
import { Community } from "../models/models.js";

export class CommunityService {
  /**
   * Create a new community
   */
  static async createCommunity(communityData) {
    const id = uuidv4();
    const created = await CommunityRepository.create({
      id,
      ...communityData,
    });

    // Auto-create owner membership
    await MembershipRepository.create({
      id: uuidv4(),
      community_id: id,
      user_id: communityData.owner_id,
      role: "owner",
      status: "approved",
    });

    return new Community(created);
  }

  /**
   * Get community by ID
   */
  static async getCommunityById(id) {
    const community = await CommunityRepository.findById(id);
    if (!community) {
      throw new Error("Community không tồn tại.");
    }
    return new Community(community);
  }

  /**
   * Get community by slug
   */
  static async getCommunityBySlug(slug) {
    const community = await CommunityRepository.findBySlug(slug);
    if (!community) {
      throw new Error("Community không tồn tại.");
    }
    return new Community(community);
  }

  /**
   * Update community
   */
  static async updateCommunity(communityId, updateData) {
    const updated = await CommunityRepository.update(communityId, updateData);
    if (!updated) {
      throw new Error("Community không tồn tại.");
    }
    return new Community(updated);
  }

  /**
   * Delete community
   */
  static async deleteCommunity(communityId) {
    const deleted = await CommunityRepository.delete(communityId);
    if (!deleted) {
      throw new Error("Community không tồn tại.");
    }
    return new Community(deleted);
  }

  /**
   * Get pinned posts for a community
   */
  static async getPinnedPosts(communityId) {
    return await CommunityRepository.findPinnedPosts(communityId);
  }

  /**
   * Pin a post
   */
  static async pinPost(communityId, postId, pinnedBy, orderIndex = 0) {
    const pinnedPost = await CommunityRepository.createPinnedPost({
      id: uuidv4(),
      community_id: communityId,
      post_id: postId,
      pinned_by: pinnedBy,
      order_index: orderIndex,
    });
    return pinnedPost;
  }

  /**
   * Unpin a post
   */
  static async unpinPost(communityId, postId) {
    const unpinned = await CommunityRepository.deletePinnedPost(
      communityId,
      postId
    );
    if (!unpinned) {
      throw new Error("Post chưa được pin.");
    }
    return unpinned;
  }
}


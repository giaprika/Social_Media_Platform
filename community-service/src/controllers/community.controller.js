import { CommunityService } from "../services/community.service.js";

export class CommunityController {
  /**
   * Create a new community
   */
  static async createCommunity(req, res) {
    try {
      const userId = req.headers["x-user-id"];
      const communityData = {
        ...req.body,
        owner_id: userId,
      };
      const community = await CommunityService.createCommunity(communityData);
      res.status(201).json(community);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  /**
   * Get all communities with pagination and filters
   * Query params: category, sort (popular|newest|alphabetical), page, limit
   */
  static async getCommunities(req, res) {
    try {
      const { category, sort, page, limit } = req.query;
      const options = {
        category,
        sort: sort || 'popular',
        page: parseInt(page, 10) || 1,
        limit: parseInt(limit, 10) || 20,
      };
      const result = await CommunityService.getCommunities(options);
      res.status(200).json(result);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  /**
   * Search communities
   * Query params: q (search query), category, page, limit
   */
  static async searchCommunities(req, res) {
    try {
      const { q, category, page, limit } = req.query;
      if (!q) {
        return res.status(400).json({ error: "Thiếu từ khóa tìm kiếm (q)" });
      }
      const options = {
        category,
        page: parseInt(page, 10) || 1,
        limit: parseInt(limit, 10) || 20,
      };
      const result = await CommunityService.searchCommunities(q, options);
      res.status(200).json(result);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  /**
   * Get all categories
   */
  static async getCategories(req, res) {
    try {
      const categories = await CommunityService.getCategories();
      res.status(200).json({ categories });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  /**
   * Get community by ID
   */
  static async getCommunityById(req, res) {
    try {
      const { id } = req.params;
      const community = await CommunityService.getCommunityById(id);
      res.status(200).json(community);
    } catch (error) {
      res.status(404).json({ error: error.message });
    }
  }

  /**
   * Get community by slug
   */
  static async getCommunityBySlug(req, res) {
    try {
      const { slug } = req.params;
      const community = await CommunityService.getCommunityBySlug(slug);
      res.status(200).json(community);
    } catch (error) {
      res.status(404).json({ error: error.message });
    }
  }

  /**
   * Update community
   */
  static async updateCommunity(req, res) {
    try {
      const { id } = req.params;
      const updateData = req.body;
      const community = await CommunityService.updateCommunity(id, updateData);
      res.status(200).json(community);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  /**
   * Delete community
   */
  static async deleteCommunity(req, res) {
    try {
      const { id } = req.params;
      const deleted = await CommunityService.deleteCommunity(id);
      res.status(200).json(deleted);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  /**
   * Get pinned posts for a community
   */
  static async getPinnedPosts(req, res) {
    try {
      const { id } = req.params;
      const pinnedPosts = await CommunityService.getPinnedPosts(id);
      res.status(200).json(pinnedPosts);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  /**
   * Pin a post
   */
  static async pinPost(req, res) {
    try {
      const userId = req.headers["x-user-id"];
      const { id } = req.params;
      const { post_id, order_index = 0 } = req.body;
      const pinnedPost = await CommunityService.pinPost(id, post_id, userId, order_index);
      res.status(201).json(pinnedPost);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  /**
   * Unpin a post
   */
  static async unpinPost(req, res) {
    try {
      const { id, postId } = req.params;
      const unpinned = await CommunityService.unpinPost(id, postId);
      res.status(200).json(unpinned);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }
}


import * as db from "../config/database.js";

export class CommunityRepository {
  /**
   * Find community by ID
   */
  static async findById(id) {
    const result = await db.query(
      `SELECT * FROM communities WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );
    return result.rows[0] || null;
  }

  /**
   * Find community by slug
   */
  static async findBySlug(slug) {
    const result = await db.query(
      `SELECT * FROM communities WHERE slug = $1 AND deleted_at IS NULL`,
      [slug]
    );
    return result.rows[0] || null;
  }

  /**
   * Search communities by name or slug
   */
  static async search(q) {
    if (!q) {
      const result = await db.query(
        `SELECT * FROM communities WHERE deleted_at IS NULL ORDER BY created_at DESC`
      );
      return result.rows;
    }

    const result = await db.query(
      `SELECT * FROM communities 
       WHERE deleted_at IS NULL 
       AND (name ILIKE $1 OR slug ILIKE $1 OR description ILIKE $1)
       ORDER BY created_at DESC`,
      [`%${q}%`]
    );
    return result.rows;
  }

  /**
   * Create a new community
   */
  static async create(communityData) {
    const {
      id,
      name,
      slug,
      description,
      avatar_url,
      banner_url,
      owner_id,
      visibility = "public",
      join_type = "open",
      post_permissions = "all",
      tags = [],
      category,
      rules = [],
      settings = {},
    } = communityData;

    const result = await db.query(
      `INSERT INTO communities 
        (id, name, slug, description, avatar_url, banner_url, owner_id, 
         visibility, join_type, post_permissions, tags, category, rules, settings)
       VALUES 
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING *`,
      [
        id,
        name,
        slug,
        description || null,
        avatar_url || null,
        banner_url || null,
        owner_id,
        visibility,
        join_type,
        post_permissions,
        tags,
        category || null,
        JSON.stringify(rules),
        JSON.stringify(settings),
      ]
    );
    return result.rows[0];
  }

  /**
   * Update community
   */
  static async update(id, updateData) {
    const {
      name,
      description,
      avatar_url,
      banner_url,
      visibility,
      join_type,
      post_permissions,
      tags,
      category,
      rules,
      settings,
    } = updateData;

    const result = await db.query(
      `UPDATE communities 
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           avatar_url = COALESCE($3, avatar_url),
           banner_url = COALESCE($4, banner_url),
           visibility = COALESCE($5, visibility),
           join_type = COALESCE($6, join_type),
           post_permissions = COALESCE($7, post_permissions),
           tags = COALESCE($8, tags),
           category = COALESCE($9, category),
           rules = COALESCE($10, rules),
           settings = COALESCE($11, settings)
       WHERE id = $12 AND deleted_at IS NULL
       RETURNING *`,
      [
        name || null,
        description || null,
        avatar_url || null,
        banner_url || null,
        visibility || null,
        join_type || null,
        post_permissions || null,
        tags || null,
        category || null,
        rules ? JSON.stringify(rules) : null,
        settings ? JSON.stringify(settings) : null,
        id,
      ]
    );
    return result.rows[0] || null;
  }

  /**
   * Soft delete community
   */
  static async delete(id) {
    const result = await db.query(
      `UPDATE communities 
       SET deleted_at = NOW() 
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING *`,
      [id]
    );
    return result.rows[0] || null;
  }


  // ============= PINNED POST METHODS =============
  /**
   * Find pinned posts by community
   */
  static async findPinnedPosts(communityId) {
    const result = await db.query(
      `SELECT * FROM community_pinned_posts 
       WHERE community_id = $1 
       ORDER BY order_index ASC, pinned_at DESC`,
      [communityId]
    );
    return result.rows;
  }

  /**
   * Create pinned post
   */
  static async createPinnedPost(pinnedPostData) {
    const { id, community_id, post_id, pinned_by, order_index = 0 } = pinnedPostData;

    const result = await db.query(
      `INSERT INTO community_pinned_posts 
        (id, community_id, post_id, pinned_by, order_index)
       VALUES 
        ($1, $2, $3, $4, $5)
       RETURNING *`,
      [id, community_id, post_id, pinned_by, order_index]
    );
    return result.rows[0];
  }

  /**
   * Delete pinned post
   */
  static async deletePinnedPost(communityId, postId) {
    const result = await db.query(
      `DELETE FROM community_pinned_posts 
       WHERE community_id = $1 AND post_id = $2
       RETURNING *`,
      [communityId, postId]
    );
    return result.rows[0] || null;
  }
}


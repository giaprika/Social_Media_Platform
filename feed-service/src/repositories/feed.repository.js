const { pool } = require("../config/database");

class FeedRepository {
  /**
   * Create feed items for multiple users (fanout)
   * Score is automatically calculated by database trigger
   */
  async createFeedItems(
    userIds,
    postId,
    authorId,
    likes = 0,
    comments = 0,
    postCreatedAt = null
  ) {
    const client = await pool.connect();
    try {
      // Filter out author from receiving their own post
      const recipientIds = userIds.filter((id) => id !== authorId);

      if (recipientIds.length === 0) {
        return [];
      }

      const values = recipientIds
        .map(
          (userId, index) =>
            `($${index * 5 + 1}, $${index * 5 + 2}, $${index * 5 + 3}, $${
              index * 5 + 4
            }, $${index * 5 + 5})`
        )
        .join(",");

      const createdAt = postCreatedAt || new Date();

      const params = recipientIds.flatMap((userId) => [
        userId,
        postId,
        likes,
        comments,
        createdAt,
      ]);

      const query = `
        INSERT INTO feed_items (user_id, post_id, likes, comments, post_created_at)
        VALUES ${values}
        ON CONFLICT (user_id, post_id) DO NOTHING
        RETURNING *
      `;

      const result = await client.query(query, params);
      return result.rows;
    } finally {
      client.release();
    }
  }

  /**
   * Create feed item with engagement data for a single user
   * Score is automatically calculated by database trigger
   */
  async createFeedItemWithScore(
    userId,
    postId,
    authorId,
    likes = 0,
    comments = 0,
    postCreatedAt = null
  ) {
    // Don't create feed item if user is the author
    if (userId === authorId) {
      return null;
    }

    const createdAt = postCreatedAt || new Date();

    const query = `
      INSERT INTO feed_items (user_id, post_id, likes, comments, post_created_at)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (user_id, post_id) DO UPDATE SET
        likes = EXCLUDED.likes,
        comments = EXCLUDED.comments,
        post_created_at = EXCLUDED.post_created_at
      RETURNING *
    `;

    const result = await pool.query(query, [
      userId,
      postId,
      likes,
      comments,
      createdAt,
    ]);
    return result.rows[0];
  }

  /**
   * Update engagement data for a specific post across all feeds
   * Score is automatically recalculated by database trigger
   */
  async updateScoreByPostId(postId, likes, comments) {
    const query = `
      UPDATE feed_items 
      SET likes = $1, comments = $2
      WHERE post_id = $3
      RETURNING *
    `;

    const result = await pool.query(query, [likes, comments, postId]);
    return result.rows;
  }

  /**
   * Get feed for a user with pagination
   */
  async getUserFeed(userId, limit = 10, offset = 0) {
    const query = `
      SELECT * FROM feed_items 
      WHERE user_id = $1 
      ORDER BY score DESC, created_at DESC 
      LIMIT $2 OFFSET $3
    `;

    const result = await pool.query(query, [userId, limit, offset]);
    return result.rows;
  }

  /**
   * Mark feed items as viewed
   * Score is automatically recalculated by database trigger with view penalty
   */
  async markAsViewed(feedItemIds) {
    if (feedItemIds.length === 0) return [];

    const placeholders = feedItemIds
      .map((_, index) => `$${index + 1}`)
      .join(",");

    const query = `
      UPDATE feed_items 
      SET viewed_at = CURRENT_TIMESTAMP
      WHERE id IN (${placeholders}) AND viewed_at IS NULL
      RETURNING *
    `;

    const result = await pool.query(query, feedItemIds);
    return result.rows;
  }

  /**
   * Delete old viewed feed items
   */
  async deleteOldViewedItems(daysThreshold = 10) {
    const query = `
      DELETE FROM feed_items 
      WHERE viewed_at IS NOT NULL 
        AND created_at < NOW() - INTERVAL '${daysThreshold} days'
      RETURNING id
    `;

    const result = await pool.query(query);
    return result.rows.length;
  }

  /**
   * Calculate score based on engagement metrics
   * Formula: score = (likes * 2 + comments * 5) * time_decay_factor
   * Time decay: newer posts get higher scores
   */
  calculateScore(likes, comments, createdAt, viewedAt = null) {
    const baseScore = likes * 2 + comments * 5;

    // Time decay factor (posts lose 10% score per day)
    const now = viewedAt || new Date();
    const ageInDays = (now - new Date(createdAt)) / (1000 * 60 * 60 * 24);
    const timeDecayFactor = Math.exp(-0.1 * ageInDays); // Exponential decay

    // If user has viewed it, reduce score significantly
    const viewPenalty = viewedAt ? 0.1 : 1;

    const finalScore = baseScore * timeDecayFactor * viewPenalty;

    return parseFloat(finalScore.toFixed(4));
  }

  /**
   * Get feed item by user and post
   */
  async getFeedItem(userId, postId) {
    const query = `
      SELECT * FROM feed_items 
      WHERE user_id = $1 AND post_id = $2
    `;

    const result = await pool.query(query, [userId, postId]);
    return result.rows[0];
  }

  /**
   * Delete feed items by post_id (when post is deleted)
   */
  async deleteFeedItemsByPostId(postId) {
    const query = `
      DELETE FROM feed_items 
      WHERE post_id = $1
      RETURNING id
    `;

    const result = await pool.query(query, [postId]);
    return result.rows.length;
  }
}

module.exports = new FeedRepository();

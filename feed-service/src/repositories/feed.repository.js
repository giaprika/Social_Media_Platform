const { pool } = require("../config/database");

class FeedRepository {
  /**
   * Create feed items for multiple users (fanout)
   */
  async createFeedItems(userIds, postId, authorId) {
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
            `($${index * 2 + 1}, $${index * 2 + 2}, 0, CURRENT_TIMESTAMP, NULL)`
        )
        .join(",");

      const params = recipientIds.flatMap((userId) => [userId, postId]);

      const query = `
        INSERT INTO feed_items (user_id, post_id, score, created_at, viewed_at)
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
   * Update score for a specific post across all feeds
   * Recalculates score based on engagement and age of each feed item
   */
  async updateScoreByPostId(postId, likes, comments) {
    // Use SQL to calculate score dynamically for each feed_item
    // Formula: (likes * 2 + comments * 5) * e^(-0.1 * age_in_days) * view_penalty
    const query = `
      UPDATE feed_items 
      SET score = (
        ($1 * 2 + $2 * 5) * 
        EXP(-0.1 * EXTRACT(EPOCH FROM (NOW() - created_at)) / 86400) *
        CASE WHEN viewed_at IS NULL THEN 1 ELSE 0.1 END
      )
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

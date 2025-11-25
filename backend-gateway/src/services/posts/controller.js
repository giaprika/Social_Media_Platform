import logger from "../../utils/logger.js";
import postService from "./postService.js";

class PostServiceController {
  /**
   * POST /api/posts - Tạo post mới (với AI moderation)
   */
  static async createPost(req, res) {
    try {
      const userId = req.headers["x-user-id"];
      const postData = req.body;
      const files = req.files; // từ multer middleware

      if (!userId) {
        return res.status(401).json({ error: "User ID required" });
      }

      logger.info(`[Controller] Creating post`, {
        userId,
        hasFiles: files && files.length > 0,
        correlationId: req.correlationId,
      });

      const result = await postService.createPost(postData, files, userId);

      res.status(201).json(result);
    } catch (error) {
      // Lỗi từ AI moderation
      if (error.status && error.moderationResult) {
        logger.warn(`[Controller] Post rejected by moderation`, {
          userId: req.headers["x-user-id"],
          reason: error.reason,
          correlationId: req.correlationId,
        });
        return res.status(error.status).json({
          status: "error",
          message: error.message,
          reason: error.reason,
          moderation: error.moderationResult,
        });
      }

      // Lỗi khác
      logger.error("[Controller] Error creating post", {
        error: error.message,
        response: error.response?.data,
        correlationId: req.correlationId,
      });
      
      res.status(error.response?.status || 500).json(
        error.response?.data || { error: error.message }
      );
    }
  }

  /**
   * PATCH /api/posts/:id - Cập nhật post (với AI moderation)
   */
  static async updatePost(req, res) {
    try {
      const userId = req.headers["x-user-id"];
      const postId = req.params.id;
      const postData = req.body;
      const files = req.files;

      if (!userId) {
        return res.status(401).json({ error: "User ID required" });
      }

      logger.info(`[Controller] Updating post`, {
        postId,
        userId,
        hasFiles: files && files.length > 0,
        correlationId: req.correlationId,
      });

      const result = await postService.updatePost(postId, postData, files, userId);

      res.status(200).json(result);
    } catch (error) {
      // Lỗi từ AI moderation
      if (error.status && error.moderationResult) {
        logger.warn(`[Controller] Post update rejected by moderation`, {
          postId: req.params.id,
          userId: req.headers["x-user-id"],
          reason: error.reason,
          correlationId: req.correlationId,
        });
        return res.status(error.status).json({
          status: "error",
          message: error.message,
          reason: error.reason,
          moderation: error.moderationResult,
        });
      }

      // Lỗi khác
      logger.error("[Controller] Error updating post", {
        postId: req.params.id,
        error: error.message,
        response: error.response?.data,
        correlationId: req.correlationId,
      });
      
      res.status(error.response?.status || 500).json(
        error.response?.data || { error: error.message }
      );
    }
  }

  /**
   * GET /api/posts - Lấy danh sách posts
   */
  static async getPosts(req, res) {
    try {
      const userId = req.headers["x-user-id"];
      const queryString = new URLSearchParams(req.query).toString();
      const path = `/posts?${queryString}`;

      logger.info(`[Controller] Getting posts`, {
        path,
        correlationId: req.correlationId,
      });

      const result = await postService.proxyRequest("GET", path, null, userId);

      res.status(200).json(result);
    } catch (error) {
      logger.error("[Controller] Error getting posts", {
        error: error.message,
        response: error.response?.data,
        correlationId: req.correlationId,
      });
      
      res.status(error.response?.status || 500).json(
        error.response?.data || { error: error.message }
      );
    }
  }

  /**
   * GET /api/posts/:id - Lấy chi tiết post
   */
  static async getPostById(req, res) {
    try {
      const userId = req.headers["x-user-id"];
      const postId = req.params.id;

      logger.info(`[Controller] Getting post by ID`, {
        postId,
        correlationId: req.correlationId,
      });

      const result = await postService.proxyRequest(
        "GET",
        `/posts/${postId}`,
        null,
        userId
      );

      res.status(200).json(result);
    } catch (error) {
      logger.error("[Controller] Error getting post", {
        postId: req.params.id,
        error: error.message,
        response: error.response?.data,
        correlationId: req.correlationId,
      });
      
      res.status(error.response?.status || 500).json(
        error.response?.data || { error: error.message }
      );
    }
  }

  /**
   * DELETE /api/posts/:id - Xóa post
   */
  static async deletePost(req, res) {
    try {
      const userId = req.headers["x-user-id"];
      const postId = req.params.id;

      logger.info(`[Controller] Deleting post`, {
        postId,
        userId,
        correlationId: req.correlationId,
      });

      await postService.proxyRequest(
        "DELETE",
        `/posts/${postId}`,
        null,
        userId
      );

      res.status(204).send();
    } catch (error) {
      logger.error("[Controller] Error deleting post", {
        postId: req.params.id,
        error: error.message,
        response: error.response?.data,
        correlationId: req.correlationId,
      });
      
      res.status(error.response?.status || 500).json(
        error.response?.data || { error: error.message }
      );
    }
  }
}

export default PostServiceController;

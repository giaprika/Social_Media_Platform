import logger from "../../utils/logger.js";
import config from "./config.js";
import { createAxiosInstance } from "../../utils/axiosFactory.js";
import FormData from "form-data";
import moderateContent from "../ai/aiService.js";
import mainConfig from "../../config/index.js";

class PostService {
  constructor() {
    // Axios instance cho post-service - gọi trực tiếp đến post-service, không qua Gateway
    const postServiceUrl = mainConfig.services.posts?.target || process.env.POST_SERVICE_URL || "http://localhost:8000";
    this.postServiceAxios = createAxiosInstance({
      serviceName: "posts",
      baseURL: `${postServiceUrl}/api/v1`,  // Direct to post-service
      timeout: 10000,
    });
  }

  async moderateContentWithAI(content, files, userId) {
    // Nếu không có content và files thì skip
    if ((!content || content.trim() === "") && (!files || files.length === 0)) {
      return { result: "no_content", is_safe: true, message: "No content to moderate" };
    }
    try {
      logger.info(`[AI Moderation] Sending content to AI service for moderation`, {
        userId,
        hasContent: !!content,
        fileCount: files ? files.length : 0,
      });
      const moderationResult = await moderateContent({
        text: content,
        files: files,
        timeout: config.aiTimeout,
      });
      logger.info(`[AI Moderation] Received moderation result from AI service`, {
        userId,
        result: moderationResult,
      });
      return moderationResult;
    } catch (error) {
      logger.error("[AI Moderation] Error during content moderation", {
        error: error.message,
      });
      // Trong trường hợp lỗi với AI service, ta có thể chọn cách xử lý:
      // 1. Từ chối nội dung (an toàn hơn)
      // 2. Chấp nhận nội dung (có rủi ro)
      // Ở đây ta chọn từ chối nội dung để đảm bảo an toàn cộng đồng
      return {
        result: "error",
        message: "Error during AI moderation",
      };
    }
  }

  /**
   * Tạo post mới (sau khi qua AI moderation)
   */
  async createPost(postData, files, userId) {
    try {
      // BƯỚC 1: Kiểm duyệt nội dung (text + images) bằng AI Agent
      logger.info(`[Post Creation] Step 1: Moderating content with AI Agent`);
      const moderation = await this.moderateContentWithAI(
        postData.content, 
        files,
        userId
      );
      
      if (!moderation.is_safe) {
        logger.warn(`[Post Creation] Content rejected by AI`, {
          userId,
          result: moderation.result,
          reason: moderation.message,
        });
        throw {
          status: 400,
          message: "Content violates community guidelines",
          reason: moderation.message,
          moderationResult: moderation,
        };
      }

      logger.info(`[Post Creation] Content passed AI moderation`, {
        result: moderation.result,
      });

      // BƯỚC 2: Tạo post (sau khi pass moderation)
      logger.info(`[Post Creation] Step 2: Creating post in post-service`);
      
      const formData = new FormData();
      
      // Append text fields
      if (postData.content) formData.append("content", postData.content);
      if (postData.tags && Array.isArray(postData.tags)) {
        postData.tags.forEach(tag => formData.append("tags", tag));
      }
      if (postData.post_share_id) formData.append("post_share_id", postData.post_share_id);
      if (postData.group_id) formData.append("group_id", postData.group_id);
      if (postData.visibility) formData.append("visibility", postData.visibility);

      // Append files
      if (files && files.length > 0) {
        files.forEach((file) => {
          formData.append("files", file.buffer, {
            filename: file.originalname,
            contentType: file.mimetype,
          });
        });
      }

      const response = await this.postServiceAxios.post("/posts", formData, {
        headers: {
          ...formData.getHeaders(),
          "X-User-ID": userId,
        },
      });

      logger.info(`[Post Creation] Post created successfully`, {
        postId: response.data.data?.post_id,
        userId,
      });

      return response.data;
    } catch (error) {
      // Nếu là lỗi từ moderation
      if (error.status && error.moderationResult) {
        throw error;
      }

      // Lỗi khác
      logger.error("[Post Creation] Failed to create post", {
        error: error.message,
        response: error.response?.data,
      });
      throw error;
    }
  }

  /**
   * Cập nhật post (sau khi qua AI moderation)
   */
  async updatePost(postId, postData, files, userId) {
    try {
      // BƯỚC 1: Kiểm duyệt nội dung mới (nếu có content hoặc files)
      const hasNewContent = postData.content || (files && files.length > 0);
      
      if (hasNewContent) {
        logger.info(`[Post Update] Step 1: Moderating new content with AI Agent`);
        const moderation = await this.moderateContentWithAI(
          postData.content, 
          files, 
          userId
        );
        
        if (!moderation.is_safe) {
          logger.warn(`[Post Update] Content rejected by AI`, {
            userId,
            postId,
            result: moderation.result,
            reason: moderation.message,
          });
          throw {
            status: 400,
            message: "Content violates community guidelines",
            reason: moderation.message,
            moderationResult: moderation,
          };
        }

        logger.info(`[Post Update] Content passed AI moderation`, {
          result: moderation.result,
        });
      }

      // BƯỚC 2: Cập nhật post
      logger.info(`[Post Update] Step 2: Updating post in post-service`);
      
      const formData = new FormData();
      
      // Append text fields
      if (postData.content !== undefined) formData.append("content", postData.content);
      if (postData.tags && Array.isArray(postData.tags)) {
        postData.tags.forEach(tag => formData.append("tags", tag));
      }
      if (postData.visibility) formData.append("visibility", postData.visibility);

      // Append files
      if (files && files.length > 0) {
        files.forEach((file) => {
          formData.append("files", file.buffer, {
            filename: file.originalname,
            contentType: file.mimetype,
          });
        });
      }

      const response = await this.postServiceAxios.patch(`/posts/${postId}`, formData, {
        headers: {
          ...formData.getHeaders(),
          "X-User-ID": userId,
        },
      });

      logger.info(`[Post Update] Post updated successfully`, {
        postId,
        userId,
      });

      return response.data;
    } catch (error) {
      // Nếu là lỗi từ moderation
      if (error.status && error.moderationResult) {
        throw error;
      }

      // Lỗi khác
      logger.error("[Post Update] Failed to update post", {
        error: error.message,
        response: error.response?.data,
      });
      throw error;
    }
  }

  /**
   * Tạo comment (sau khi qua AI moderation)
   */
  async createComment(postId, commentData, userId) {
    try {
      // BƯỚC 1: Kiểm duyệt nội dung comment bằng AI Agent
      logger.info(`[Comment Creation] Step 1: Moderating comment content with AI Agent`, {
        postId,
        userId,
      });
      
      const moderation = await this.moderateContentWithAI(
        commentData.content,
        null, // comments không có files
        userId
      );
      
      if (!moderation.is_safe) {
        logger.warn(`[Comment Creation] Comment rejected by AI`, {
          userId,
          postId,
          result: moderation.result,
          reason: moderation.message,
        });
        throw {
          status: 400,
          message: "Comment violates community guidelines",
          reason: moderation.message,
          moderationResult: moderation,
        };
      }

      logger.info(`[Comment Creation] Comment passed AI moderation`, {
        result: moderation.result,
      });

      // BƯỚC 2: Tạo comment
      logger.info(`[Comment Creation] Step 2: Creating comment in post-service`);
      
      const response = await this.postServiceAxios.post(
        `/posts/${postId}/comments`,
        commentData,
        {
          headers: {
            "Content-Type": "application/json",
            "X-User-ID": userId,
          },
        }
      );

      logger.info(`[Comment Creation] Comment created successfully`, {
        commentId: response.data.data?.comment_id,
        postId,
        userId,
      });

      return response.data;
    } catch (error) {
      // Nếu là lỗi từ moderation
      if (error.status && error.moderationResult) {
        throw error;
      }

      // Lỗi khác
      logger.error("[Comment Creation] Failed to create comment", {
        error: error.message,
        response: error.response?.data,
      });
      throw error;
    }
  }

  /**
   * Cập nhật comment (sau khi qua AI moderation)
   */
  async updateComment(commentId, commentData, userId) {
    try {
      // BƯỚC 1: Kiểm duyệt nội dung mới
      if (commentData.content) {
        logger.info(`[Comment Update] Step 1: Moderating comment content with AI Agent`, {
          commentId,
          userId,
        });
        
        const moderation = await this.moderateContentWithAI(
          commentData.content,
          null,
          userId
        );
        
        if (!moderation.is_safe) {
          logger.warn(`[Comment Update] Comment rejected by AI`, {
            userId,
            commentId,
            result: moderation.result,
            reason: moderation.message,
          });
          throw {
            status: 400,
            message: "Comment violates community guidelines",
            reason: moderation.message,
            moderationResult: moderation,
          };
        }

        logger.info(`[Comment Update] Comment passed AI moderation`, {
          result: moderation.result,
        });
      }

      // BƯỚC 2: Cập nhật comment
      logger.info(`[Comment Update] Step 2: Updating comment in post-service`);
      
      const response = await this.postServiceAxios.patch(
        `/comments/${commentId}`,
        commentData,
        {
          headers: {
            "Content-Type": "application/json",
            "X-User-ID": userId,
          },
        }
      );

      logger.info(`[Comment Update] Comment updated successfully`, {
        commentId,
        userId,
      });

      return response.data;
    } catch (error) {
      // Nếu là lỗi từ moderation
      if (error.status && error.moderationResult) {
        throw error;
      }

      // Lỗi khác
      logger.error("[Comment Update] Failed to update comment", {
        error: error.message,
        response: error.response?.data,
      });
      throw error;
    }
  }

  /**
   * Proxy các request khác (GET, DELETE) trực tiếp đến post-service
   */
  async proxyRequest(method, path, data, userId) {
    try {
      const response = await this.postServiceAxios({
        method,
        url: path,
        data,
        headers: {
          "X-User-ID": userId,
        },
      });
      return response.data;
    } catch (error) {
      logger.error(`[Post Service] Proxy request failed`, {
        method,
        path,
        error: error.message,
        response: error.response?.data,
      });
      throw error;
    }
  }
}

export default new PostService();

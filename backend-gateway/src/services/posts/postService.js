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
    if (!content && (!files || files.length === 0)) {
      return { result: "Accepted", message: "No content to moderate" };
    }

    // Tạo message theo format của AI service
    const parts = [];
    
    // Thêm text content
    if (content) {
      parts.push({ text: content });
    }

    // Thêm images (nếu có)
    if (files && files.length > 0) {
      for (const file of files) {
        if (file.mimetype.startsWith('image/') || file.mimetype === 'video/mp4')
          {
          parts.push({
            inlineData: {
              displayName: file.originalname,
              data: file.buffer.toString('base64'),
              mimeType: file.mimetype
            }
          });
        }
      }
    }

    const newMessage = {
      role: "user",
      parts: parts
    };

    const res = await moderateContent({
      userId: userId,
      newMessage: newMessage
    });

    if (!res.ok) {
      logger.error("[PostService] AI moderation failed", {
        error: res.error,
        status: res.status,
      });
      throw {
        status: res.status || 500,
        message: "AI moderation service error",
        reason: res.error,
      };
    }

    // Parse response từ AI (giống test.js)
    const aiResponse = res.data;
    let moderationResult = { result: "Rejected", message: "Failed to parse AI response" };

    try {
      if (aiResponse.parts && aiResponse.parts.length > 0) {
        let textContent = aiResponse.parts[0].text;
        
        // Remove markdown code block wrapper
        textContent = textContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        
        // Parse JSON
        const parsed = JSON.parse(textContent);
        
        moderationResult = {
          result: parsed.result.trim(),    // "Accepted", "Warning", or "Rejected" - TRIM whitespace
          message: parsed.message
        };
        
        logger.info("[PostService] AI Moderation parsed successfully", {
          result: moderationResult.result,
          resultLength: moderationResult.result.length,
          message: moderationResult.message
        });
      }
    } catch (parseError) {
      logger.error("[PostService] Failed to parse AI response", {
        error: parseError.message,
        response: aiResponse
      });
    }

    return moderationResult;
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
      
      logger.info(`[Post Creation] AI Moderation Result`, {
        userId,
        result: moderation.result,
        message: moderation.message,
      });

      // DEBUG: Log chi tiết
      logger.info(`[Post Creation] Checking moderation result`, {
        'moderation.result': moderation.result,
        'typeof result': typeof moderation.result,
        'result === "Accepted"': moderation.result === "Accepted",
        'result !== "Accepted"': moderation.result !== "Accepted",
      });

      // CHỈ CHO PHÉP tạo post nếu result === "Accepted"
      if (moderation.result !== "Accepted") {
        logger.warn(`[Post Creation] Content BLOCKED by AI`, {
          userId,
          result: moderation.result,
          reason: moderation.message,
        });
        
        // Xác định status code và message dựa trên result
        const statusCode = moderation.result === "Warning" ? 403 : 400;
        const errorMessage = moderation.result === "Warning" 
          ? "Content contains potentially inappropriate material" 
          : "Content violates community guidelines";
        
        throw {
          status: statusCode,
          message: errorMessage,
          reason: moderation.message,
          moderationResult: moderation,
        };
      }

      logger.info(`[Post Creation] Content ACCEPTED by AI - Proceeding to create post`);

      // BƯỚC 2: Tạo post (CHỈ KHI result === "Accepted")
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
        
        logger.info(`[Post Update] AI Moderation Result`, {
          userId,
          postId,
          result: moderation.result,
          message: moderation.message,
        });

        // CHỈ CHO PHÉP update nếu result === "Accepted"
        if (moderation.result !== "Accepted") {
          logger.warn(`[Post Update] Content BLOCKED by AI`, {
            userId,
            postId,
            result: moderation.result,
            reason: moderation.message,
          });
          
          const statusCode = moderation.result === "Warning" ? 403 : 400;
          const errorMessage = moderation.result === "Warning" 
            ? "Content contains potentially inappropriate material" 
            : "Content violates community guidelines";
          
          throw {
            status: statusCode,
            message: errorMessage,
            reason: moderation.message,
            moderationResult: moderation,
          };
        }

        logger.info(`[Post Update] Content ACCEPTED by AI - Proceeding to update post`);
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
      
      logger.info(`[Comment Creation] AI Moderation Result`, {
        userId,
        postId,
        result: moderation.result,
        message: moderation.message,
      });

      // CHỈ CHO PHÉP tạo comment nếu result === "Accepted"
      if (moderation.result !== "Accepted") {
        logger.warn(`[Comment Creation] Comment BLOCKED by AI`, {
          userId,
          postId,
          result: moderation.result,
          reason: moderation.message,
        });
        
        const statusCode = moderation.result === "Warning" ? 403 : 400;
        const errorMessage = moderation.result === "Warning" 
          ? "Comment contains potentially inappropriate material" 
          : "Comment violates community guidelines";
        
        throw {
          status: statusCode,
          message: errorMessage,
          reason: moderation.message,
          moderationResult: moderation,
        };
      }

      logger.info(`[Comment Creation] Comment ACCEPTED by AI - Proceeding to create comment`);

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
        
        logger.info(`[Comment Update] AI Moderation Result`, {
          userId,
          commentId,
          result: moderation.result,
          message: moderation.message,
        });

        // CHỈ CHO PHÉP update nếu result === "Accepted"
        if (moderation.result !== "Accepted") {
          logger.warn(`[Comment Update] Comment BLOCKED by AI`, {
            userId,
            commentId,
            result: moderation.result,
            reason: moderation.message,
          });
          
          const statusCode = moderation.result === "Warning" ? 403 : 400;
          const errorMessage = moderation.result === "Warning" 
            ? "Comment contains potentially inappropriate material" 
            : "Comment violates community guidelines";
          
          throw {
            status: statusCode,
            message: errorMessage,
            reason: moderation.message,
            moderationResult: moderation,
          };
        }

        logger.info(`[Comment Update] Comment ACCEPTED by AI - Proceeding to update comment`);
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

import logger from "../../utils/logger.js";
import config from "./config.js";
import { createAxiosInstance } from "../../utils/axiosFactory.js";
import FormData from "form-data";
import axios from "axios";

class PostService {
  constructor() {
    // Axios instance cho post-service
    this.postServiceAxios = createAxiosInstance({
      serviceName: "posts",
      timeout: 10000,
    });

    // Axios instance cho AI service
    this.aiServiceAxios = axios.create({
      baseURL: config.aiServiceUrl,
      timeout: config.aiTimeout,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }

  /**
   * Kiểm duyệt nội dung text bằng AI
   */
  async moderateContent(content, userId) {
    if (!content) {
      return { is_safe: true };
    }

    try {
      logger.info(`[AI Moderation] Checking text content for user ${userId}`);
      
      const response = await this.aiServiceAxios.post("/moderate/text", {
        content,
        user_id: userId,
      });

      logger.info(`[AI Moderation] Text result:`, response.data);
      return response.data;
    } catch (error) {
      logger.error("[AI Moderation] Text check failed", {
        error: error.message,
        response: error.response?.data,
      });
      
      // Fallback: nếu AI service down, có thể chọn:
      // 1. Cho pass (return {is_safe: true})
      // 2. Reject (throw error)
      // Ở đây tôi chọn reject để đảm bảo an toàn
      throw new Error("AI moderation service unavailable");
    }
  }

  /**
   * Kiểm duyệt ảnh bằng AI
   */
  async moderateImages(files, userId) {
    if (!files || files.length === 0) {
      return { is_safe: true };
    }

    try {
      logger.info(`[AI Moderation] Checking ${files.length} images for user ${userId}`);

      const formData = new FormData();
      formData.append("user_id", userId);

      // Append all files
      files.forEach((file) => {
        formData.append("files", file.buffer, {
          filename: file.originalname,
          contentType: file.mimetype,
        });
      });

      const response = await this.aiServiceAxios.post(
        "/moderate/images",
        formData,
        {
          headers: {
            ...formData.getHeaders(),
          },
        }
      );

      logger.info(`[AI Moderation] Image result:`, response.data);
      return response.data;
    } catch (error) {
      logger.error("[AI Moderation] Image check failed", {
        error: error.message,
        response: error.response?.data,
      });
      throw new Error("AI image moderation service unavailable");
    }
  }

  /**
   * Tạo post mới (sau khi qua AI moderation)
   */
  async createPost(postData, files, userId) {
    try {
      // BƯỚC 1: Kiểm duyệt nội dung text
      logger.info(`[Post Creation] Step 1: Moderating text content`);
      const textModeration = await this.moderateContent(postData.content, userId);
      
      if (!textModeration.is_safe) {
        logger.warn(`[Post Creation] Text content rejected`, {
          userId,
          reason: textModeration.reason,
        });
        throw {
          status: 400,
          message: "Content violates community guidelines",
          reason: textModeration.reason,
          moderationResult: textModeration,
        };
      }

      // BƯỚC 2: Kiểm duyệt ảnh (nếu có)
      if (files && files.length > 0) {
        logger.info(`[Post Creation] Step 2: Moderating images`);
        const imageModeration = await this.moderateImages(files, userId);
        
        if (!imageModeration.is_safe) {
          logger.warn(`[Post Creation] Images rejected`, {
            userId,
            results: imageModeration.results,
          });
          throw {
            status: 400,
            message: "Images contain inappropriate content",
            reason: imageModeration.message,
            moderationResult: imageModeration,
          };
        }
      }

      // BƯỚC 3: Tạo post (sau khi pass moderation)
      logger.info(`[Post Creation] Step 3: Creating post in post-service`);
      
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
      // BƯỚC 1: Kiểm duyệt nội dung text mới (nếu có)
      if (postData.content) {
        logger.info(`[Post Update] Step 1: Moderating text content`);
        const textModeration = await this.moderateContent(postData.content, userId);
        
        if (!textModeration.is_safe) {
          logger.warn(`[Post Update] Text content rejected`, {
            userId,
            postId,
            reason: textModeration.reason,
          });
          throw {
            status: 400,
            message: "Content violates community guidelines",
            reason: textModeration.reason,
            moderationResult: textModeration,
          };
        }
      }

      // BƯỚC 2: Kiểm duyệt ảnh mới (nếu có)
      if (files && files.length > 0) {
        logger.info(`[Post Update] Step 2: Moderating images`);
        const imageModeration = await this.moderateImages(files, userId);
        
        if (!imageModeration.is_safe) {
          logger.warn(`[Post Update] Images rejected`, {
            userId,
            postId,
            results: imageModeration.results,
          });
          throw {
            status: 400,
            message: "Images contain inappropriate content",
            reason: imageModeration.message,
            moderationResult: imageModeration,
          };
        }
      }

      // BƯỚC 3: Cập nhật post
      logger.info(`[Post Update] Step 3: Updating post in post-service`);
      
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

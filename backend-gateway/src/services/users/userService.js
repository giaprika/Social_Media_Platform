import logger from "../../utils/logger.js";
import config from "./config.js";
import dotenv from "dotenv";
import { generateJwtToken } from "../../middleware/auth.js";
import { userServiceInstance } from "../../utils/axiosFactory.js";
import jwt from "jsonwebtoken";
dotenv.config();

class UserService {
  async registerUserService(userData) {
    try {
      logger.info("Sending user data to user service", {
        userData: { ...userData, password: "***" },
      });
      const response = await userServiceInstance.post(`/`, userData);
      logger.info("User service response", { data: response.data });
      return response.data;
    } catch (error) {
      logger.error("Error while registering user in user service", {
        error: error.message,
        response: error.response?.data,
        userData: { ...userData, password: "***" },
      });
      throw error;
    }
  }

  async handleRegister(userData) {
    let createdUser = null;

    try {
      createdUser = await this.registerUserService(userData);
      const userId = createdUser.id;
      return createdUser;
    } catch (error) {
      if (createdUser?.id) {
        await userServiceInstance.delete(`/${createdUser.id}`, {
          userData: userData,
        });
      }
      throw error;
    }
  }

  async loginUser(email, password) {
    try {
      const response = await userServiceInstance.post("/logining", {
        email,
        password,
      });
      return response.data;
    } catch (error) {
      logger.error("Error while logging in user", {
        error: error.message,
        response: error.response?.data,
        email,
      });
      throw error;
    }
  }

  async saveRefreshToken(userId, refreshToken, expiresAt) {
    try {
      await userServiceInstance.post("/refresh-token", {
        userId,
        refreshToken,
        expiresAt,
      });
    } catch (error) {
      logger.error("Error saving refresh token", {
        error: error.message,
        response: error.response?.data,
        userId,
      });
      throw error;
    }
  }

  async handleLogin(email, password) {
    try {
      // 1. Xác thực user
      const user = await this.loginUser(email, password);

      // 2. Tạo JWT token
      const accessToken = generateJwtToken(
        user,
        config.accessTokenSecret,
        "1d"
      );

      // 3. Tạo refreshToken và lưu vào user service
      const refreshToken = generateJwtToken(
        user,
        config.refreshTokenSecret,
        "30d"
      );
      const expiresAt = new Date(
        Date.now() + 30 * 24 * 60 * 60 * 1000
      ).toISOString(); // 30 ngày
      await this.saveRefreshToken(user.id, refreshToken, expiresAt);
      // 4. Trả JWT và refreshToken về client
      return {
        access_token: accessToken,
        refresh_token: refreshToken,
        user,
      };
    } catch (error) {
      throw error;
    }
  }

  async handleRefreshToken(token) {
    try {
      // 1. Xác thực refresh token
      const decoded = jwt.verify(token, config.refreshTokenSecret);

      // 2. Tạo đối tượng user từ payload của token
      const user = {
        id: decoded.id,
        email: decoded.email,
        full_name: decoded.full_name,
      };

      // 3. Tạo một accessToken mới
      const accessToken = generateJwtToken(
        user,
        config.accessTokenSecret,
        "1d"
      );

      return { accessToken };
    } catch (error) {
      // Nếu token không hợp lệ (hết hạn, sai chữ ký), jwt.verify sẽ ném lỗi
      logger.error("Invalid refresh token", {
        error: error.message,
        token,
      });
      throw new Error("Invalid refresh token");
    }
  }
}

export default new UserService();

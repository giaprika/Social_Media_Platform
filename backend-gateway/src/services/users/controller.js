import logger from "../../utils/logger.js";
import userService from "./userService.js";

class UserServiceController {
  static async login(req, res, next) {
    const { email, password } = req.body;
    try {
      const { access_token, refresh_token, user } =
        await userService.handleLogin(email, password);
      res.json({ access_token, refresh_token, user });
    } catch (error) {
      logger.error("Error in login controller", {
        error: error.message,
        response: error.response?.data,
        correlationId: req.correlationId,
      });
      res.status(400).json(error.response?.data || { error: error.message });
    }
  }

  static async register(req, res, next) {
    const userData = req.body;
    logger.info("Register request received", {
      userData: { ...userData, password: "***" },
      correlationId: req.correlationId,
    });
    try {
      const result = await userService.handleRegister(userData);
      res.status(200).json(result);
    } catch (error) {
      logger.error("Error in register controller", {
        error: error.message,
        response: error.response?.data,
        correlationId: req.correlationId,
      });
      res.status(400).json(error.response?.data || { error: error.message });
    }
  }

  static async refreshToken(req, res, next) {
    const { refreshToken } = req.body;
    try {
      if (!refreshToken) {
        return res.status(401).json({ error: "Refresh token is required" });
      }
      const { accessToken } = await userService.handleRefreshToken(
        refreshToken
      );
      res.json({ accessToken });
    } catch (error) {
      logger.error("Error in refreshToken controller", {
        error: error.message,
        correlationId: req.correlationId,
      });
      res.status(403).json({ error: "Invalid or expired refresh token" });
    }
  }
}
export default UserServiceController;

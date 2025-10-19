import { UserService } from "../services/user.service.js";

export class UserController {
  static async createUser(req, res) {
    try {
      const userData = req.body;
      const newUser = await UserService.createUser(userData);
      res.status(201).json(newUser);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  static async deleteUser(req, res) {
    try {
      const userId = req.params.id;
      const deletedUser = await UserService.deleteUser(userId);
      res
        .status(200)
        .json({ message: `Xóa người dùng thành công, ${deletedUser}` });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  static async validateUser(req, res) {
    try {
      const userData = req.body;
      const user = await UserService.findUserByEmail(userData.email);
      if (user) {
        res.status(400).json({ error: "Đã có người dùng sử dụng email này." });
      }
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  static async getUserById(req, res) {
    try {
      console.log("req.user:", req.user);
      const userId = req.user.id;
      const user = await UserService.findUserById(userId);
      if (!user) {
        return res.status(404).json({ error: "Không tìm thấy người dùng" });
      }
      res.status(200).json(user);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async loginUser(req, res) {
    try {
      const { email, password } = req.body;
      const user = await UserService.loginUser(email, password);
      res.status(200).json(user);
    } catch (error) {
      res.status(401).json({ error: error.message });
    }
  }

  static async saveRefreshToken(req, res) {
    try {
      const { userId, refreshToken, expiresAt } = req.body;
      await UserService.saveRefreshToken(userId, refreshToken, expiresAt);
      res.status(200).json({ message: "Refresh token saved successfully" });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }
}
